import assert from "node:assert/strict";
import { test } from "node:test";

import { createPresenceEvent, resolvePresenceMode } from "../src/index.js";

test("presence is exposed as a compact protocol event with an effective mode", () => {
  assert.deepEqual(
    createPresenceEvent({
      humanPresence: "afk-short",
      agentPresence: "active",
      leaseValid: true,
      reason: "Human granted a two-minute field task",
      changedBy: "human"
    }),
    {
      protocolVersion: "0.1",
      type: "presence",
      humanPresence: "afk-short",
      agentPresence: "active",
      effectiveMode: "agent-solo",
      reason: "Human granted a two-minute field task",
      changedBy: "human",
      grant: null
    }
  );
});

test("presence carries the grant a solo agent has to read its targets from", () => {
  const grant = {
    goal: "Fill in the visible form fields",
    targetIds: ["form-field:full-name", "form-field:email"],
    targetCount: 2,
    capabilityIds: ["form.set_value"],
    callsUsed: 0,
    maxCalls: 6,
    expiresAt: "2026-09-04T00:02:00.000Z"
  };
  assert.deepEqual(
    createPresenceEvent({
      humanPresence: "afk-short",
      agentPresence: "active",
      leaseValid: true,
      reason: grant.goal,
      changedBy: "human",
      grant
    }).grant,
    grant
  );
});

test("presence combinations resolve to the four visible collaboration modes", () => {
  const cases = [
    {
      input: { humanPresence: "present", agentPresence: "active", leaseValid: false },
      expected: "cowork"
    },
    {
      input: { humanPresence: "afk-short", agentPresence: "active", leaseValid: true },
      expected: "agent-solo"
    },
    {
      input: { humanPresence: "present", agentPresence: "paused", leaseValid: false },
      expected: "human-solo"
    },
    {
      input: { humanPresence: "afk-long", agentPresence: "paused", leaseValid: false },
      expected: "idle"
    },
    {
      input: { humanPresence: "afk-long", agentPresence: "active", leaseValid: false },
      expected: "idle"
    }
  ];

  for (const { input, expected } of cases) {
    assert.equal(resolvePresenceMode(input), expected);
  }
});

test("unknown presence values fail closed instead of granting a work mode", () => {
  assert.throws(
    () =>
      resolvePresenceMode({
        humanPresence: "offline",
        agentPresence: "active",
        leaseValid: true
      }),
    {
      name: "CoworkProtocolError",
      code: "INVALID_HUMAN_PRESENCE"
    }
  );

  assert.throws(
    () =>
      resolvePresenceMode({
        humanPresence: "present",
        agentPresence: "working-in-background",
        leaseValid: false
      }),
    {
      name: "CoworkProtocolError",
      code: "INVALID_AGENT_PRESENCE"
    }
  );
});
