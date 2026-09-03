import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { coworkToolDefinitions } from "../../../packages/native-webmcp/src/index.js";
import { createCompanionMcpServer } from "../src/mcp-server.js";
import { createCompanionSessionHost } from "../src/host.js";

const PAGE_ORIGIN = "https://formbuilder.example";

function stubFetch(handler) {
  return async (url, init) => handler(String(url), init);
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  };
}

test("the MCP server answers the initialize handshake with its own identity", async () => {
  const server = await createCompanionMcpServer({ fetchImpl: stubFetch(() => {
    throw new Error("no tool call expected");
  }) });

  const response = await server.handle({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "claude-code", version: "1.0.0" }
    }
  });

  assert.equal(response.jsonrpc, "2.0");
  assert.equal(response.id, 1);
  assert.equal(response.result.protocolVersion, "2025-06-18");
  assert.deepEqual(response.result.capabilities, { tools: { listChanged: false } });
  assert.equal(response.result.serverInfo.name, "cowork-companion");
  assert.equal(server.readState().clientName, "claude-code");

  assert.equal(await server.handle({ jsonrpc: "2.0", method: "notifications/initialized" }), null);
  assert.equal(server.readState().initialized, true);
  assert.deepEqual(
    await server.handle({ jsonrpc: "2.0", id: 2, method: "ping" }),
    { jsonrpc: "2.0", id: 2, result: {} }
  );
});

test("MCP tools/list publishes exactly the nine registered Cowork tools", async () => {
  const server = await createCompanionMcpServer({ fetchImpl: stubFetch(() => {
    throw new Error("no tool call expected");
  }) });

  const response = await server.handle({ jsonrpc: "2.0", id: 1, method: "tools/list" });

  // The same names and input schemas a browser agent sees on the page: one
  // tool set, whichever surface the agent arrives through.
  assert.deepEqual(response.result.tools, await coworkToolDefinitions());
  assert.deepEqual(response.result.tools.map(({ name }) => name), [
    "cowork_read_focus",
    "cowork_request_context",
    "cowork_offer_action",
    "cowork_read_presence",
    "cowork_execute_solo",
    "cowork_read_changes",
    "cowork_read_feedback",
    "cowork_read_turn",
    "cowork_reply_turn"
  ]);
});

test("an MCP tool call reaches the Companion host and returns the page's packet", async () => {
  const calls = [];
  const server = await createCompanionMcpServer({
    endpoint: "http://127.0.0.1:47831/cowork/v1",
    fetchImpl: stubFetch((url, init) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return jsonResponse(200, { result: { type: "focus-packet", targetId: "form-field:name" } });
    })
  });
  await server.handle({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { clientInfo: { name: "codex-cli" } }
  });

  const response = await server.handle({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "cowork_read_focus", arguments: {} }
  });

  assert.equal(calls[0].url, "http://127.0.0.1:47831/cowork/v1/agent/tools/cowork_read_focus");
  assert.equal(calls[0].body.clientName, "codex-cli");
  assert.deepEqual(calls[0].body.arguments, {});
  assert.equal(response.result.isError, undefined);
  assert.deepEqual(response.result.structuredContent, {
    type: "focus-packet",
    targetId: "form-field:name"
  });
  assert.deepEqual(
    JSON.parse(response.result.content[0].text),
    response.result.structuredContent
  );
});

test("a host or page failure becomes an MCP tool error, never a silent success", async () => {
  const server = await createCompanionMcpServer({
    fetchImpl: stubFetch(() => jsonResponse(503, {
      code: "PAGE_UNREACHABLE",
      message: "No Cowork page is linked to this Companion"
    }))
  });

  const response = await server.handle({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "cowork_read_focus", arguments: {} }
  });

  assert.equal(response.result.isError, true);
  assert.equal(response.result.structuredContent.code, "PAGE_UNREACHABLE");
});

test("an unreachable Companion is reported as a tool error with a repair hint", async () => {
  const server = await createCompanionMcpServer({
    fetchImpl: stubFetch(() => {
      throw new TypeError("fetch failed");
    })
  });

  const response = await server.handle({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "cowork_read_focus", arguments: {} }
  });

  assert.equal(response.result.isError, true);
  assert.equal(response.result.structuredContent.code, "COMPANION_UNAVAILABLE");
  assert.match(response.result.structuredContent.message, /start:companion-host/);
});

test("unknown tools and unknown methods are refused as JSON-RPC errors", async () => {
  const server = await createCompanionMcpServer({ fetchImpl: stubFetch(() => {
    throw new Error("no tool call expected");
  }) });

  const unknownTool = await server.handle({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "cowork_delete_everything", arguments: {} }
  });
  assert.equal(unknownTool.error.code, -32_602);

  const unknownMethod = await server.handle({
    jsonrpc: "2.0",
    id: 2,
    method: "resources/list"
  });
  assert.equal(unknownMethod.error.code, -32_601);

  assert.equal(await server.handle({ method: "tools/list" }), null);
});

test("only a loopback Companion endpoint is accepted", async () => {
  await assert.rejects(
    () => createCompanionMcpServer({ endpoint: "http://example.com/cowork/v1" }),
    /loopback/
  );
});

// End to end over the real host, without a browser: the relay is HTTP on both
// sides, so a fake page can prove the round trip that the browser smoke then
// repeats with a real page.
async function withHost(run, hostOptions = {}) {
  const host = createCompanionSessionHost({
    allowedOrigins: [PAGE_ORIGIN],
    port: 0,
    createLinkSessionId: () => "mcp-link",
    ...hostOptions
  });
  const address = await host.listen();
  const endpoint = `http://${address.hostname}:${address.port}/cowork/v1`;
  try {
    await run({ host, endpoint });
  } finally {
    await host.close();
  }
}

async function joinPage(endpoint) {
  const snapshot = {
    protocolVersion: "0.1",
    type: "session-snapshot",
    sessionId: "session-mcp",
    revision: 0,
    state: {
      humanPresence: "present",
      agentPresence: "active",
      agentEngagement: "observing",
      effectiveMode: "cowork",
      lease: null,
      surface: { kind: "embedded", primarySurfaceId: "page-surface" },
      applicationSurface: { surfaceId: "page-surface", visibility: "visible" }
    }
  };
  const response = await fetch(`${endpoint}/sessions/join`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: PAGE_ORIGIN },
    body: JSON.stringify({
      hello: {
        protocolVersion: "0.1",
        linkVersion: "0.1",
        type: "companion-hello",
        sessionId: "session-mcp",
        surfaceId: "page-surface",
        revision: 0,
        origin: PAGE_ORIGIN,
        capabilityDigest: "native:1"
      },
      snapshot,
      context: null
    })
  });
  assert.equal(response.status, 200);
  return (await response.json()).linkSessionId;
}

function pageFetch(endpoint, pathname, body) {
  return fetch(`${endpoint}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: PAGE_ORIGIN },
    body: JSON.stringify(body)
  });
}

test("a tool call travels agent -> host -> page -> agent over the real host", async () => {
  await withHost(async ({ host, endpoint }) => {
    const linkSessionId = await joinPage(endpoint);
    const server = await createCompanionMcpServer({ endpoint });
    await server.handle({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { clientInfo: { name: "agy" } }
    });

    const pending = server.handle({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "cowork_offer_action",
        arguments: {
          capabilityId: "form.setValue",
          targetId: "form-field:name",
          value: "Ada",
          summary: "Fill the name"
        }
      }
    });

    // The page pulls the waiting call exactly as it pulls deltas.
    let requests = [];
    for (let attempt = 0; attempt < 50 && requests.length === 0; attempt += 1) {
      const pull = await pageFetch(
        endpoint,
        `/sessions/${linkSessionId}/agent-requests/read`,
        {}
      );
      requests = (await pull.json()).requests;
      if (requests.length === 0) await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(requests.length, 1);
    assert.equal(requests[0].name, "cowork_offer_action");
    assert.equal(requests[0].arguments.value, "Ada");

    await pageFetch(endpoint, `/sessions/${linkSessionId}/agent-requests/result`, {
      requestId: requests[0].requestId,
      result: { offerId: "offer-1", state: "offered" }
    });

    const response = await pending;
    assert.deepEqual(response.result.structuredContent, {
      offerId: "offer-1",
      state: "offered"
    });
    assert.deepEqual(host.readAgentRelay(), { clientName: "agy", toolCalls: 1 });

    const uiState = await (await fetch(`${endpoint}/ui/state`)).json();
    assert.deepEqual(uiState.agent, { client: "agy", toolCalls: 1, pageLinked: true });
  });
});

test("a page that refuses the call answers the agent with that tool error", async () => {
  await withHost(async ({ endpoint }) => {
    const linkSessionId = await joinPage(endpoint);
    const server = await createCompanionMcpServer({ endpoint });

    const pending = server.handle({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "cowork_read_focus", arguments: {} }
    });
    let requests = [];
    for (let attempt = 0; attempt < 50 && requests.length === 0; attempt += 1) {
      const pull = await pageFetch(
        endpoint,
        `/sessions/${linkSessionId}/agent-requests/read`,
        {}
      );
      requests = (await pull.json()).requests;
      if (requests.length === 0) await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await pageFetch(endpoint, `/sessions/${linkSessionId}/agent-requests/result`, {
      requestId: requests[0].requestId,
      error: { code: "STALE_FOCUS", message: "No FormBuilder field is focused" }
    });

    const response = await pending;
    assert.equal(response.result.isError, true);
    assert.equal(response.result.structuredContent.code, "STALE_FOCUS");
  });
});

test("a page that never answers times out as PAGE_UNREACHABLE", async () => {
  await withHost(async ({ endpoint }) => {
    await joinPage(endpoint);
    const server = await createCompanionMcpServer({ endpoint });

    const response = await server.handle({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "cowork_read_focus", arguments: {} }
    });

    assert.equal(response.result.isError, true);
    assert.equal(response.result.structuredContent.code, "PAGE_UNREACHABLE");
  }, { agentRequestTimeoutMilliseconds: 150 });
});

test("without a linked page the agent is told so instead of waiting", async () => {
  await withHost(async ({ endpoint }) => {
    const server = await createCompanionMcpServer({ endpoint });

    const response = await server.handle({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "cowork_read_focus", arguments: {} }
    });

    assert.equal(response.result.isError, true);
    assert.equal(response.result.structuredContent.code, "PAGE_UNREACHABLE");
  });
});

test("a website cannot place agent tool calls on the local agent route", async () => {
  await withHost(async ({ endpoint }) => {
    await joinPage(endpoint);
    const response = await fetch(`${endpoint}/agent/tools/cowork_read_focus`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: PAGE_ORIGIN },
      body: JSON.stringify({ arguments: {} })
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, "AGENT_ROUTE_IS_LOCAL_ONLY");
  });
});

test("the host refuses tools outside the published Cowork set", async () => {
  await withHost(async ({ endpoint }) => {
    await joinPage(endpoint);
    const response = await fetch(`${endpoint}/agent/tools/cowork_wipe_form`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ arguments: {} })
    });
    assert.equal(response.status, 404);
    assert.equal((await response.json()).code, "UNKNOWN_TOOL");
  });
});

test("the Companion README documents how a local agent adds this server", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");

  assert.match(readme, /claude mcp add cowork-companion/);
  assert.match(readme, /mcp_servers\.cowork-companion/);
  assert.match(readme, /start:companion-mcp/);
  assert.match(readme, /PAGE_UNREACHABLE/);
});

test("the Companion window names the MCP agent and warns when no page can run its calls", async () => {
  const [html, app] = await Promise.all([
    readFile(new URL("../ui/index.html", import.meta.url), "utf8"),
    readFile(new URL("../ui/app.js", import.meta.url), "utf8")
  ]);

  assert.match(html, /id="agent-link"/);
  assert.match(app, /Agent via MCP: \$\{agent\.client\}/);
  assert.match(app, /tool calls will fail with PAGE_UNREACHABLE/);
  assert.match(app, /No agent connected over MCP\./);
});
