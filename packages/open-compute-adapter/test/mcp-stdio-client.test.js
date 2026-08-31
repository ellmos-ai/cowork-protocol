import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import test from "node:test";

import {
  McpStdioClientError,
  createMcpStdioClient
} from "../src/mcp-stdio-client.js";

function createFakeServer({ tools = [], toolResult = { content: [] }, toolError = null } = {}) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killed = false;
  const messages = [];
  let input = "";
  child.stdin = new Writable({
    write(chunk, _encoding, callback) {
      input += chunk.toString("utf8");
      let newline;
      while ((newline = input.indexOf("\n")) >= 0) {
        const line = input.slice(0, newline);
        input = input.slice(newline + 1);
        if (!line.trim()) continue;
        const message = JSON.parse(line);
        messages.push(message);
        if (message.id === undefined) continue;
        let result;
        if (message.method === "initialize") {
          result = {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "fake-open-compute", version: "0.7.0" }
          };
        } else if (message.method === "tools/list") {
          result = { tools: tools.map((name) => ({ name, inputSchema: { type: "object" } })) };
        } else if (message.method === "tools/call" && toolError) {
          child.stdout.write(`${JSON.stringify({
            jsonrpc: "2.0",
            id: message.id,
            result: {
              isError: true,
              content: [{ type: "text", text: toolError }]
            }
          })}\n`);
          continue;
        } else if (message.method === "tools/call") {
          result = toolResult;
        } else {
          child.stdout.write(`${JSON.stringify({
            jsonrpc: "2.0",
            id: message.id,
            error: { code: -32601, message: "not found" }
          })}\n`);
          continue;
        }
        const serialized = JSON.stringify({ jsonrpc: "2.0", id: message.id, result });
        const split = Math.floor(serialized.length / 2);
        child.stdout.write(serialized.slice(0, split));
        child.stdout.write(`${serialized.slice(split)}\n`);
      }
      callback();
    }
  });
  child.kill = () => {
    child.killed = true;
    queueMicrotask(() => child.emit("exit", 0, null));
    return true;
  };
  child.stdin.on("finish", () => queueMicrotask(() => child.emit("exit", 0, null)));
  return { child, messages };
}

test("the stdio client performs one MCP handshake and exposes only tool calls", async () => {
  const server = createFakeServer({
    tools: ["observe_filtered", "signal_show"],
    toolResult: {
      structuredContent: { visible: true, mode: "control" },
      content: [{ type: "text", text: "ignored duplicate" }]
    }
  });
  const spawns = [];
  const client = createMcpStdioClient({
    command: "open-compute-mcp",
    args: ["--profiled"],
    env: { OC_SAFETY_MODE: "confirm" },
    spawnImpl: (command, args, options) => {
      spawns.push({ command, args, options });
      return server.child;
    }
  });

  await client.start();
  assert.deepEqual(await client.listTools(), ["observe_filtered", "signal_show"]);
  assert.deepEqual(await client.callTool("signal_show", { mode: "control" }), {
    structuredContent: { visible: true, mode: "control" },
    content: [{ type: "text", text: "ignored duplicate" }]
  });
  assert.equal(spawns.length, 1);
  assert.equal(spawns[0].options.shell, false);
  assert.equal(spawns[0].options.windowsHide, true);
  assert.deepEqual(
    server.messages.map(({ method }) => method),
    ["initialize", "notifications/initialized", "tools/list", "tools/call"]
  );
  assert.deepEqual(server.messages.at(-1).params, {
    name: "signal_show",
    arguments: { mode: "control" }
  });

  await client.close();
  assert.equal(server.child.killed, false, "clean stdin EOF should stop the scoped server");
});

test("tool errors stay bounded and do not expose arbitrary server output", async () => {
  const server = createFakeServer({ tools: ["do"], toolError: "sensitive stack trace" });
  const client = createMcpStdioClient({
    command: "open-compute-mcp",
    spawnImpl: () => server.child
  });
  await client.start();

  await assert.rejects(
    client.callTool("do", { action: { type: "wait", duration: 0 } }),
    (error) => error instanceof McpStdioClientError &&
      error.code === "MCP_TOOL_FAILED" &&
      !error.message.includes("sensitive stack trace")
  );
  await client.close();
});

test("a bounded request timeout closes the pending request", async () => {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  child.kill = () => {
    child.killed = true;
    queueMicrotask(() => child.emit("exit", 0, null));
    return true;
  };
  const client = createMcpStdioClient({
    command: "silent-server",
    requestTimeoutMs: 25,
    spawnImpl: () => child
  });

  await assert.rejects(
    client.start(),
    (error) => error instanceof McpStdioClientError && error.code === "MCP_REQUEST_TIMEOUT"
  );
  assert.equal(child.killed, true, "a failed handshake must not leave the MCP child running");
});
