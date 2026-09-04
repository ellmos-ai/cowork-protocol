import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BuilderModelSuggestionError,
  createBuilderModelSuggester,
  normalizeFieldOptions
} from "../src/builder-model-suggester.js";
import { FIELD_TYPE_PALETTE } from "../src/form-builder.mjs";

const PALETTE_IDS = FIELD_TYPE_PALETTE.map((entry) => entry.paletteId);
const PRESENCE = { humanPresence: "present", agentPresence: "active", mode: "suggest" };

function addFieldReply(value, overrides = {}) {
  return {
    message: "Here is one field.",
    speak: "",
    offers: [
      {
        capabilityId: "form-add-field",
        targetId: "form-canvas",
        value,
        summary: "Add one field",
        ...overrides
      }
    ],
    omittedOffers: 0
  };
}

/** A stand-in for the page transport that records every turn it was handed. */
function withReply(reply) {
  const turns = [];
  const sendTurn = async (turn) => {
    turns.push(turn);
    return typeof reply === "function" ? reply(turn) : reply;
  };
  return {
    turns,
    suggester: createBuilderModelSuggester({ sendTurn, paletteIds: PALETTE_IDS })
  };
}

function rejectsWith(code, pattern) {
  return (error) => {
    assert.ok(error instanceof BuilderModelSuggestionError, `expected BuilderModelSuggestionError, got ${error}`);
    assert.equal(error.code, code);
    assert.match(error.message, pattern);
    return true;
  };
}

// --- The happy path: the model's own words, never a scripted list. ---

test("returns the field the model actually proposed", async () => {
  const { suggester, turns } = withReply(addFieldReply("text-long: What should we improve?"));
  const suggestion = await suggester.suggestField({
    intent: "field",
    formTitle: "Feedback",
    existingLabels: ["Name"],
    presence: PRESENCE
  });
  assert.deepEqual(suggestion, {
    paletteId: "text-long",
    label: "What should we improve?",
    options: null,
    required: false,
    summary: "Add one field",
    message: "Here is one field.",
    rawValue: "text-long: What should we improve?"
  });
  assert.equal(turns.length, 1);
  assert.equal(turns[0].type, "conversation-turn");
});

test("matches the palette id case-insensitively but returns the canonical id", async () => {
  const { suggester } = withReply(addFieldReply("Text-Short:   Email address  "));
  const suggestion = await suggester.suggestField({ formTitle: "Signup", presence: PRESENCE });
  assert.equal(suggestion.paletteId, "text-short");
  assert.equal(suggestion.label, "Email address");
});

// --- Answer choices: the field the human described, not a label that lists it. ---

// The measured failure this contract exists for (qwen3.8:27b-mlx, 2026-09-04):
// asked for "how many kids ... options are 1 2 3 4 5 6 7 8 or more", the model
// wrote the choices into the label and the Studio kept "Option 1, Option 2".
test("carries the model's answer choices as a list, leaving the label a question", async () => {
  const { suggester } = withReply(
    addFieldReply(
      JSON.stringify({
        paletteId: "checkbox-single",
        label: "How many kids do you have?",
        options: ["1", "2", "3", "4", "5", "6", "7", "8 or more"]
      })
    )
  );
  const suggestion = await suggester.suggestField({ formTitle: "Family", presence: PRESENCE });
  assert.equal(suggestion.paletteId, "checkbox-single");
  assert.equal(suggestion.label, "How many kids do you have?");
  assert.deepEqual(suggestion.options, ["1", "2", "3", "4", "5", "6", "7", "8 or more"]);
  assert.doesNotMatch(suggestion.label, /\(/);
});

test("reads required from the JSON value and defaults it to false", async () => {
  const { suggester } = withReply(
    addFieldReply(JSON.stringify({ paletteId: "text-short", label: "Email address", required: true }))
  );
  const suggestion = await suggester.suggestField({ formTitle: "Signup", presence: PRESENCE });
  assert.equal(suggestion.required, true);
  assert.equal(suggestion.options, null);
});

test("keeps the plain \"<paletteId>: <label>\" value working, with no options", async () => {
  const { suggester } = withReply(addFieldReply("date: Preferred date"));
  const suggestion = await suggester.suggestField({ formTitle: "Booking", presence: PRESENCE });
  assert.equal(suggestion.paletteId, "date");
  assert.equal(suggestion.options, null);
});

// Fail-closed: a field still arrives, its answer choices do not, and the
// summary says why - the human never clicks a field whose options were quietly
// repaired into something they did not ask for.
test("drops answer choices the Builder cannot render and says so in the summary", async () => {
  const { suggester } = withReply(
    addFieldReply(
      JSON.stringify({
        paletteId: "checkbox-single",
        label: "How many kids do you have?",
        options: ["only one choice"]
      })
    )
  );
  const suggestion = await suggester.suggestField({ formTitle: "Family", presence: PRESENCE });
  assert.equal(suggestion.options, null);
  assert.match(suggestion.summary, /Add one field/);
  assert.match(suggestion.summary, /dropped: 1 of them, and a choice needs 2-12/);
});

test("drops answer choices offered for a field type that has none", async () => {
  const { suggester } = withReply(
    addFieldReply(JSON.stringify({ paletteId: "text-short", label: "Your name", options: ["a", "b"] }))
  );
  const suggestion = await suggester.suggestField({ formTitle: "Signup", presence: PRESENCE });
  assert.equal(suggestion.options, null);
  assert.match(suggestion.summary, /this field type has none/);
});

test("an empty options list is silence, not a fault", async () => {
  const { suggester } = withReply(
    addFieldReply(JSON.stringify({ paletteId: "text-short", label: "Your name", options: [] }))
  );
  const suggestion = await suggester.suggestField({ formTitle: "Signup", presence: PRESENCE });
  assert.equal(suggestion.options, null);
  assert.equal(suggestion.summary, "Add one field");
});

test("normalizeFieldOptions trims, de-duplicates and refuses to shorten a long choice", () => {
  assert.deepEqual(normalizeFieldOptions(["  Yes ", "yes", "No"], { allowed: true }), {
    options: ["Yes", "No"],
    notice: ""
  });
  const long = normalizeFieldOptions(["x".repeat(61), "ok"], { allowed: true });
  assert.equal(long.options, null);
  assert.match(long.notice, /longer than 60 characters/);
  assert.deepEqual(normalizeFieldOptions(undefined, { allowed: true }), { options: null, notice: "" });
  assert.match(normalizeFieldOptions("1, 2, 3", { allowed: true }).notice, /not a list/);
});

test("rejects a JSON value that never names a field type", async () => {
  const { suggester } = withReply(addFieldReply(JSON.stringify({ label: "How many kids?" })));
  await assert.rejects(
    () => suggester.suggestField({ formTitle: "Family", presence: PRESENCE }),
    rejectsWith("INVALID_MODEL_SUGGESTION", /no paletteId/)
  );
});

// --- No silent fallback: every bad answer surfaces with a code and a cause. ---

test("rejects a field type the Builder cannot create - no nearest guess", async () => {
  const { suggester } = withReply(addFieldReply("checkbox-triple: Pick three"));
  await assert.rejects(
    () => suggester.suggestField({ formTitle: "Survey", presence: PRESENCE }),
    rejectsWith("INVALID_MODEL_SUGGESTION", /checkbox-triple/)
  );
});

test("rejects a label the form already uses, case-insensitively", async () => {
  const { suggester } = withReply(addFieldReply("text-short: email address"));
  await assert.rejects(
    () => suggester.suggestField({
      formTitle: "Signup",
      existingLabels: ["Email address"],
      presence: PRESENCE
    }),
    rejectsWith("INVALID_MODEL_SUGGESTION", /already has a field labelled "email address"/)
  );
});

test("rejects an offer value that is neither shape", async () => {
  const { suggester } = withReply(addFieldReply("please add an email field"));
  await assert.rejects(
    () => suggester.suggestField({ formTitle: "Signup", presence: PRESENCE }),
    rejectsWith("INVALID_MODEL_SUGGESTION", /please add an email field/)
  );
});

test("rejects a label longer than 120 characters", async () => {
  const { suggester } = withReply(addFieldReply(`text-short: ${"x".repeat(121)}`));
  await assert.rejects(
    () => suggester.suggestField({ formTitle: "Signup", presence: PRESENCE }),
    rejectsWith("INVALID_MODEL_SUGGESTION", /got 121/)
  );
});

test("rejects a reply that carries no add-field offer, quoting what the model said", async () => {
  const { suggester } = withReply({
    message: "I would rather talk about the weather.",
    speak: "",
    offers: [],
    omittedOffers: 0
  });
  await assert.rejects(
    () => suggester.suggestField({ formTitle: "Signup", presence: PRESENCE }),
    rejectsWith("INVALID_MODEL_SUGGESTION", /rather talk about the weather/)
  );
});

test("reports an unreachable model with its original code and message", async () => {
  const transportError = Object.assign(new Error("connection refused"), { code: "MODEL_TRANSPORT_FAILED" });
  const suggester = createBuilderModelSuggester({
    sendTurn: async () => {
      throw transportError;
    },
    paletteIds: PALETTE_IDS
  });
  await assert.rejects(
    () => suggester.suggestField({ formTitle: "Signup", presence: PRESENCE }),
    (error) => {
      assert.ok(rejectsWith("MODEL_UNAVAILABLE", /MODEL_TRANSPORT_FAILED: connection refused/)(error));
      assert.equal(error.cause, transportError);
      return true;
    }
  );
});

// --- The turn itself: bounded before it leaves, and presence-faithful. ---

test("keeps the transcript inside the 350-character budget without the protocol having to cut it", async () => {
  const { suggester, turns } = withReply(addFieldReply("date: Preferred date"));
  await suggester.suggestField({
    intent: "question",
    formTitle: "F".repeat(500),
    goal: "G".repeat(300),
    existingLabels: Array.from({ length: 40 }, (_, index) => `Existing label number ${index} `.repeat(3)),
    presence: PRESENCE
  });
  const { transcript, metrics } = turns[0];
  assert.ok(transcript.length <= 350, `transcript was ${transcript.length} characters`);
  assert.equal(metrics.omittedTranscriptCharacters, 0);
  // The instruction and the full type list survive; only the caller's text is cut.
  assert.match(transcript, /capabilityId "form-add-field"/);
  for (const paletteId of PALETTE_IDS) assert.ok(transcript.includes(paletteId), `missing ${paletteId}`);
  assert.match(transcript, /…/);
});

test("asks for a survey question when the intent is a delegation draft", async () => {
  const { suggester, turns } = withReply(addFieldReply("text-short: How do you spend weekends?"));
  await suggester.suggestField({
    intent: "question",
    formTitle: "Family free time",
    goal: "Draft good follow-up questions",
    presence: PRESENCE
  });
  assert.match(turns[0].transcript, /survey question/);
  assert.match(turns[0].transcript, /Goal: Draft good follow-up questions/);

  const plain = withReply(addFieldReply("text-short: Phone number"));
  await plain.suggester.suggestField({ intent: "field", formTitle: "Family free time", presence: PRESENCE });
  assert.doesNotMatch(plain.turns[0].transcript, /survey question/);
});

test("passes the caller's presence through to the conversation turn", async () => {
  const { suggester, turns } = withReply(addFieldReply("date: Preferred date"));
  const presence = { humanPresence: "afk-short", agentPresence: "active", mode: "delegated" };
  await suggester.suggestField({ formTitle: "Signup", presence });
  assert.deepEqual(turns[0].presence, presence);
  assert.equal(turns[0].focus, null);
});
