import assert from "node:assert/strict";
import { test } from "node:test";

import { buildFocusSet, createHandoverDeltaSummary, CoworkProtocolError } from "../src/index.js";

test("createHandoverDeltaSummary caps target ids at 12 and reports the omitted count", () => {
  const targetIds = Array.from({ length: 15 }, (_, index) => `form-field:q${index + 1}`);
  const delta = createHandoverDeltaSummary({
    leaseId: "grant-1",
    targetIds,
    summary: "Six new follow-up questions were drafted.",
    verifiedCount: 15,
    failedCount: 0
  });
  assert.equal(delta.targetIds.length, 12);
  assert.deepEqual(delta.targetIds, targetIds.slice(0, 12));
  assert.equal(delta.omittedTargetCount, 3);
  assert.equal(delta.metrics.totalTargetCount, 15);
  assert.equal(delta.metrics.includedTargetCount, 12);
});

test("createHandoverDeltaSummary de-duplicates repeated target ids before counting", () => {
  const delta = createHandoverDeltaSummary({
    leaseId: "grant-1",
    targetIds: ["form-field:q1", "form-field:q1", "form-field:q2"],
    summary: "Updated one question twice."
  });
  assert.deepEqual(delta.targetIds, ["form-field:q1", "form-field:q2"]);
  assert.equal(delta.omittedTargetCount, 0);
});

test("createHandoverDeltaSummary bounds an overlong summary instead of rejecting it", () => {
  const delta = createHandoverDeltaSummary({
    leaseId: "grant-1",
    targetIds: ["form-field:q1"],
    summary: "x".repeat(400)
  });
  assert.equal(delta.summary, `${"x".repeat(349)}…`);
  assert.equal(delta.metrics.summaryCharacters, 400);
  assert.equal(delta.metrics.summaryIncludedCharacters, 350);
});

test("createHandoverDeltaSummary requires the ended grant/lease id and rejects malformed targets", () => {
  assert.throws(
    () => createHandoverDeltaSummary({ leaseId: "", targetIds: [] }),
    { name: "CoworkProtocolError", code: "LEASE_SCOPE_VIOLATION" }
  );
  assert.throws(
    () => createHandoverDeltaSummary({ leaseId: "grant-1", targetIds: ["", "form-field:q1"] }),
    { name: "CoworkProtocolError", code: "CONTEXT_BUDGET_EXCEEDED" }
  );
  assert.throws(
    () => createHandoverDeltaSummary({ leaseId: "grant-1", targetIds: ["x".repeat(201)] }),
    { name: "CoworkProtocolError", code: "CONTEXT_BUDGET_EXCEEDED" }
  );
});

test("createHandoverDeltaSummary defaults verified/failed counts to zero", () => {
  const delta = createHandoverDeltaSummary({ leaseId: "grant-1", targetIds: ["form-field:q1"] });
  assert.equal(delta.verifiedCount, 0);
  assert.equal(delta.failedCount, 0);
});

test("buildFocusSet highlights up to 12 targets at once for the return moment", () => {
  const focusSet = buildFocusSet({
    sessionId: "s",
    pageVersion: 4,
    targetIds: ["form-field:q1", "form-field:q2"],
    label: "New questions",
    capabilityIds: ["form-update-field"]
  });
  assert.equal(focusSet.type, "focus-set");
  assert.equal(focusSet.source, "handover-return");
  assert.deepEqual(focusSet.targetIds, ["form-field:q1", "form-field:q2"]);
  assert.equal(focusSet.label, "New questions");
});

test("buildFocusSet fails closed on zero or too many targets", () => {
  assert.throws(
    () => buildFocusSet({ sessionId: "s", pageVersion: 1, targetIds: [] }),
    { name: "CoworkProtocolError", code: "STALE_FOCUS" }
  );
  assert.throws(
    () =>
      buildFocusSet({
        sessionId: "s",
        pageVersion: 1,
        targetIds: Array.from({ length: 13 }, (_, index) => `form-field:q${index}`)
      }),
    { name: "CoworkProtocolError", code: "CONTEXT_BUDGET_EXCEEDED" }
  );
});

test("buildFocusSet rejects malformed target ids like its handover-delta sibling", () => {
  assert.throws(
    () => buildFocusSet({ sessionId: "s", pageVersion: 1, targetIds: [null, { id: 1 }], label: "New" }),
    (error) => error instanceof CoworkProtocolError && error.code === "CONTEXT_BUDGET_EXCEEDED"
  );
});
