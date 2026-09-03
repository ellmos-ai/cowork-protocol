import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createModelSeat,
  DEMO_MODE_STORAGE_KEY,
  DIRECT_MODEL_KEY_STORAGE_KEY,
  DIRECT_MODEL_STORAGE_KEY,
  NO_MODEL_MESSAGE,
  validateDirectModelConfig
} from "../src/model-seat.js";

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    dump: () => Object.fromEntries(map)
  };
}

function fakeSenderFactory(calls) {
  return (config) => {
    calls.push(config);
    return async (turn) => ({ message: `direct:${config.model}:${turn.transcript}`, offers: [] });
  };
}

const demoReply = async (turn) => ({ message: `demo:${turn.transcript}`, offers: [] });

test("with nothing configured the seat is the scripted demo helper", async () => {
  const seat = createModelSeat({ demoReply, storage: { local: fakeStorage(), session: fakeStorage() } });
  const resolved = seat.resolve();
  assert.equal(resolved.kind, "demo");
  assert.equal(resolved.transportLabel, "Local demo helper");
  assert.equal(seat.isDemo(), true);
  assert.equal((await seat.sendTurn({ transcript: "hi" })).message, "demo:hi");
});

test("a discovered page host wins over demo on a fresh profile and demo can still be forced on", async () => {
  const local = fakeStorage();
  const discovered = { label: "Connected model bridge", sendTurn: async () => ({ message: "host", offers: [] }) };
  const seat = createModelSeat({ demoReply, discovered, storage: { local, session: fakeStorage() } });
  assert.equal(seat.resolve().kind, "host");
  assert.equal(seat.resolve().transportLabel, "Connected model bridge");
  assert.equal(seat.isDemo(), false);
  assert.equal(seat.setDemo(true).kind, "demo");
  assert.equal(JSON.parse(local.getItem(DEMO_MODE_STORAGE_KEY)), true);
});

test("connectDirect validates, persists endpoint and model locally, keeps the key in the session store and switches demo off", async () => {
  const local = fakeStorage();
  const session = fakeStorage();
  const senderCalls = [];
  const seat = createModelSeat({
    demoReply,
    storage: { local, session },
    createSender: fakeSenderFactory(senderCalls)
  });
  const resolved = seat.connectDirect({
    endpoint: " http://127.0.0.1:11434/v1/chat/completions ",
    model: " qwen3:4b ",
    apiKey: "secret"
  });
  assert.equal(resolved.kind, "direct");
  assert.equal(resolved.transportLabel, "Direct model");
  assert.equal(resolved.label, "Direct model · qwen3:4b");
  assert.equal(seat.isDemo(), false);
  assert.deepEqual(JSON.parse(local.getItem(DIRECT_MODEL_STORAGE_KEY)), {
    endpoint: "http://127.0.0.1:11434/v1/chat/completions",
    model: "qwen3:4b"
  });
  assert.equal(local.getItem(DIRECT_MODEL_KEY_STORAGE_KEY), null);
  assert.equal(session.getItem(DIRECT_MODEL_KEY_STORAGE_KEY), "secret");
  assert.equal(senderCalls.length, 1);
  assert.equal(senderCalls[0].apiKey, "secret");
  assert.equal(senderCalls[0].timeoutMs, 120000);
  assert.equal((await seat.sendTurn({ transcript: "x" })).message, "direct:qwen3:4b:x");
});

test("direct configuration is restored from storage on the next load", () => {
  const local = fakeStorage({
    [DIRECT_MODEL_STORAGE_KEY]: JSON.stringify({ endpoint: "http://127.0.0.1:11434/v1/chat/completions", model: "qwen3:4b" })
  });
  const seat = createModelSeat({
    demoReply,
    storage: { local, session: fakeStorage() },
    createSender: fakeSenderFactory([])
  });
  assert.equal(seat.resolve().kind, "direct");
  assert.equal(seat.isDemo(), false);
});

test("an injected transport outranks a direct connection; disconnecting with nothing else yields the honest none seat", async () => {
  const injected = { label: "Injected", sendTurn: async () => ({ message: "injected", offers: [] }) };
  const seat = createModelSeat({
    demoReply,
    injected,
    storage: { local: fakeStorage(), session: fakeStorage() },
    createSender: fakeSenderFactory([])
  });
  seat.connectDirect({ endpoint: "http://127.0.0.1:11434/v1/chat/completions", model: "m" });
  assert.equal(seat.resolve().kind, "injected");

  const lonely = createModelSeat({
    demoReply,
    storage: { local: fakeStorage(), session: fakeStorage() },
    createSender: fakeSenderFactory([])
  });
  lonely.connectDirect({ endpoint: "http://127.0.0.1:11434/v1/chat/completions", model: "m" });
  const none = lonely.disconnectDirect();
  assert.equal(none.kind, "none");
  assert.equal(none.transportLabel, "No model connected");
  assert.equal(none.publishesToInbox, true);
  const reply = await lonely.sendTurn({ transcript: "anything" });
  assert.equal(reply.message, NO_MODEL_MESSAGE);
  assert.deepEqual(reply.offers, []);
  await assert.rejects(() => lonely.probe({ transcript: "test" }), { code: "NO_MODEL_CONNECTED" });
});

test("validateDirectModelConfig rejects bad URLs, mixed content and empty model ids", () => {
  assert.throws(() => validateDirectModelConfig({ endpoint: "localhost:11434", model: "m" }), { code: "INVALID_ENDPOINT" });
  assert.throws(() => validateDirectModelConfig({ endpoint: "ftp://x/y", model: "m" }), { code: "INVALID_ENDPOINT" });
  assert.throws(
    () => validateDirectModelConfig({ endpoint: "http://127.0.0.1:11434/v1/chat/completions", model: "m", pageProtocol: "https:" }),
    { code: "MIXED_CONTENT" }
  );
  assert.throws(() => validateDirectModelConfig({ endpoint: "https://api.example/v1/chat/completions", model: "  " }), { code: "INVALID_MODEL" });
  assert.deepEqual(
    validateDirectModelConfig({ endpoint: "https://api.example/v1/chat/completions", model: "gpt", pageProtocol: "https:" }),
    { endpoint: "https://api.example/v1/chat/completions", model: "gpt" }
  );
});
