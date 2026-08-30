import assert from "node:assert/strict";
import { test } from "node:test";

import { createShowcaseSession, transitionShowcaseSession } from "../src/session.js";

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

  const expired = transitionShowcaseSession(away, {
    type: "CLOCK_TICK",
    now: "2026-08-30T10:02:00.000Z"
  });
  assert.equal(expired.effectiveMode, "idle");

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
