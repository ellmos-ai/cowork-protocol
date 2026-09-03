import assert from "node:assert/strict";
import test from "node:test";

import * as gatewayModule from "../src/index.js";

function activeSnapshot(overrides = {}) {
  return {
    protocolVersion: "0.1",
    type: "session-snapshot",
    sessionId: "session-1",
    revision: 4,
    state: {
      humanPresence: "present",
      agentPresence: "active",
      effectiveMode: "cowork",
      surface: { primarySurfaceId: "desktop:1", kind: "desktop" },
      modelSeat: {
        leaseId: "seat-1",
        owner: "cowork-companion",
        providerId: "preferred-model",
        contextAuthority: "cowork-session",
        expiresAt: "2099-09-01T12:00:00.000Z"
      },
      ...overrides
    }
  };
}

test("one gateway serializes concurrent turns and deduplicates a repeated turn id", async () => {
  assert.equal(typeof gatewayModule.createCoworkModelGateway, "function");
  const started = [];
  const releases = [];
  const gateway = gatewayModule.createCoworkModelGateway({
    sessionId: "session-1",
    seatOwner: "cowork-companion",
    readSnapshot: () => activeSnapshot(),
    readModelContext: () => ({
      protocolVersion: "0.1",
      type: "model-context",
      sessionId: "session-1",
      recentTurns: []
    }),
    sendTurn: async ({ turnId }) => {
      started.push(turnId);
      await new Promise((resolve) => releases.push(resolve));
      return { message: `reply:${turnId}` };
    }
  });

  const first = gateway.submit({
    turnId: "turn-1",
    sourceSurfaceId: "desktop:1",
    input: { transcript: "First" }
  });
  const duplicate = gateway.submit({
    turnId: "turn-1",
    sourceSurfaceId: "desktop:1",
    input: { transcript: "First" }
  });
  const second = gateway.submit({
    turnId: "turn-2",
    sourceSurfaceId: "desktop:1",
    input: { transcript: "Second" }
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, ["turn-1"]);
  releases.shift()();
  assert.deepEqual(await first, { message: "reply:turn-1" });
  assert.deepEqual(await duplicate, { message: "reply:turn-1" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, ["turn-1", "turn-2"]);
  releases.shift()();
  assert.deepEqual(await second, { message: "reply:turn-2" });
  assert.deepEqual(gateway.readStatus(), {
    activeTurnId: null,
    queuedTurns: 0,
    completedTurns: 2,
    failedTurns: 0
  });
});

test("the gateway supplies bounded Cowork context and rejects the wrong model seat", async () => {
  let supplied;
  let snapshot = activeSnapshot();
  const gateway = gatewayModule.createCoworkModelGateway({
    sessionId: "session-1",
    seatOwner: "cowork-companion",
    readSnapshot: () => snapshot,
    readModelContext: ({ maxCharacters }) => ({
      protocolVersion: "0.1",
      type: "model-context",
      sessionId: "session-1",
      maximumCharacters: maxCharacters,
      recentTurns: [{ role: "human", text: "Help with the current field" }]
    }),
    sendTurn: async (request) => {
      supplied = request;
      return { message: "Ready" };
    }
  });

  await gateway.submit({
    turnId: "turn-1",
    sourceSurfaceId: "desktop:1",
    input: { transcript: "Continue" }
  });
  assert.equal(supplied.type, "model-gateway-turn");
  assert.equal(supplied.session.revision, 4);
  assert.equal(supplied.session.effectiveMode, "cowork");
  assert.equal(supplied.context.maximumCharacters, 1200);
  assert.equal(Object.hasOwn(supplied, "html"), false);
  assert.equal(JSON.stringify(supplied).length <= 6000, true);

  snapshot = activeSnapshot({
    modelSeat: {
      ...activeSnapshot().state.modelSeat,
      owner: "provider-extension",
      contextAuthority: "provider-chat"
    }
  });
  await assert.rejects(
    gateway.submit({
      turnId: "turn-2",
      sourceSurfaceId: "desktop:1",
      input: { transcript: "This must not race" }
    }),
    (error) => error?.code === "MODEL_SEAT_NOT_OWNED"
  );
});

test("a reused turn id with different input fails closed", async () => {
  const gateway = gatewayModule.createCoworkModelGateway({
    sessionId: "session-1",
    seatOwner: "cowork-companion",
    readSnapshot: () => activeSnapshot(),
    readModelContext: () => ({ type: "model-context", sessionId: "session-1" }),
    sendTurn: async () => ({ message: "Done" })
  });
  await gateway.submit({
    turnId: "turn-1",
    sourceSurfaceId: "desktop:1",
    input: { transcript: "First" }
  });
  await assert.rejects(
    gateway.submit({
      turnId: "turn-1",
      sourceSurfaceId: "desktop:1",
      input: { transcript: "Different" }
    }),
    (error) => error?.code === "TURN_ID_COLLISION"
  );
});
