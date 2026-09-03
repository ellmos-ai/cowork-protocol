import assert from "node:assert/strict";
import { test } from "node:test";

import { adviseCommentForHumanChange } from "../src/advisor-comment.js";

function humanChange(overrides = {}) {
  return {
    type: "change",
    source: "human",
    targetIds: ["form-field:email"],
    shortSummary: "Email address changed",
    ...overrides
  };
}

function validInput(overrides = {}) {
  return {
    change: humanChange(),
    advising: true,
    label: "Email address",
    required: true,
    emptyRequiredOtherCount: 1,
    ...overrides
  };
}

// --- GAP-06: appears on a human change while the model is advising.
// "Advising" is the merged explain+suggest state: commenting and proposing
// are one role, not two selectable action modes. ---

test("returns a comment for a human-sourced change while the model is advising", () => {
  const comment = adviseCommentForHumanChange(validInput());
  assert.equal(typeof comment, "string");
  assert.ok(comment.length > 0);
  assert.ok(comment.includes("Email address"));
});

test("mentions how many other required fields are still empty", () => {
  const comment = adviseCommentForHumanChange(validInput({ emptyRequiredOtherCount: 2 }));
  assert.match(comment, /2 other required field/);
});

test("says all required fields are filled when none remain empty", () => {
  const comment = adviseCommentForHumanChange(validInput({ emptyRequiredOtherCount: 0 }));
  assert.match(comment, /All required fields now have a value/);
});

test("describes an optional field differently from a required one", () => {
  const comment = adviseCommentForHumanChange(
    validInput({ required: false, label: "Access needs", emptyRequiredOtherCount: 0 })
  );
  assert.match(comment, /optional/);
  assert.doesNotMatch(comment, /required field/);
});

// --- Must NOT appear: agent-caused change, a model that is not advising
// (it holds the click right, or is on standby / disconnected), silence. ---

test("returns null for an agent-caused change - only human changes get a comment", () => {
  assert.equal(adviseCommentForHumanChange(validInput({ change: humanChange({ source: "agent" }) })), null);
});

test("returns null while the model is not advising", () => {
  // false covers every non-advising case at once: the model holds the click
  // right (cowork-model, parallel, model-solo) or it is standby / away.
  assert.equal(adviseCommentForHumanChange(validInput({ advising: false })), null);
  assert.equal(adviseCommentForHumanChange(validInput({ advising: undefined })), null);
});

test("returns null when there is no change at all (silence or an unchanged value)", () => {
  assert.equal(adviseCommentForHumanChange(validInput({ change: null })), null);
  assert.equal(adviseCommentForHumanChange(validInput({ change: undefined })), null);
});

test("returns null when the field label is unknown", () => {
  assert.equal(adviseCommentForHumanChange(validInput({ label: "" })), null);
  assert.equal(adviseCommentForHumanChange(validInput({ label: undefined })), null);
});

// --- Bounded like every other Cowork-adjacent text, even though the template
// is normally well under the limit. ---

test("never exceeds the 350-character comment budget", () => {
  const comment = adviseCommentForHumanChange(validInput({ label: "x".repeat(400) }));
  assert.ok(comment.length <= 350);
});
