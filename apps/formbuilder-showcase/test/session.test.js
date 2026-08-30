import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildLeaseExpiryEffect,
  createShowcaseSession,
  nextLeaseExpiryDelay,
  transitionShowcaseSession
} from "../src/session.js";

test("the visible session distinguishes cowork, agent solo, human solo and silence", () => {
  const initial = createShowcaseSession();
  assert.deepEqual(initial, {
    humanPresence: "present",
    agentPresence: "active",
    effectiveMode: "cowork",
    attentionMode: "pointer",
    changeCausality: true,
    actionMode: "suggest",
    lease: null,
    returnSummary: null
  });

  assert.equal(
    transitionShowcaseSession(initial, { type: "SILENCE" }),
    initial,
    "silence must not create new state or a model turn"
  );

  const away = transitionShowcaseSession(initial, {
    type: "HUMAN_AWAY",
    duration: "short",
    lease: {
      leaseId: "lease-1",
      expiresAt: "2026-08-30T10:02:00.000Z"
    },
    now: "2026-08-30T10:00:00.000Z"
  });
  assert.equal(away.humanPresence, "afk-short");
  assert.equal(away.effectiveMode, "agent-solo");
  assert.deepEqual(away.lease, {
    leaseId: "lease-1",
    expiresAt: "2026-08-30T10:02:00.000Z"
  });

  const usedLease = transitionShowcaseSession(away, { type: "SOLO_ATTEMPT_STARTED" });
  const expired = transitionShowcaseSession(usedLease, {
    type: "CLOCK_TICK",
    now: "2026-08-30T10:02:00.000Z"
  });
  assert.equal(expired.effectiveMode, "idle");
  assert.equal(expired.lease, null, "an expired solo lease must be removed fail closed");
  assert.equal(expired.leaseCallsUsed, 0, "expiry must reset the lease call counter");

  const returned = transitionShowcaseSession(away, {
    type: "HUMAN_RETURNED",
    receipts: [{ status: "verified" }, { status: "failed" }],
    pendingQuestion: "Review the failed field?"
  });
  assert.equal(returned.effectiveMode, "cowork");
  assert.equal(returned.lease, null);
  assert.deepEqual(returned.returnSummary, {
    verified: 1,
    failed: 1,
    pendingQuestion: "Review the failed field?"
  });

  const paused = transitionShowcaseSession(initial, { type: "AGENT_PAUSED" });
  assert.equal(paused.agentPresence, "paused");
  assert.equal(paused.effectiveMode, "human-solo");

  const resumed = transitionShowcaseSession(paused, { type: "AGENT_RESUMED" });
  assert.equal(resumed.agentPresence, "active");
  assert.equal(resumed.effectiveMode, "cowork");
});

test("lease expiry keeps the last valid instant and fails closed on invalid timestamps", () => {
  const away = transitionShowcaseSession(createShowcaseSession(), {
    type: "HUMAN_AWAY",
    duration: "short",
    lease: {
      leaseId: "lease-boundary",
      expiresAt: "2026-08-30T10:02:00.000Z"
    },
    now: "2026-08-30T10:00:00.000Z"
  });

  const usedLease = transitionShowcaseSession(away, { type: "SOLO_ATTEMPT_STARTED" });
  const stillValid = transitionShowcaseSession(usedLease, {
    type: "CLOCK_TICK",
    now: "2026-08-30T10:01:59.999Z"
  });
  assert.equal(stillValid.effectiveMode, "agent-solo");
  assert.equal(stillValid.lease?.leaseId, "lease-boundary");
  assert.equal(stillValid.leaseCallsUsed, 1, "a valid tick must preserve consumed calls");

  const invalidExpiry = transitionShowcaseSession(
    { ...away, lease: { ...away.lease, expiresAt: "not-a-timestamp" } },
    { type: "CLOCK_TICK", now: "2026-08-30T10:01:00.000Z" }
  );
  assert.equal(invalidExpiry.effectiveMode, "idle");
  assert.equal(invalidExpiry.lease, null);

  const invalidCurrentTime = transitionShowcaseSession(away, {
    type: "CLOCK_TICK",
    now: "not-a-timestamp"
  });
  assert.equal(invalidCurrentTime.effectiveMode, "idle");
  assert.equal(invalidCurrentTime.lease, null);

  const missingLease = transitionShowcaseSession(
    { ...away, lease: undefined },
    { type: "CLOCK_TICK", now: "2026-08-30T10:01:00.000Z" }
  );
  assert.equal(missingLease.effectiveMode, "idle");
  assert.equal(missingLease.lease, null);
});

test("lease expiry effects and timer delays remain bounded and re-armable", () => {
  const lease = { expiresAt: "2026-08-30T10:02:00.000Z" };
  const now = Date.parse("2026-08-30T10:01:59.500Z");
  assert.equal(nextLeaseExpiryDelay(lease, now), 510);
  assert.equal(nextLeaseExpiryDelay(null, now), null);

  assert.deepEqual(buildLeaseExpiryEffect(lease, null), {
    leaseCallsUsed: 0,
    status: "Solo lease expired. Agent work stopped; the human is still away."
  });
  assert.equal(buildLeaseExpiryEffect(lease, lease), null);
});

test("solo attempts consume a call before verification and receipts stay bounded", () => {
  const initial = {
    ...createShowcaseSession(),
    leaseCallsUsed: 0,
    receipts: Array.from({ length: 20 }, (_, index) => ({
      offerId: `old-${index + 1}`,
      status: "verified"
    }))
  };

  const attempted = transitionShowcaseSession(initial, { type: "SOLO_ATTEMPT_STARTED" });
  assert.equal(attempted.leaseCallsUsed, 1);

  const recorded = transitionShowcaseSession(attempted, {
    type: "RECEIPT_RECORDED",
    receipt: { offerId: "latest", status: "failed" }
  });
  assert.equal(recorded.receipts.length, 20);
  assert.equal(recorded.receipts[0].offerId, "old-2");
  assert.equal(recorded.receipts.at(-1).offerId, "latest");
});
