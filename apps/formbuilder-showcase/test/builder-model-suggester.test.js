import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BuilderModelSuggestionError,
  createBuilderModelSuggester
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

test("rejects an offer value that is not \"<paletteId>: <label>\"", async () => {
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
