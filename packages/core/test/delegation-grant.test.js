import assert from "node:assert/strict";
import { test } from "node:test";

import { authorizeSoloAction, CoworkProtocolError, createDelegationGrant } from "../src/index.js";

function validGrantInput(overrides = {}) {
  return {
    grantId: "grant-1",
    origin: "human-click",
    goal: "Draft good follow-up questions",
    allowedCapabilityIds: ["form-add-field"],
    allowedTargetIds: ["form-builder:canvas"],
    maxCalls: 6,
    pageVersion: 3,
    expiresAt: "2026-09-01T10:05:00.000Z",
    ...overrides
  };
}

test("createDelegationGrant returns a versioned, scoped, bounded-goal grant", () => {
  const grant = createDelegationGrant(validGrantInput());
  assert.deepEqual(grant, {
    protocolVersion: "0.1",
    type: "delegation-grant",
    grantId: "grant-1",
    leaseId: "grant-1",
    origin: "human-click",
    goal: "Draft good follow-up questions",
    allowedCapabilityIds: ["form-add-field"],
    allowedTargetIds: ["form-builder:canvas"],
    maxCalls: 6,
    maxContextLevel: null,
    pageVersion: 3,
    expiresAt: "2026-09-01T10:05:00.000Z",
    metrics: {
      goalCharacters: "Draft good follow-up questions".length,
      goalIncludedCharacters: "Draft good follow-up questions".length
    }
  });
});

test("createDelegationGrant accepts a human-utterance origin, never an agent-originated one", () => {
  const grant = createDelegationGrant(validGrantInput({ origin: "human-utterance" }));
  assert.equal(grant.origin, "human-utterance");

  for (const origin of ["agent-tool", "agent-simulated-click", undefined, "", "click"]) {
    assert.throws(
      () => createDelegationGrant(validGrantInput({ origin })),
      { name: "CoworkProtocolError", code: "HUMAN_CONFIRMATION_REQUIRED" }
    );
  }
});

test("createDelegationGrant requires a concrete, non-empty goal (GAP-07)", () => {
  assert.throws(
    () => createDelegationGrant(validGrantInput({ goal: "" })),
    { name: "CoworkProtocolError", code: "LEASE_SCOPE_VIOLATION" }
  );
  assert.throws(
    () => createDelegationGrant(validGrantInput({ goal: "   " })),
    { name: "CoworkProtocolError", code: "LEASE_SCOPE_VIOLATION" }
  );
  assert.throws(
    () => createDelegationGrant(validGrantInput({ goal: undefined })),
    { name: "CoworkProtocolError", code: "LEASE_SCOPE_VIOLATION" }
  );
});

test("createDelegationGrant bounds an overlong goal instead of rejecting it", () => {
  const grant = createDelegationGrant(validGrantInput({ goal: "x".repeat(250) }));
  assert.equal(grant.goal, `${"x".repeat(199)}…`);
  assert.equal(grant.metrics.goalCharacters, 250);
  assert.equal(grant.metrics.goalIncludedCharacters, 200);
});

test("createDelegationGrant rejects an incomplete or malformed scope", () => {
  for (const overrides of [
    { allowedCapabilityIds: [] },
    { allowedCapabilityIds: "form-add-field" },
    { allowedTargetIds: [] },
    { maxCalls: 0 },
    { maxCalls: 1.5 },
    { pageVersion: "3" },
    { expiresAt: "not-a-date" },
    { expiresAt: undefined }
  ]) {
    assert.throws(
      () => createDelegationGrant(validGrantInput(overrides)),
      { name: "CoworkProtocolError", code: "LEASE_SCOPE_VIOLATION" }
    );
  }
});

test("a grant produced by createDelegationGrant authorizes solo work through the existing lease machinery", () => {
  const grant = createDelegationGrant(
    validGrantInput({ allowedTargetIds: ["form-field:email"], allowedCapabilityIds: ["form.set_value"] })
  );
  const authorization = authorizeSoloAction({
    lease: grant,
    now: "2026-09-01T10:00:00.000Z",
    humanPresence: "present",
    agentPresence: "active",
    capabilityId: "form.set_value",
    targetId: "form-field:email",
    pageVersion: 3,
    callsUsed: 0
  });
  assert.equal(authorization.authorized, true);
  assert.equal(authorization.leaseId, "grant-1");
  assert.equal(authorization.remainingCalls, 5);
});
