import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ACTOR_STATUS_CYCLE,
  adoptSessionState,
  buildLeaseExpiryEffect,
  createShowcaseSession,
  nextActorStatus,
  nextLeaseExpiryDelay,
  transitionShowcaseSession
} from "../src/session.js";

test("the session carries two status variables per actor and derives everything else", () => {
  const initial = createShowcaseSession();

  assert.deepEqual(initial.human, { availability: "here", role: "acting" });
  assert.deepEqual(initial.model, { availability: "here", role: "observing" });
  assert.equal(initial.allowParallel, false);
  assert.equal(initial.attentionMode, "pointer");
  assert.equal(initial.changeCausality, true);
  assert.equal(initial.lease, null);
  assert.equal(initial.returnSummary, null);
  assert.equal(
    Object.hasOwn(initial, "actionMode"),
    false,
    "action rights are derived, never a separate setting"
  );

  assert.equal(initial.workMode.mode, "cowork");
  assert.equal(initial.workMode.authority, "human");
  assert.equal(initial.workMode.human.canExecute, true);
  assert.equal(initial.workMode.human.canPropose, false);
  assert.equal(initial.workMode.model.canExecute, false);
  assert.equal(
    initial.workMode.model.canPropose,
    true,
    "advising is one state: the model comments and proposes"
  );

  // 0.1 wire mirrors stay intact for presence events, leases and WebMCP.
  assert.equal(initial.humanPresence, "present");
  assert.equal(initial.agentPresence, "active");
  assert.equal(initial.effectiveMode, "cowork");
  assert.equal(
    Object.hasOwn(initial, "agentEngagement"),
    false,
    "the Desktop Companion owns agentEngagement on the replicated state"
  );

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
  assert.deepEqual(away.human, { availability: "standby", role: "observing" });
  assert.deepEqual(away.model, { availability: "here", role: "acting" });
  assert.equal(away.workMode.mode, "model-solo");
  assert.equal(away.workMode.authority, "model");
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
  assert.equal(expired.lease, null, "an expired solo lease must be removed fail closed");
  assert.equal(expired.leaseCallsUsed, 0, "expiry must reset the lease call counter");
  assert.equal(
    expired.workMode.authorityLapsed,
    true,
    "the lease is the evidence; without it the role is only an intent"
  );
  assert.equal(expired.workMode.mode, "idle");
  assert.equal(expired.workMode.authority, "none");
  assert.equal(expired.effectiveMode, "idle");

  const returned = transitionShowcaseSession(away, {
    type: "HUMAN_RETURNED",
    receipts: [{ status: "verified" }, { status: "failed" }],
    pendingQuestion: "Review the failed field?"
  });
  assert.equal(returned.workMode.mode, "cowork");
  assert.equal(
    returned.workMode.authority,
    "human",
    "the hand on the mouse takes the click right back"
  );
  assert.deepEqual(returned.model, { availability: "here", role: "observing" });
  assert.equal(returned.effectiveMode, "cowork");
  assert.equal(returned.lease, null);
  assert.deepEqual(returned.returnSummary, {
    verified: 1,
    failed: 1,
    pendingQuestion: "Review the failed field?"
  });

  const paused = transitionShowcaseSession(initial, { type: "AGENT_PAUSED" });
  assert.deepEqual(paused.model, { availability: "standby", role: "observing" });
  assert.equal(paused.workMode.mode, "human-solo");
  assert.equal(paused.agentPresence, "paused");
  assert.equal(paused.effectiveMode, "human-solo");
  assert.equal(paused.workMode.model.canPropose, false);

  const resumed = transitionShowcaseSession(paused, { type: "AGENT_RESUMED" });
  assert.deepEqual(resumed.model, { availability: "here", role: "observing" });
  assert.equal(resumed.agentPresence, "active");
  assert.equal(resumed.effectiveMode, "cowork");
});

test("simultaneous work needs an explicit allowance; otherwise the human keeps authority", () => {
  const bothActing = {
    type: "SET_STATUS",
    human: { availability: "here", role: "acting" },
    model: { availability: "here", role: "acting" }
  };

  const conflicted = transitionShowcaseSession(createShowcaseSession(), bothActing);
  assert.equal(conflicted.workMode.mode, "cowork");
  assert.equal(conflicted.workMode.authority, "human");
  assert.equal(
    conflicted.workMode.model.role,
    "observing",
    "a model that may not act at the same time falls back to advising"
  );

  const parallel = transitionShowcaseSession(
    transitionShowcaseSession(createShowcaseSession(), {
      type: "SET_STATUS",
      allowParallel: true
    }),
    bothActing
  );
  assert.equal(parallel.workMode.mode, "parallel");
  assert.equal(parallel.workMode.authority, "both");
  assert.equal(parallel.workMode.human.canExecute, true);
  assert.equal(parallel.workMode.model.canExecute, true);
});

test("a figure click walks one actor through its four status states", () => {
  assert.deepEqual(ACTOR_STATUS_CYCLE.map((status) => status.availability), [
    "here",
    "here",
    "standby",
    "away"
  ]);
  assert.deepEqual(nextActorStatus({ availability: "here", role: "acting" }), {
    availability: "here",
    role: "observing"
  });
  assert.deepEqual(nextActorStatus({ availability: "here", role: "observing" }), {
    availability: "standby",
    role: "observing"
  });
  assert.deepEqual(nextActorStatus({ availability: "standby", role: "observing" }), {
    availability: "away",
    role: "observing"
  });
  assert.deepEqual(nextActorStatus({ availability: "away", role: "observing" }), {
    availability: "here",
    role: "acting"
  });
});

test("the everyday handover: model works, human steps out, human comes back", () => {
  // The human prompts and then watches while the model does the work.
  const modelWorking = transitionShowcaseSession(createShowcaseSession(), {
    type: "SET_STATUS",
    human: { availability: "here", role: "observing" },
    model: { availability: "here", role: "acting" }
  });
  assert.equal(modelWorking.workMode.mode, "cowork");
  assert.equal(modelWorking.workMode.authority, "model");
  assert.equal(modelWorking.workMode.human.canPropose, true, "the watching human advises");
  assert.equal(modelWorking.workMode.model.canExecute, true);

  // The human signs off and hands over a scoped job.
  const away = transitionShowcaseSession(modelWorking, {
    type: "HUMAN_AWAY",
    duration: "long",
    lease: { leaseId: "lease-7", expiresAt: "2026-08-30T10:02:00.000Z" },
    now: "2026-08-30T10:00:00.000Z"
  });
  assert.equal(away.workMode.mode, "model-solo");
  assert.equal(away.workMode.authority, "model");
  assert.equal(away.humanPresence, "afk-long");

  // The human returns: authority moves back, the model advises again.
  const back = transitionShowcaseSession(away, { type: "HUMAN_RETURNED", receipts: [] });
  assert.equal(back.workMode.mode, "cowork");
  assert.equal(back.workMode.authority, "human");
  assert.equal(back.workMode.human.canExecute, true);
  assert.equal(back.workMode.model.canExecute, false);
  assert.equal(back.workMode.model.canPropose, true);
  assert.equal(back.lease, null);
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

test("a state that came back from a Companion replica re-derives its work mode", () => {
  const stale = {
    ...createShowcaseSession(),
    // The Companion mutates the 0.1 fields directly and leaves the matrix it
    // does not know about untouched.
    humanPresence: "afk-short",
    agentPresence: "paused"
  };
  assert.equal(stale.workMode.mode, "cowork", "the stale copy still claims cowork");

  const adopted = adoptSessionState(stale);
  assert.deepEqual(adopted.human, { availability: "standby", role: "observing" });
  assert.deepEqual(adopted.model, { availability: "standby", role: "observing" });
  assert.equal(adopted.workMode.mode, "idle");
  assert.equal(adopted.humanPresence, "afk-short");
  assert.equal(adopted.agentPresence, "paused");
});
