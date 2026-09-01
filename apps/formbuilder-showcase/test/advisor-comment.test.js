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
    actionMode: "explain",
    agentPresence: "active",
    label: "Email address",
    required: true,
    emptyRequiredOtherCount: 1,
    ...overrides
  };
}

// --- GAP-06: appears on a human change, in Advise ("explain") mode. ---

test("returns a comment for a human-sourced change while in explain (advise) mode", () => {
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

// --- Must NOT appear: agent-caused change, non-advise mode, paused agent, silence. ---

test("returns null for an agent-caused change - only human changes get a comment", () => {
  assert.equal(adviseCommentForHumanChange(validInput({ change: humanChange({ source: "agent" }) })), null);
});

test("returns null outside explain (advise) mode", () => {
  for (const actionMode of ["suggest", "delegated", "paused"]) {
    assert.equal(adviseCommentForHumanChange(validInput({ actionMode })), null);
  }
});

test("returns null while the agent is paused, even in explain mode", () => {
  assert.equal(adviseCommentForHumanChange(validInput({ agentPresence: "paused" })), null);
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
