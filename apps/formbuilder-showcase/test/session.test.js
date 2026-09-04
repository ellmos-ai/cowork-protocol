import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ACTOR_STATUS_CYCLE,
  adoptSessionState,
  buildLeaseExpiryEffect,
  createShowcaseSession,
  MODEL_STATUS_CYCLE,
  nextActorStatus,
  nextModelStatus,
  nextLeaseExpiryDelay,
  transitionShowcaseSession
} from "../src/session.js";

const LEASE = Object.freeze({
  leaseId: "lease-1",
  goal: "Complete only the focused field",
  allowedTargetIds: ["form-field:full-name"],
  expiresAt: "2026-08-30T10:02:00.000Z"
});

test("the session answers three questions per partner and derives everything else", () => {
  const initial = createShowcaseSession();

  assert.deepEqual(initial.human, { availability: "here", role: "executing", area: null });
  assert.deepEqual(initial.model, { availability: "here", role: "advising", area: null });
  assert.equal(initial.attentionMode, "pointer");
  assert.equal(initial.changeCausality, true);
  assert.equal(initial.lease, null);
  assert.equal(initial.returnSummary, null);
  for (const removed of ["actionMode", "allowParallel"]) {
    assert.equal(
      Object.hasOwn(initial, removed),
      false,
      `${removed} is derived or gone, never a separate setting`
    );
  }

  assert.equal(initial.workMode.mode, "sparring");
  assert.equal(initial.workMode.authority, "human");
  assert.equal(initial.workMode.human.canExecute, true);
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
    initial.agentEngagement,
    "observing",
    "a consumer that has to guess this field guesses wrong"
  );

  assert.equal(
    transitionShowcaseSession(initial, { type: "SILENCE" }),
    initial,
    "silence must not create new state or a model turn"
  );

  const away = transitionShowcaseSession(initial, {
    type: "HUMAN_AWAY",
    duration: "short",
    lease: LEASE,
    area: "Full name",
    now: "2026-08-30T10:00:00.000Z"
  });
  assert.deepEqual(away.human, { availability: "standby", role: "advising", area: null });
  assert.deepEqual(away.model, { availability: "here", role: "executing", area: "Full name" });
  assert.equal(away.workMode.mode, "model-solo");
  assert.equal(away.workMode.authority, "model");
  assert.equal(away.humanPresence, "afk-short");
  assert.equal(away.effectiveMode, "agent-solo");
  assert.deepEqual(away.lease, LEASE);

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
    "the grant is the evidence; without it the role is only an intent"
  );
  assert.equal(expired.workMode.mode, "idle");
  assert.equal(expired.workMode.authority, "none");
  assert.equal(expired.effectiveMode, "idle");

  const returned = transitionShowcaseSession(away, {
    type: "HUMAN_RETURNED",
    receipts: [{ status: "verified" }, { status: "failed" }],
    area: "Full name",
    pendingQuestion: "Review the failed field?"
  });
  assert.equal(returned.workMode.mode, "sparring");
  assert.equal(
    returned.workMode.authority,
    "human",
    "the hand on the mouse takes the click right back"
  );
  assert.deepEqual(returned.model, { availability: "here", role: "advising", area: null });
  assert.equal(returned.human.area, "Full name");
  assert.equal(returned.effectiveMode, "cowork");
  assert.equal(returned.lease, null);
  assert.deepEqual(returned.returnSummary, {
    verified: 1,
    failed: 1,
    pendingQuestion: "Review the failed field?"
  });

  const paused = transitionShowcaseSession(initial, { type: "AGENT_PAUSED" });
  assert.equal(paused.model.availability, "standby");
  assert.equal(paused.workMode.mode, "human-solo");
  assert.equal(paused.agentPresence, "paused");
  assert.equal(paused.effectiveMode, "human-solo");
  assert.equal(paused.workMode.model.canPropose, false);

  const resumed = transitionShowcaseSession(paused, { type: "AGENT_RESUMED" });
  assert.equal(resumed.model.availability, "here");
  assert.equal(resumed.model.role, "advising");
  assert.equal(resumed.agentPresence, "active");
  assert.equal(resumed.effectiveMode, "cowork");
});

// --- The security core. This is the rule the last round got wrong. ---

test("a model without a grant never executes, however present the human is", () => {
  const wantsToExecute = transitionShowcaseSession(createShowcaseSession(), {
    type: "SET_STATUS",
    human: { availability: "here", role: "advising", area: "Full name" },
    model: { availability: "here", role: "executing", area: "Email address" }
  });

  assert.equal(wantsToExecute.lease, null, "no grant, no lease");
  assert.equal(wantsToExecute.workMode.model.canExecute, false);
  assert.equal(wantsToExecute.workMode.model.role, "advising");
  assert.equal(wantsToExecute.workMode.authorityLapsed, true);
  assert.equal(wantsToExecute.workMode.mode, "idle");
  assert.equal(
    wantsToExecute.workMode.authority,
    "none",
    "a present human is not a substitute for the model's authority record"
  );
});

test("doubling needs two different areas, not a setting", () => {
  const both = (humanArea, modelArea) =>
    transitionShowcaseSession(
      {
        ...createShowcaseSession(),
        // A live grant: only then can the model execute at all.
        lease: { ...LEASE, expiresAt: "2999-01-01T00:00:00.000Z" }
      },
      {
        type: "SET_STATUS",
        human: { availability: "here", role: "executing", area: humanArea },
        model: { availability: "here", role: "executing", area: modelArea }
      }
    );

  const sameArea = both("Full name", "Full name");
  assert.equal(sameArea.workMode.doublingAvailable, false);
  assert.equal(sameArea.workMode.mode, "sparring");
  assert.equal(sameArea.workMode.authority, "human", "in each other's way, so the human wins");
  assert.equal(sameArea.workMode.model.role, "advising");

  const unknownArea = both("Full name", null);
  assert.equal(unknownArea.workMode.doublingAvailable, false);
  assert.equal(unknownArea.workMode.authority, "human");

  const disjoint = both("Full name", "Email address");
  assert.equal(disjoint.workMode.doublingAvailable, true);
  assert.equal(disjoint.workMode.mode, "doubling");
  assert.equal(disjoint.workMode.authority, "both");
  assert.equal(disjoint.workMode.human.canExecute, true);
  assert.equal(disjoint.workMode.model.canExecute, true);
});

test("a figure click walks one partner through its four status states", () => {
  assert.deepEqual(ACTOR_STATUS_CYCLE.map((status) => `${status.availability}:${status.role}`), [
    "here:executing",
    "here:advising",
    "standby:advising",
    "away:advising"
  ]);
  assert.deepEqual(nextActorStatus({ availability: "here", role: "executing" }), {
    availability: "here",
    role: "advising"
  });
  assert.deepEqual(nextActorStatus({ availability: "here", role: "advising" }), {
    availability: "standby",
    role: "advising"
  });
  assert.deepEqual(nextActorStatus({ availability: "standby", role: "advising" }), {
    availability: "away",
    role: "advising"
  });
  assert.deepEqual(nextActorStatus({ availability: "away", role: "advising" }), {
    availability: "here",
    role: "executing"
  });
});

test("the model's figure never cycles into away: away means it has no seat at all", () => {
  assert.deepEqual(
    MODEL_STATUS_CYCLE.map((status) => `${status.availability}:${status.role}`),
    ["here:executing", "here:advising", "standby:advising"]
  );
  // Pressing a working model parks it, and pressing it again brings it back.
  // Reaching executing from standby is the handover gesture, not another step
  // through a state that reads as "the connection is gone".
  assert.deepEqual(nextModelStatus({ availability: "here", role: "executing" }), {
    availability: "here",
    role: "advising"
  });
  assert.deepEqual(nextModelStatus({ availability: "here", role: "advising" }), {
    availability: "standby",
    role: "advising"
  });
  assert.deepEqual(nextModelStatus({ availability: "standby", role: "advising" }), {
    availability: "here",
    role: "executing"
  });
  // A model reported away because its seat is empty still starts from the
  // front, which is where the four-state cycle sent it too.
  assert.deepEqual(nextModelStatus({ availability: "away", role: "advising" }), {
    availability: "here",
    role: "executing"
  });
});

test("the everyday handover: hand over, step out, come back", () => {
  const focused = transitionShowcaseSession(createShowcaseSession(), {
    type: "SET_STATUS",
    human: { availability: "here", role: "executing", area: "Full name" }
  });

  // Handing over mints the grant and moves the area with it.
  const away = transitionShowcaseSession(focused, {
    type: "HUMAN_AWAY",
    duration: "long",
    lease: LEASE,
    area: "Full name",
    now: "2026-08-30T10:00:00.000Z"
  });
  assert.equal(away.workMode.mode, "model-solo");
  assert.equal(away.workMode.authority, "model");
  assert.equal(away.model.area, "Full name");
  assert.equal(away.humanPresence, "afk-long");

  // The human returns: authority moves back, the model advises again.
  const back = transitionShowcaseSession(away, {
    type: "HUMAN_RETURNED",
    receipts: [],
    area: "Full name"
  });
  assert.equal(back.workMode.mode, "sparring");
  assert.equal(back.workMode.authority, "human");
  assert.equal(back.workMode.model.canExecute, false);
  assert.equal(back.workMode.model.canPropose, true);
  assert.equal(back.lease, null);
});

test("lease expiry keeps the last valid instant and fails closed on invalid timestamps", () => {
  const away = transitionShowcaseSession(createShowcaseSession(), {
    type: "HUMAN_AWAY",
    duration: "short",
    lease: { ...LEASE, leaseId: "lease-boundary" },
    area: "Full name",
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

test("the clock tick carries the observed areas without touching a valid lease", () => {
  const away = transitionShowcaseSession(createShowcaseSession(), {
    type: "HUMAN_AWAY",
    duration: "short",
    lease: LEASE,
    area: "Full name",
    now: "2026-08-30T10:00:00.000Z"
  });

  const ticked = transitionShowcaseSession(away, {
    type: "CLOCK_TICK",
    now: "2026-08-30T10:01:00.000Z",
    human: { ...away.human, area: null },
    model: { ...away.model, area: "Email address" }
  });
  assert.equal(ticked.model.area, "Email address");
  assert.equal(ticked.lease?.leaseId, LEASE.leaseId);
  assert.equal(ticked.workMode.mode, "model-solo");
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
    agentPresence: "paused",
    agentEngagement: "paused"
  };
  assert.equal(stale.workMode.mode, "sparring", "the stale copy still claims sparring");

  const adopted = adoptSessionState(stale);
  assert.equal(adopted.human.availability, "standby");
  assert.equal(adopted.model.availability, "standby");
  assert.equal(adopted.workMode.mode, "idle");
  assert.equal(adopted.humanPresence, "afk-short");
  assert.equal(adopted.agentPresence, "paused");
});

test("handing a job over while staying reaches sparring-model, and only then doubling", () => {
  // The everyday flow: you name the job, the model executes inside the grant,
  // you stay and advise.
  const handedOver = transitionShowcaseSession(
    { ...createShowcaseSession(), lease: { ...LEASE, expiresAt: "2999-01-01T00:00:00.000Z" } },
    {
      type: "SET_STATUS",
      human: { availability: "here", role: "advising", area: "Email address" },
      model: { availability: "here", role: "executing", area: "Email address" }
    }
  );
  assert.equal(handedOver.workMode.mode, "sparring");
  assert.equal(handedOver.workMode.authority, "model");
  assert.equal(handedOver.workMode.model.canExecute, true);
  assert.equal(handedOver.workMode.human.canPropose, true, "the watching human advises");
  assert.equal(
    handedOver.workMode.doublingAvailable,
    false,
    "both stand on the same field, so there is nothing to double"
  );

  // Stepping onto another field makes doubling available - no setting involved.
  const movedOn = transitionShowcaseSession(handedOver, {
    type: "CLOCK_TICK",
    now: "2026-08-30T10:00:00.000Z",
    human: { ...handedOver.human, area: "Full name" }
  });
  assert.equal(movedOn.workMode.doublingAvailable, true);
  assert.equal(movedOn.lease?.leaseId, LEASE.leaseId, "a valid grant survives the tick");
});
