import assert from "node:assert/strict";
import { test } from "node:test";

import { createField } from "../src/form-builder.mjs";
import { BUILDER_CANVAS_TARGET_ID, builderFieldTargetId, createBuilderCoworkBridge } from "../src/builder-cowork.js";

// --- GAP-01/GAP-04: a container-scoped delegation grant that authorizes
// solo builder work, independent of whether the human stayed present. ---

test("startDelegation defaults to a canvas-scoped grant that authorizes solo add-field work", () => {
  const bridge = createBuilderCoworkBridge();
  const grant = bridge.startDelegation({
    origin: "human-click",
    goal: "Draft good follow-up questions",
    maxCalls: 6,
    durationMs: 120_000,
    pageVersion: 1,
    now: "2026-09-01T10:00:00.000Z"
  });
  assert.deepEqual(grant.allowedTargetIds, [BUILDER_CANVAS_TARGET_ID]);
  assert.deepEqual(grant.allowedCapabilityIds, ["form-add-field"]);
  assert.equal(grant.maxCalls, 6);
  assert.equal(bridge.hasActiveGrant("2026-09-01T10:00:01.000Z"), true);
  assert.deepEqual(bridge.readActiveGrant("2026-09-01T10:00:01.000Z"), grant);
});

test("soloExecute adds a field with no offer and no click, and authorizes it even while the human is present (GAP-01)", () => {
  const bridge = createBuilderCoworkBridge();
  bridge.startDelegation({
    origin: "human-click",
    goal: "Draft one question",
    maxCalls: 2,
    durationMs: 120_000,
    pageVersion: 1,
    now: "2026-09-01T10:00:00.000Z"
  });
  const field = createField("text-short", { label: "What does your family enjoy doing together?" });
  const result = bridge.soloExecute({
    field,
    elements: [],
    humanPresence: "present",
    currentPageVersion: 1,
    now: "2026-09-01T10:00:01.000Z"
  });
  assert.equal(result.receipt.status, "verified");
  assert.equal(result.elements.length, 1);
  assert.equal(result.elements[0].label, field.label);
  assert.equal(result.remainingCalls, 1);
});

test("soloExecute fails closed once no grant is active", () => {
  const bridge = createBuilderCoworkBridge();
  assert.throws(
    () =>
      bridge.soloExecute({
        field: createField("text-short", { label: "X" }),
        elements: [],
        humanPresence: "afk-short",
        now: "2026-09-01T10:00:00.000Z"
      }),
    { name: "CoworkProtocolError", code: "LEASE_EXPIRED" }
  );
});

test("runSoloBatch adds up to six fields in one grant - the old fixed two-call lease could not (GAP-04)", () => {
  const bridge = createBuilderCoworkBridge();
  bridge.startDelegation({
    origin: "human-click",
    goal: "Draft six good follow-up questions",
    maxCalls: 6,
    durationMs: 120_000,
    pageVersion: 1,
    now: "2026-09-01T10:00:00.000Z"
  });
  const questions = [
    "What does your family enjoy doing together?",
    "How much free time do you have on weekends?",
    "What activities would you like to try?",
    "Who usually plans family time?",
    "What is your favorite shared memory?",
    "What would make family time better?"
  ];
  const { elements, results } = bridge.runSoloBatch({
    count: 6,
    nextField: (index) => createField("text-short", { label: questions[index] }),
    elements: [],
    humanPresence: "afk-short",
    now: "2026-09-01T10:00:01.000Z"
  });
  assert.equal(elements.length, 6);
  assert.equal(results.length, 6);
  assert.ok(results.every((result) => result.receipt.status === "verified"));
  assert.equal(bridge.hasActiveGrant("2026-09-01T10:00:02.000Z"), true); // budget spent, but grant not yet ended
});

test("a grant's own successive verified calls do not trip page-version staleness, but an outside change still does", () => {
  const bridge = createBuilderCoworkBridge();
  bridge.startDelegation({
    origin: "human-click",
    goal: "Draft two questions",
    maxCalls: 3,
    durationMs: 120_000,
    pageVersion: 1,
    now: "2026-09-01T10:00:00.000Z"
  });
  // A caller that tracks its own live page version, incrementing it after
  // each of this grant's own successful calls - exactly what
  // builder-view.js's real controller.getPageVersion() does.
  let livePageVersion = 1;
  const first = bridge.soloExecute({
    field: createField("text-short", { label: "Q1" }),
    elements: [],
    humanPresence: "afk-short",
    currentPageVersion: livePageVersion,
    now: "2026-09-01T10:00:01.000Z"
  });
  assert.equal(first.receipt.status, "verified");
  livePageVersion += 1;
  // The second call, right after the first, must succeed: this grant's own
  // prior success advancing the page is not staleness.
  const second = bridge.soloExecute({
    field: createField("text-short", { label: "Q2" }),
    elements: first.elements,
    humanPresence: "afk-short",
    currentPageVersion: livePageVersion,
    now: "2026-09-01T10:00:02.000Z"
  });
  assert.equal(second.receipt.status, "verified");
  assert.equal(second.elements.length, 2);

  // Now something *else* changes the page outside this grant's own actions
  // (the human edited a field, say) - the caller's live version jumps ahead
  // of what this grant expects, and the next solo call must fail closed.
  livePageVersion += 5;
  assert.throws(
    () =>
      bridge.soloExecute({
        field: createField("text-short", { label: "Q3" }),
        elements: second.elements,
        humanPresence: "afk-short",
        currentPageVersion: livePageVersion,
        now: "2026-09-01T10:00:03.000Z"
      }),
    { name: "CoworkProtocolError", code: "STALE_PAGE_VERSION" }
  );
});

test("runSoloBatch stops at the grant's call budget instead of running unbounded", () => {
  const bridge = createBuilderCoworkBridge();
  bridge.startDelegation({
    origin: "human-click",
    goal: "Draft questions",
    maxCalls: 2,
    durationMs: 120_000,
    pageVersion: 1,
    now: "2026-09-01T10:00:00.000Z"
  });
  const { elements, results } = bridge.runSoloBatch({
    count: 6,
    nextField: (index) => createField("text-short", { label: `Q${index}` }),
    elements: [],
    humanPresence: "afk-short",
    now: "2026-09-01T10:00:01.000Z"
  });
  assert.equal(elements.length, 2);
  assert.equal(results.length, 2);
});

// --- GAP-03: a bounded return-from-handover summary and multi-target focus. ---

test("endDelegation returns a capped delta plus a focus set naming every field the grant touched", () => {
  const bridge = createBuilderCoworkBridge();
  bridge.startDelegation({
    origin: "human-click",
    goal: "Draft good follow-up questions",
    maxCalls: 6,
    durationMs: 120_000,
    pageVersion: 1,
    now: "2026-09-01T10:00:00.000Z"
  });
  const { elements } = bridge.runSoloBatch({
    count: 3,
    nextField: (index) => createField("text-short", { label: `Q${index}` }),
    elements: [],
    humanPresence: "afk-short",
    now: "2026-09-01T10:00:01.000Z"
  });
  const { delta, focusSet } = bridge.endDelegation({ pageVersion: 1, now: "2026-09-01T10:02:00.000Z" });
  assert.equal(delta.targetIds.length, 3);
  assert.equal(delta.verifiedCount, 3);
  assert.equal(delta.failedCount, 0);
  assert.ok(delta.summary.includes("3 fields added"));
  assert.deepEqual(focusSet.targetIds, elements.map((element) => builderFieldTargetId(element.id)));
  assert.equal(bridge.hasActiveGrant("2026-09-01T10:02:01.000Z"), false);
  // GAP-05: a batch return also waits for a verdict on the whole batch.
  assert.deepEqual(bridge.readAwaitingFeedback(), { offerId: delta.leaseId });
});

test("endDelegation with no fields touched returns a null focus set, not an empty one", () => {
  const bridge = createBuilderCoworkBridge();
  bridge.startDelegation({
    origin: "human-click",
    goal: "Draft questions",
    maxCalls: 2,
    durationMs: 120_000,
    pageVersion: 1,
    now: "2026-09-01T10:00:00.000Z"
  });
  const { delta, focusSet } = bridge.endDelegation({ pageVersion: 1, now: "2026-09-01T10:00:01.000Z" });
  assert.equal(delta.targetIds.length, 0);
  assert.equal(focusSet, null);
  assert.equal(bridge.readAwaitingFeedback(), null);
});

test("endDelegation fails closed when no grant is active", () => {
  const bridge = createBuilderCoworkBridge();
  assert.throws(
    () => bridge.endDelegation({ pageVersion: 1, now: "2026-09-01T10:00:00.000Z" }),
    { name: "CoworkProtocolError", code: "LEASE_EXPIRED" }
  );
});

// --- GAP-02: a human utterance under an active grant authorizes directly,
// and GAP-05: the session then waits for a feedback verdict. ---

function fieldScopedBridge(fieldId, { capabilityId = "form-update-field", maxCalls = 1 } = {}) {
  const bridge = createBuilderCoworkBridge();
  bridge.startDelegation({
    origin: "human-utterance",
    goal: "Act on this one field by voice",
    maxCalls,
    durationMs: 120_000,
    pageVersion: 1,
    allowedCapabilityIds: [capabilityId],
    allowedTargetIds: [builderFieldTargetId(fieldId)],
    now: "2026-09-01T10:00:00.000Z"
  });
  return bridge;
}

test("directiveFromUtterance applies a field-scoped mutation with no offer and no click", () => {
  const field = createField("text-short", { label: "Draft question" });
  const bridge = fieldScopedBridge(field.id);
  assert.equal(bridge.pendingOffers("2026-09-01T10:00:01.000Z").length, 0);

  const result = bridge.directiveFromUtterance({
    capabilityId: "form-update-field",
    targetId: builderFieldTargetId(field.id),
    proposedArguments: { fieldId: field.id, patch: { required: true } },
    summary: "Make it required",
    pageVersion: 1,
    elements: [field],
    now: "2026-09-01T10:00:01.000Z"
  });
  assert.equal(result.receipt.status, "verified");
  assert.equal(result.authorization.authorizationSource, "human-utterance");
  assert.equal(result.elements.find((element) => element.id === field.id).required, true);
  // No offer was ever rendered or pending - the utterance was itself the
  // authorization, not a proposal awaiting a click.
  assert.equal(bridge.pendingOffers("2026-09-01T10:00:02.000Z").length, 0);
});

test("directiveFromUtterance requires an active grant that actually covers the capability/target", () => {
  const field = createField("text-short", { label: "Draft" });
  const bridge = fieldScopedBridge(field.id, { capabilityId: "form-move-field" }); // wrong capability on purpose
  assert.throws(
    () =>
      bridge.directiveFromUtterance({
        capabilityId: "form-update-field",
        targetId: builderFieldTargetId(field.id),
        proposedArguments: { fieldId: field.id, patch: { required: true } },
        summary: "Make it required",
        pageVersion: 1,
        elements: [field],
        now: "2026-09-01T10:00:01.000Z"
      }),
    { name: "CoworkProtocolError", code: "LEASE_SCOPE_VIOLATION" }
  );
});

test("a directive requires an active delegation grant - it cannot substitute for one", () => {
  const bridge = createBuilderCoworkBridge();
  assert.throws(
    () =>
      bridge.directiveFromUtterance({
        capabilityId: "form-update-field",
        targetId: builderFieldTargetId("x"),
        proposedArguments: { fieldId: "x", patch: { required: true } },
        summary: "Make it required",
        pageVersion: 1,
        elements: [{ id: "x", type: "Textfeld (Kurz)", label: "X" }],
        now: "2026-09-01T10:00:00.000Z"
      }),
    { name: "CoworkProtocolError", code: "HUMAN_CONFIRMATION_REQUIRED" }
  );
});

test("a verified directive moves the session into awaiting-feedback (GAP-05)", () => {
  const field = createField("text-short", { label: "Draft question" });
  const bridge = fieldScopedBridge(field.id);
  assert.equal(bridge.readAwaitingFeedback(), null);

  const result = bridge.directiveFromUtterance({
    capabilityId: "form-update-field",
    targetId: builderFieldTargetId(field.id),
    proposedArguments: { fieldId: field.id, patch: { required: true } },
    summary: "Make it required",
    pageVersion: 1,
    elements: [field],
    now: "2026-09-01T10:00:01.000Z"
  });
  assert.deepEqual(bridge.readAwaitingFeedback(), { offerId: result.receipt.offerId });
});

test("recordFeedback resolves awaiting-feedback with a real human verdict", () => {
  const field = createField("text-short", { label: "Draft" });
  const bridge = fieldScopedBridge(field.id);
  const result = bridge.directiveFromUtterance({
    capabilityId: "form-update-field",
    targetId: builderFieldTargetId(field.id),
    proposedArguments: { fieldId: field.id, patch: { required: true } },
    summary: "Make it required",
    pageVersion: 1,
    elements: [field],
    now: "2026-09-01T10:00:01.000Z"
  });
  assert.deepEqual(bridge.readAwaitingFeedback(), { offerId: result.receipt.offerId });

  const feedback = bridge.recordFeedback({
    verdict: "accepted",
    pageVersion: 1,
    now: "2026-09-01T10:00:05.000Z"
  });
  assert.equal(feedback.verdict, "accepted");
  assert.equal(feedback.relatedOfferId, result.receipt.offerId);
  assert.equal(bridge.readAwaitingFeedback(), null);
});

test("recordFeedback fails closed when nothing is awaiting feedback", () => {
  const bridge = createBuilderCoworkBridge();
  assert.throws(
    () => bridge.recordFeedback({ verdict: "accepted", pageVersion: 1, now: "2026-09-01T10:00:00.000Z" }),
    { name: "CoworkProtocolError", code: "INVALID_ARGUMENTS" }
  );
});

test("a directive against a field that no longer exists fails closed before any feedback state is entered", () => {
  const field = createField("text-short", { label: "Draft" });
  // Target and arguments consistently name a field that has since been
  // removed from the canvas - a stale directive, not a mismatched target.
  const bridge = fieldScopedBridge(field.id);
  assert.throws(
    () =>
      bridge.directiveFromUtterance({
        capabilityId: "form-update-field",
        targetId: builderFieldTargetId(field.id),
        proposedArguments: { fieldId: field.id, patch: { required: true } },
        summary: "Make it required",
        pageVersion: 1,
        elements: [], // field is gone by the time the directive is processed
        now: "2026-09-01T10:00:01.000Z"
      }),
    { name: "CoworkProtocolError", code: "STALE_FOCUS" }
  );
  assert.equal(bridge.readAwaitingFeedback(), null);
});

// --- Review fixes 2026-09-03: expiry, call budget, live page version, receipt counting ---

test("readActiveGrant reports an expired grant as gone, so the UI cannot stay delegated forever", () => {
  const bridge = createBuilderCoworkBridge();
  bridge.startDelegation({
    origin: "human-click",
    goal: "Draft one question",
    maxCalls: 1,
    durationMs: 15_000,
    pageVersion: 1,
    now: "2026-09-01T10:00:00.000Z"
  });
  assert.notEqual(bridge.readActiveGrant("2026-09-01T10:00:10.000Z"), null);
  assert.equal(bridge.readActiveGrant("2026-09-01T10:10:00.000Z"), null);
});

test("a directive consumes the grant's call budget, and releaseGrant keeps the pending verdict", () => {
  const field = createField("text-short", { label: "Draft question" });
  const bridge = fieldScopedBridge(field.id, { maxCalls: 1 });
  const directive = {
    capabilityId: "form-update-field",
    targetId: builderFieldTargetId(field.id),
    summary: "Make it required",
    pageVersion: 1,
    now: "2026-09-01T10:00:01.000Z"
  };
  const first = bridge.directiveFromUtterance({
    ...directive,
    proposedArguments: { fieldId: field.id, patch: { required: true } },
    elements: [field]
  });
  assert.equal(first.receipt.status, "verified");
  assert.throws(
    () =>
      bridge.directiveFromUtterance({
        ...directive,
        proposedArguments: { fieldId: field.id, patch: { required: false } },
        elements: first.elements
      }),
    (error) => error.code === "LEASE_EXPIRED"
  );
  bridge.releaseGrant();
  assert.equal(bridge.readActiveGrant("2026-09-01T10:00:02.000Z"), null);
  assert.deepEqual(bridge.readAwaitingFeedback(), { offerId: first.receipt.offerId });
});

test("runSoloBatch with a live page version adds every field instead of failing on the second call", () => {
  const bridge = createBuilderCoworkBridge();
  bridge.startDelegation({
    origin: "human-click",
    goal: "Draft three questions",
    maxCalls: 3,
    durationMs: 120_000,
    pageVersion: 7,
    now: "2026-09-01T10:00:00.000Z"
  });
  const { elements, results } = bridge.runSoloBatch({
    count: 3,
    nextField: (index) => createField("text-short", { label: `Question ${index + 1}` }),
    elements: [],
    humanPresence: "afk-short",
    currentPageVersion: 7,
    now: "2026-09-01T10:00:01.000Z"
  });
  assert.equal(results.length, 3);
  assert.ok(results.every((result) => result.receipt.status === "verified"));
  assert.equal(elements.length, 3);
});

test("endDelegation counts every verified call of a twelve-call batch", () => {
  const bridge = createBuilderCoworkBridge();
  bridge.startDelegation({
    origin: "human-click",
    goal: "Draft twelve questions",
    maxCalls: 12,
    durationMs: 120_000,
    pageVersion: 1,
    now: "2026-09-01T10:00:00.000Z"
  });
  const { results } = bridge.runSoloBatch({
    count: 12,
    nextField: (index) => createField("text-short", { label: `Question ${index + 1}` }),
    elements: [],
    humanPresence: "afk-short",
    now: "2026-09-01T10:00:01.000Z"
  });
  assert.equal(results.length, 12);
  const { delta } = bridge.endDelegation({ pageVersion: 13, now: "2026-09-01T10:00:02.000Z" });
  assert.equal(delta.verifiedCount, 12);
  assert.equal(delta.targetIds.length, 12);
});
