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
    lease: { leaseId: "lease-1" }
  });
  assert.equal(away.humanPresence, "afk-short");
  assert.equal(away.effectiveMode, "agent-solo");
  assert.deepEqual(away.lease, { leaseId: "lease-1" });

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
