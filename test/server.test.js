import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createStaticServer } from "../scripts/serve.mjs";
import { createConversationTurn } from "../packages/conversation/src/index.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("the local server delivers the showcase and browser modules from one origin", async (context) => {
  const server = createStaticServer({ root: repositoryRoot });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));

  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const page = await fetch(`${base}/apps/formbuilder-showcase/`);
  const core = await fetch(`${base}/packages/core/src/index.js`);

  assert.equal(page.status, 200);
  assert.match(await page.text(), /FormBuilder Studio — Cowork Protocol Showcase/);
  assert.equal(page.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(core.status, 200);
  assert.equal(core.headers.get("content-type"), "text/javascript; charset=utf-8");
});

test("the default server reports no connected model host", async (context) => {
  const server = createStaticServer({ root: repositoryRoot });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));

  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/__cowork/model/status`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    protocolVersion: "0.1",
    available: false,
    transport: "same-origin-model-host"
  });
});

test("the model host accepts one bounded turn and normalizes its reply", async (context) => {
  let receivedTurn;
  let receivedMetadata;
  const server = createStaticServer({
    root: repositoryRoot,
    modelTurnHandler: async (turn, metadata) => {
      receivedTurn = turn;
      receivedMetadata = metadata;
      return { message: "I can help.", offers: [] };
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const turn = createConversationTurn({
    transcript: "Help with this field",
    presence: {
      humanPresence: "present",
      agentPresence: "active",
      mode: "cowork"
    }
  });

  const response = await fetch(`http://127.0.0.1:${port}/__cowork/model/turn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ protocolVersion: "0.1", turn })
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    protocolVersion: "0.1",
    reply: { message: "I can help.", speak: "", offers: [], omittedOffers: 0 }
  });
  assert.deepEqual(receivedTurn, turn);
  assert.equal(Object.hasOwn(receivedTurn, "pageHtml"), false);
  assert.deepEqual(receivedMetadata, {
    requestKeys: ["protocolVersion", "turn"],
    authorizationHeaderPresent: false
  });
});

test("the model host rejects extra page context and redacts upstream failures", async (context) => {
  const server = createStaticServer({
    root: repositoryRoot,
    modelTurnHandler: async () => {
      throw new Error("server-only-provider-diagnostic");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const turn = createConversationTurn({
    transcript: "Help with this field",
    presence: {
      humanPresence: "present",
      agentPresence: "active",
      mode: "cowork"
    }
  });

  const invalid = await fetch(`${base}/__cowork/model/turn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      protocolVersion: "0.1",
      turn: { ...turn, pageHtml: "<main>must not cross</main>" }
    })
  });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.text()).includes("must not cross"), false);

  const failed = await fetch(`${base}/__cowork/model/turn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ protocolVersion: "0.1", turn })
  });
  assert.equal(failed.status, 502);
  assert.equal((await failed.text()).includes("server-only-provider-diagnostic"), false);
});
