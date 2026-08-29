import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createChangeEvent,
  createFeedbackEvent
} from "../src/index.js";

test("a change event keeps explicit causality while bounding human-readable context", () => {
  const event = createChangeEvent({
    changeId: "change-9",
    source: "agent",
    targetIds: ["form-field:name"],
    pageVersion: 9,
    beforeDigest: "before-digest",
    afterDigest: "after-digest",
    shortSummary: "x".repeat(351),
    causeRefs: ["offer:offer-4", "authorization:human-click"],
    causalityConfidence: "high",
    reversible: true,
    undoCapabilityId: "form.set_value"
  });

  assert.equal(event.protocolVersion, "0.1");
  assert.equal(event.type, "change");
  assert.equal(event.source, "agent");
  assert.equal(event.shortSummary.length, 350);
  assert.equal(event.shortSummary.endsWith("…"), true);
  assert.deepEqual(event.causeRefs, [
    "offer:offer-4",
    "authorization:human-click"
  ]);
  assert.equal(event.causalityConfidence, "high");
  assert.deepEqual(event.metrics, {
    summaryCharacters: 351,
    summaryIncludedCharacters: 350
  });
});

test("change causality rejects unknown sources and confidence claims", () => {
  const valid = {
    changeId: "change-1",
    source: "human",
    targetIds: ["form-field:name"],
    pageVersion: 2,
    beforeDigest: "before",
    afterDigest: "after",
    shortSummary: "Name changed",
    causeRefs: ["ui:input"],
    causalityConfidence: "high",
    reversible: true
  };

  assert.throws(
    () => createChangeEvent({ ...valid, source: "system" }),
    { name: "CoworkProtocolError", code: "INVALID_CHANGE_SOURCE" }
  );
  assert.throws(
    () => createChangeEvent({ ...valid, causalityConfidence: "certain" }),
    { name: "CoworkProtocolError", code: "INVALID_CAUSALITY_CONFIDENCE" }
  );
  assert.throws(
    () => createChangeEvent({
      ...valid,
      causeRefs: Array.from({ length: 9 }, (_, index) => `cause-${index}`)
    }),
    { name: "CoworkProtocolError", code: "CONTEXT_BUDGET_EXCEEDED" }
  );
  assert.throws(
    () => createChangeEvent({ ...valid, causeRefs: ["c".repeat(121)] }),
    { name: "CoworkProtocolError", code: "CONTEXT_BUDGET_EXCEEDED" }
  );
});

test("only a human click can create bounded feedback for an observed change", () => {
  const event = createFeedbackEvent({
    origin: "human-click",
    relatedOfferId: "offer-4",
    relatedChangeIds: ["change-9"],
    verdict: "revise",
    adjustment: "lighter ".repeat(60),
    pageVersion: 9,
    createdAt: "2026-08-30T10:02:00.000Z"
  });

  assert.equal(event.protocolVersion, "0.1");
  assert.equal(event.type, "feedback");
  assert.equal(event.source, "human");
  assert.equal(event.origin, "human-click");
  assert.equal(event.adjustment.length, 350);
  assert.equal(event.adjustment.endsWith("…"), true);
  assert.deepEqual(event.relatedChangeIds, ["change-9"]);
  assert.deepEqual(event.metrics, {
    adjustmentCharacters: 480,
    adjustmentIncludedCharacters: 350
  });

  assert.throws(
    () => createFeedbackEvent({
      ...event,
      origin: "agent-tool",
      adjustment: "looks good"
    }),
    { name: "CoworkProtocolError", code: "HUMAN_CONFIRMATION_REQUIRED" }
  );
  assert.throws(
    () => createFeedbackEvent({
      ...event,
      origin: "human-click",
      verdict: "maybe",
      adjustment: ""
    }),
    { name: "CoworkProtocolError", code: "INVALID_FEEDBACK_VERDICT" }
  );
  assert.throws(
    () => createFeedbackEvent({
      ...event,
      origin: "human-click",
      relatedChangeIds: Array.from({ length: 9 }, (_, index) => `change-${index}`),
      adjustment: ""
    }),
    { name: "CoworkProtocolError", code: "CONTEXT_BUDGET_EXCEEDED" }
  );
});
