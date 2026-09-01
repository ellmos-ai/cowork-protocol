import assert from "node:assert/strict";
import { test } from "node:test";

import { createDelegationGrant } from "../../core/src/index.js";
import {
  BUILDER_CANVAS_TARGET_ID,
  builderFieldTargetId,
  planSoloBuilderFieldMutation
} from "../src/index.js";

function canvasGrant(overrides = {}) {
  return createDelegationGrant({
    grantId: "grant-builder-1",
    origin: "human-click",
    goal: "Draft good follow-up questions",
    allowedCapabilityIds: ["form-add-field"],
    allowedTargetIds: [BUILDER_CANVAS_TARGET_ID],
    maxCalls: 6,
    pageVersion: 1,
    expiresAt: "2026-09-01T10:05:00.000Z",
    ...overrides
  });
}

function soloRequest(overrides = {}) {
  return {
    lease: canvasGrant(),
    now: "2026-09-01T10:00:00.000Z",
    humanPresence: "afk-short",
    agentPresence: "active",
    capabilityId: "form-add-field",
    targetId: BUILDER_CANVAS_TARGET_ID,
    pageVersion: 1,
    callsUsed: 0,
    proposedArguments: { field: { id: "new-field", type: "Textfeld (Kurz)", label: "Q1" } },
    currentElements: [],
    ...overrides
  };
}

test("a container-scoped grant plans a form-add-field mutation without any offer or click", () => {
  const plan = planSoloBuilderFieldMutation(soloRequest());
  assert.equal(plan.operation, "add-field");
  assert.equal(plan.field.id, "new-field");
  assert.equal(plan.index, 0);
  assert.equal(plan.undoAvailable, true);
  assert.equal(plan.authorization.authorizationSource, "solo-lease");
  assert.equal(plan.authorization.remainingCalls, 5);
});

test("a container-scoped grant authorizes solo work even while the human is present (GAP-01 reused)", () => {
  const plan = planSoloBuilderFieldMutation(soloRequest({ humanPresence: "present" }));
  assert.equal(plan.authorization.authorized, true);
});

test("each call consumes the grant's call budget and fails closed once exhausted", () => {
  const grant = canvasGrant({ maxCalls: 2 });
  planSoloBuilderFieldMutation(soloRequest({ lease: grant, callsUsed: 0 }));
  planSoloBuilderFieldMutation(soloRequest({ lease: grant, callsUsed: 1 }));
  assert.throws(
    () => planSoloBuilderFieldMutation(soloRequest({ lease: grant, callsUsed: 2 })),
    { name: "CoworkProtocolError", code: "LEASE_EXPIRED" }
  );
});

test("a solo mutation outside the grant's capability scope fails closed", () => {
  const grant = canvasGrant({ allowedCapabilityIds: ["form-update-field"] });
  assert.throws(
    () => planSoloBuilderFieldMutation(soloRequest({ lease: grant })),
    { name: "CoworkProtocolError", code: "LEASE_SCOPE_VIOLATION" }
  );
});

test("form-add-field still cannot target anything but the canvas, even under a valid grant", () => {
  const grant = canvasGrant({ allowedTargetIds: [builderFieldTargetId("some-field")] });
  assert.throws(
    () =>
      planSoloBuilderFieldMutation(
        soloRequest({ lease: grant, targetId: builderFieldTargetId("some-field") })
      ),
    { name: "CoworkProtocolError", code: "STALE_FOCUS" }
  );
});

test("form-update-field/form-move-field under a field-scoped grant plan against the named field", () => {
  const existing = [{ id: "a", type: "Textfeld (Kurz)", label: "A", required: false }];
  const grant = createDelegationGrant({
    grantId: "grant-field-1",
    origin: "human-utterance",
    goal: "Mark this required",
    allowedCapabilityIds: ["form-update-field"],
    allowedTargetIds: [builderFieldTargetId("a")],
    maxCalls: 1,
    pageVersion: 1,
    expiresAt: "2026-09-01T10:05:00.000Z"
  });
  const plan = planSoloBuilderFieldMutation({
    lease: grant,
    now: "2026-09-01T10:00:00.000Z",
    humanPresence: "present",
    agentPresence: "active",
    capabilityId: "form-update-field",
    targetId: builderFieldTargetId("a"),
    pageVersion: 1,
    callsUsed: 0,
    proposedArguments: { fieldId: "a", patch: { required: true } },
    currentElements: existing
  });
  assert.equal(plan.operation, "update-field");
  assert.equal(plan.fieldId, "a");
  assert.deepEqual(plan.patch, { required: true });
});

test("a lease without a real human-originated grant cannot authorize solo builder work", () => {
  assert.throws(
    () => planSoloBuilderFieldMutation(soloRequest({ lease: { ...canvasGrant(), origin: "agent-tool" } })),
    { name: "CoworkProtocolError", code: "HUMAN_CONFIRMATION_REQUIRED" }
  );
});

test("an unknown capability is rejected before the grant is even consulted", () => {
  assert.throws(
    () => planSoloBuilderFieldMutation(soloRequest({ capabilityId: "form.explain_field" })),
    { name: "CoworkProtocolError", code: "CAPABILITY_UNAVAILABLE" }
  );
});
