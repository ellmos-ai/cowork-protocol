import assert from "node:assert/strict";
import test from "node:test";

import {
  ModelTransportError,
  discoverHttpModelTransport,
  selectModelTransport
} from "../src/browser.js";

const turn = {
  type: "conversation-turn",
  protocolVersion: "0.1",
  transcript: "Help with this field",
  focus: null,
  presence: {
    humanPresence: "present",
    agentPresence: "active",
    mode: "cowork"
  },
  metrics: {
    sourceTranscriptCharacters: 20,
    includedTranscriptCharacters: 20,
    omittedTranscriptCharacters: 0
  }
};

test("the browser discovers an available same-origin model host and sends only the turn", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === "/__cowork/model/status") {
      return Response.json({
        protocolVersion: "0.1",
        available: true,
        transport: "same-origin-model-host"
      });
    }
    return Response.json({
      protocolVersion: "0.1",
      reply: { message: "I can help.", offers: [] }
    });
  };

  const transport = await discoverHttpModelTransport({ fetchImpl });
  assert.equal(transport.label, "Connected model bridge");
  assert.deepEqual(await transport.sendTurn(turn), {
    message: "I can help.",
    offers: []
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "/__cowork/model/status");
  assert.equal(calls[1].url, "/__cowork/model/turn");
  assert.equal(calls[1].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    protocolVersion: "0.1",
    turn
  });
  assert.equal(JSON.stringify(calls).includes("apiKey"), false);
});

test("an unavailable or malformed model status preserves the local helper path", async () => {
  assert.equal(
    await discoverHttpModelTransport({
      fetchImpl: async () => new Response("Not found", { status: 404 })
    }),
    null
  );
  assert.equal(
    await discoverHttpModelTransport({
      fetchImpl: async () => Response.json({ available: true, transport: "unknown" })
    }),
    null
  );
});

test("model host failures stay bounded and do not expose response bodies", async () => {
  const transport = await discoverHttpModelTransport({
    fetchImpl: async (url) =>
      url.endsWith("/status")
        ? Response.json({
            protocolVersion: "0.1",
            available: true,
            transport: "same-origin-model-host"
          })
        : new Response("provider-secret-diagnostic", { status: 502 })
  });

  await assert.rejects(
    () => transport.sendTurn(turn),
    (error) =>
      error instanceof ModelTransportError &&
      error.code === "MODEL_HOST_FAILED" &&
      !error.message.includes("provider-secret-diagnostic")
  );
});

test("a malformed injected adapter cannot shadow a discovered model host", () => {
  const discovered = { label: "Connected model bridge", sendTurn: async () => ({}) };
  assert.equal(selectModelTransport({ injected: {}, discovered }), discovered);

  const injected = { sendTurn: async () => ({}) };
  assert.equal(selectModelTransport({ injected, discovered }), injected);
  assert.equal(selectModelTransport({ injected: null, discovered: {} }), null);
});
