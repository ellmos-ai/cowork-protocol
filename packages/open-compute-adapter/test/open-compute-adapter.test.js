import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  authorizeActionOffer,
  createActionOffer
} from "../../core/src/index.js";
import {
  OpenComputeAdapterError,
  createOpenComputeAdapter
} from "../src/index.js";

function createFakeClient({ tools, results = {} } = {}) {
  const calls = [];
  let starts = 0;
  let closes = 0;
  return {
    calls,
    get starts() { return starts; },
    get closes() { return closes; },
    async start() { starts += 1; },
    async listTools() {
      return tools ?? [
        "observe_filtered",
        "capture_filtered",
        "signal_show",
        "signal_hide",
        "signal_status",
        "do"
      ];
    },
    async callTool(name, arguments_) {
      calls.push({ name, arguments: arguments_ });
      const result = results[name];
      return typeof result === "function" ? result(arguments_) : result;
    },
    async close() { closes += 1; }
  };
}

const profile = JSON.parse(await readFile(
  new URL("../../../apps/desktop-companion/profiles/cowork-open-compute-filter.v1.json", import.meta.url),
  "utf8"
));

function computerActionContract() {
  const offer = createActionOffer({
    offerId: "computer-offer-1",
    capabilityId: "computer.mouse_move",
    targetId: "computer:screen",
    pageVersion: 4,
    proposedArguments: {
      action: { type: "mouse_move", x: 0.25, y: 0.5 }
    },
    summary: "Move the model pointer to the inspected area",
    effect: "moves-pointer",
    undoAvailable: false,
    expiresAt: "2026-08-31T12:01:00.000Z"
  });
  const authorization = authorizeActionOffer({
    offer,
    event: {
      origin: "human-click",
      offerId: offer.offerId,
      targetId: offer.targetId,
      pageVersion: offer.pageVersion,
      arguments: offer.proposedArguments
    },
    now: "2026-08-31T12:00:00.000Z"
  });
  return { offer, authorization };
}

test("Computer Use becomes active only after the real signal overlay confirms control mode", async () => {
  const client = createFakeClient({
    results: {
      signal_show: { visible: true, mode: "control", label: "Cowork model controls screen" },
      signal_hide: { visible: false }
    }
  });
  const adapter = createOpenComputeAdapter({ client, profile, agentLabel: "Cowork model" });

  assert.deepEqual(adapter.readStatus(), {
    available: false,
    executionMode: "structured",
    indicatorVisible: false,
    activeSessionId: null,
    lastAbortMessage: null,
    lastAbortSessionId: null
  });

  await assert.rejects(
    adapter.activate({ sessionId: "session-1", humanGesture: false }),
    (error) => error instanceof OpenComputeAdapterError &&
      error.code === "HUMAN_ACTIVATION_REQUIRED"
  );
  assert.equal(client.starts, 0);

  const active = await adapter.activate({ sessionId: "session-1", humanGesture: true });
  assert.equal(active.executionMode, "computer-use");
  assert.equal(active.indicatorVisible, true);
  assert.equal(active.activeSessionId, "session-1");
  assert.deepEqual(client.calls[0], {
    name: "signal_show",
    arguments: { mode: "control", agent: "Cowork model", scope: "screen" }
  });

  await adapter.deactivate({ sessionId: "session-1", humanGesture: true });
  assert.equal(adapter.readStatus().executionMode, "structured");
  assert.equal(adapter.readStatus().indicatorVisible, false);
});

test("missing Open Compute capabilities fail closed before a control signal appears", async () => {
  const client = createFakeClient({
    tools: ["capture", "tree", "signal_show", "signal_hide", "signal_status", "do"]
  });
  const adapter = createOpenComputeAdapter({ client, profile });

  await assert.rejects(
    adapter.activate({ sessionId: "session-1", humanGesture: true }),
    (error) => error instanceof OpenComputeAdapterError &&
      error.code === "OPEN_COMPUTE_CAPABILITIES_MISSING"
  );
  assert.equal(adapter.readStatus().executionMode, "structured");
  assert.equal(client.calls.length, 0);
});

test("an unverified overlay response never earns the Computer Use cursor", async () => {
  const client = createFakeClient({
    results: { signal_show: { visible: false, mode: "control" } }
  });
  const adapter = createOpenComputeAdapter({ client, profile });

  await assert.rejects(
    adapter.activate({ sessionId: "session-1", humanGesture: true }),
    (error) => error instanceof OpenComputeAdapterError &&
      error.code === "OPEN_COMPUTE_SIGNAL_UNVERIFIED"
  );
  assert.equal(adapter.readStatus().executionMode, "structured");
  assert.equal(adapter.readStatus().indicatorVisible, false);
});

test("the system pointer belongs to only one active Cowork session", async () => {
  const client = createFakeClient({
    results: { signal_show: { visible: true, mode: "control" } }
  });
  const adapter = createOpenComputeAdapter({ client, profile });
  await adapter.activate({ sessionId: "session-1", humanGesture: true });

  await assert.rejects(
    adapter.activate({ sessionId: "session-2", humanGesture: true }),
    (error) => error instanceof OpenComputeAdapterError &&
      error.code === "COMPUTER_USE_SEAT_TAKEN"
  );
  assert.equal(client.calls.filter(({ name }) => name === "signal_show").length, 1);
});

test("only the exact human-authorized Cowork offer can reach the Open Compute do tool", async () => {
  const client = createFakeClient({
    results: {
      signal_show: { visible: true, mode: "control" },
      do: { result: "executed", action: "mouse_move" }
    }
  });
  const adapter = createOpenComputeAdapter({ client, profile });
  await adapter.activate({ sessionId: "session-1", humanGesture: true });
  const { offer, authorization } = computerActionContract();

  const result = await adapter.executeAuthorizedAction({
    sessionId: "session-1",
    offer,
    authorization
  });
  assert.deepEqual(result, { result: "executed", action: "mouse_move" });
  assert.deepEqual(client.calls.at(-1), {
    name: "do",
    arguments: {
      action: offer.proposedArguments.action,
      mode: "allow_all",
      profile
    }
  });

  await assert.rejects(
    adapter.executeAuthorizedAction({
      sessionId: "session-1",
      offer: {
        ...offer,
        proposedArguments: { action: { type: "mouse_move", x: 0.9, y: 0.9 } }
      },
      authorization
    }),
    (error) => error instanceof OpenComputeAdapterError &&
      error.code === "ACTION_AUTHORIZATION_MISMATCH"
  );
  assert.equal(client.calls.filter(({ name }) => name === "do").length, 1);
});

test("abort feedback hides the expensive execution path and is retained for the model", async () => {
  const client = createFakeClient({
    results: {
      signal_show: { visible: true, mode: "control" },
      signal_status: {
        visible: true,
        mode: "control",
        pending_abort_message: "Wrong window"
      },
      signal_hide: { visible: false }
    }
  });
  const adapter = createOpenComputeAdapter({ client, profile });
  await adapter.activate({ sessionId: "session-1", humanGesture: true });

  const status = await adapter.refreshStatus({ sessionId: "session-1" });
  assert.equal(status.executionMode, "structured");
  assert.equal(status.indicatorVisible, false);
  assert.equal(status.lastAbortMessage, "Wrong window");
  assert.equal(status.lastAbortSessionId, "session-1");
  assert.deepEqual(client.calls.map(({ name }) => name), [
    "signal_show",
    "signal_status",
    "signal_hide"
  ]);
});

test("closing the adapter removes a live signal before closing the MCP process", async () => {
  const client = createFakeClient({
    results: {
      signal_show: { visible: true, mode: "control" },
      signal_hide: { visible: false }
    }
  });
  const adapter = createOpenComputeAdapter({ client, profile });
  await adapter.activate({ sessionId: "session-1", humanGesture: true });

  await adapter.close();
  assert.equal(client.calls.at(-1).name, "signal_hide");
  assert.equal(client.closes, 1);
  assert.equal(adapter.readStatus().executionMode, "structured");
});

test("Cowork consumes only the profiled semantic observation and never the raw tree", async () => {
  const filtered = {
    type: "filtered-perception",
    profileId: profile.profileId,
    focus: { kind: "follow-me", x: 0.4, y: 0.6, selection: null },
    elements: [{ name: "Event title", role: "Edit", center: [0.4, 0.6] }],
    metrics: {
      sourceElements: 140,
      includedElements: 1,
      excludedElements: 12,
      omittedElements: 127,
      payloadCharacters: 310
    }
  };
  const client = createFakeClient({
    results: {
      signal_show: { visible: true, mode: "control" },
      observe_filtered: filtered
    }
  });
  const adapter = createOpenComputeAdapter({ client, profile });
  await adapter.activate({ sessionId: "session-1", humanGesture: true });

  assert.deepEqual(await adapter.readAttention({
    sessionId: "session-1",
    focus: { kind: "follow-me", x: 0.4, y: 0.6, selectedText: "" },
    window: "FormBuilder Studio"
  }), filtered);
  assert.deepEqual(client.calls.at(-1), {
    name: "observe_filtered",
    arguments: {
      profile,
      focus: { kind: "follow-me", x: 0.4, y: 0.6, selectedText: "" },
      window: "FormBuilder Studio"
    }
  });
  assert.equal(client.calls.some(({ name }) => name === "tree" || name === "capture"), false);
});

test("visual context escalates only through the profile lens, never raw capture", async () => {
  const lens = { type: "image", data: "filtered-png", mimeType: "image/png" };
  const client = createFakeClient({
    results: {
      signal_show: { visible: true, mode: "control" },
      capture_filtered: lens
    }
  });
  const adapter = createOpenComputeAdapter({ client, profile });
  await adapter.activate({ sessionId: "session-1", humanGesture: true });

  assert.equal((await adapter.requestVisualLens({
    sessionId: "session-1",
    focus: { kind: "fixed-focus", x: 0.25, y: 0.75, selectedText: "" },
    reason: "Semantics did not identify the canvas control"
  })).data, "filtered-png");
  assert.deepEqual(client.calls.at(-1), {
    name: "capture_filtered",
    arguments: {
      profile,
      focus: { kind: "fixed-focus", x: 0.25, y: 0.75, selectedText: "" }
    }
  });
  assert.equal(client.calls.some(({ name }) => name === "capture"), false);
});
