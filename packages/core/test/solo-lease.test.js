import assert from "node:assert/strict";
import { test } from "node:test";

import { authorizeSoloAction } from "../src/index.js";

const lease = {
  leaseId: "lease-1",
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
  assert.throws(() => authorizeSoloAction({ ...validRequest, ...overrides }), {
    name: "CoworkProtocolError",
    code
  });
}

test("a solo lease authorizes only an active action inside every human-approved limit", () => {
  assert.deepEqual(authorizeSoloAction(validRequest), {
    authorized: true,
    authorizationSource: "solo-lease",
    leaseId: "lease-1",
    remainingCalls: 0
  });

  expectCode({ humanPresence: "present" }, "CANCELLED");
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
