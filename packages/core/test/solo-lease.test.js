import assert from "node:assert/strict";
import { test } from "node:test";

import { authorizeSoloAction, CoworkProtocolError } from "../src/index.js";

const lease = {
  leaseId: "lease-1",
  origin: "human-click",
  goal: "Complete the selected form field",
  allowedCapabilityIds: ["form.set_value"],
  allowedTargetIds: ["field.email"],
  maxCalls: 2,
  maxContextLevel: 2,
  pageVersion: 4,
  expiresAt: "2026-08-30T10:05:00.000Z"
};

const validRequest = {
  lease,
  now: "2026-08-30T10:00:00.000Z",
  humanPresence: "afk-short",
  agentPresence: "active",
  capabilityId: "form.set_value",
  targetId: "field.email",
  pageVersion: 4,
  callsUsed: 1
};

function expectCode(overrides, code) {
  assert.throws(
    () => authorizeSoloAction({ ...validRequest, ...overrides }),
    (error) => error instanceof CoworkProtocolError && error.code === code
  );
}

test("a solo lease authorizes only an active action inside every human-approved limit", () => {
  assert.deepEqual(authorizeSoloAction(validRequest), {
    authorized: true,
    authorizationSource: "solo-lease",
    leaseId: "lease-1",
    remainingCalls: 0
  });

  expectCode({ agentPresence: "paused" }, "SESSION_PAUSED");
  expectCode({ now: "2026-08-30T10:05:00.000Z" }, "LEASE_EXPIRED");
  expectCode({ callsUsed: 2 }, "LEASE_EXPIRED");
  expectCode({ capabilityId: "form.submit" }, "LEASE_SCOPE_VIOLATION");
  expectCode({ targetId: "field.name" }, "LEASE_SCOPE_VIOLATION");
  expectCode({ pageVersion: 5 }, "STALE_PAGE_VERSION");
  expectCode({ humanPresence: "offline" }, "INVALID_HUMAN_PRESENCE");
  expectCode({ agentPresence: "background" }, "INVALID_AGENT_PRESENCE");
  expectCode({ now: "not-a-date" }, "LEASE_EXPIRED");
});

test("solo lease call counters require non-negative integer attempts and a positive integer limit", () => {
  expectCode({ callsUsed: -1 }, "LEASE_SCOPE_VIOLATION");
  expectCode({ callsUsed: 0.5 }, "LEASE_SCOPE_VIOLATION");
  expectCode(
    { callsUsed: 0, lease: { ...lease, maxCalls: 0 } },
    "LEASE_SCOPE_VIOLATION"
  );
  expectCode(
    { callsUsed: 1, lease: { ...lease, maxCalls: 1.5 } },
    "LEASE_SCOPE_VIOLATION"
  );
});

test("malformed solo leases fail closed with the protocol error type", () => {
  expectCode({ lease: undefined }, "LEASE_SCOPE_VIOLATION");
  expectCode(
    { lease: { ...lease, allowedCapabilityIds: "form.set_value" } },
    "LEASE_SCOPE_VIOLATION"
  );
  expectCode(
    { lease: { ...lease, allowedTargetIds: null } },
    "LEASE_SCOPE_VIOLATION"
  );
});

// --- GAP-01: presence says who is there, not who may act. ---

test("a delegation grant authorizes solo work even while the human is present", () => {
  assert.deepEqual(authorizeSoloAction({ ...validRequest, humanPresence: "present" }), {
    authorized: true,
    authorizationSource: "solo-lease",
    leaseId: "lease-1",
    remainingCalls: 0
  });
});

test("a lease without a real human-originated grant cannot authorize solo work", () => {
  expectCode({ lease: { ...lease, origin: undefined } }, "HUMAN_CONFIRMATION_REQUIRED");
  expectCode({ lease: { ...lease, origin: "agent-tool" } }, "HUMAN_CONFIRMATION_REQUIRED");
  expectCode({ lease: { ...lease, origin: "agent-simulated-click" } }, "HUMAN_CONFIRMATION_REQUIRED");
});

test("a delegation grant accepts a human utterance origin, not only a click", () => {
  assert.deepEqual(
    authorizeSoloAction({ ...validRequest, lease: { ...lease, origin: "human-utterance" } }),
    {
      authorized: true,
      authorizationSource: "solo-lease",
      leaseId: "lease-1",
      remainingCalls: 0
    }
  );
});
