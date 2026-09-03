import process from "node:process";
import { fileURLToPath } from "node:url";

import { coworkToolDefinitions } from "../../../packages/native-webmcp/src/index.js";

// The Companion is a tool, not only a window: any local MCP client - Claude
// Code, Codex CLI, agy, a desktop app - speaks this stdio server and reaches
// the same nine Cowork tools a browser agent reaches on the page. The tool
// definitions come from the WebMCP registration itself, so the two surfaces
// cannot drift apart.
const MCP_PROTOCOL_VERSION = "2025-06-18";
const DEFAULT_ENDPOINT = "http://127.0.0.1:47831/cowork/v1";
const MAX_LINE_BYTES = 256 * 1024;

export class CompanionMcpError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CompanionMcpError";
    this.code = code;
  }
}

function assertLoopbackEndpoint(endpoint) {
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw new CompanionMcpError(
      "INVALID_COMPANION_ENDPOINT",
      "Companion endpoint must be an absolute loopback HTTP URL"
    );
  }
  if (
    url.protocol !== "http:" ||
    !new Set(["127.0.0.1", "localhost", "[::1]"]).has(url.hostname)
  ) {
    throw new CompanionMcpError(
      "INVALID_COMPANION_ENDPOINT",
      "The Cowork Companion is reachable only over an explicit loopback endpoint"
    );
  }
  return url.href.replace(/\/$/, "");
}

function toolResult(structuredContent) {
  return {
    content: [{ type: "text", text: JSON.stringify(structuredContent) }],
    structuredContent
  };
}

function toolError(code, message) {
  const structuredContent = { code, message };
  return { ...toolResult(structuredContent), isError: true };
}

export async function createCompanionMcpServer({
  endpoint = process.env.COWORK_COMPANION_ENDPOINT ?? DEFAULT_ENDPOINT,
  linkSessionId = process.env.COWORK_COMPANION_LINK_SESSION ?? null,
  fetchImpl = globalThis.fetch,
  requestTimeoutMilliseconds = 20_000,
  tools: providedTools = null
} = {}) {
  const tools = providedTools ?? await coworkToolDefinitions();
  const baseUrl = assertLoopbackEndpoint(endpoint);
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");
  let clientName = null;
  let initialized = false;

  async function callTool(name, toolArguments) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMilliseconds);
    let response;
    try {
      response = await fetchImpl(`${baseUrl}/agent/tools/${encodeURIComponent(name)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          arguments: toolArguments ?? {},
          linkSessionId,
          clientName
        }),
        signal: controller.signal
      });
    } catch {
      return toolError(
        "COMPANION_UNAVAILABLE",
        `No Cowork Companion is listening on ${baseUrl}. Start it with npm run start:companion-host.`
      );
    } finally {
      clearTimeout(timer);
    }
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!response.ok) {
      return toolError(
        typeof body?.code === "string" ? body.code : "COMPANION_REJECTED",
        typeof body?.message === "string"
          ? body.message
          : `The Cowork Companion rejected the call with status ${response.status}`
      );
    }
    return toolResult(body?.result ?? null);
  }

  async function handle(message) {
    if (message?.jsonrpc !== "2.0" || typeof message.method !== "string") {
      return message?.id === undefined
        ? null
        : {
            jsonrpc: "2.0",
            id: message.id,
            error: { code: -32_600, message: "Invalid JSON-RPC request" }
          };
    }
    const { id, method, params } = message;
    const isNotification = id === undefined || id === null;
    const reply = (result) => (isNotification ? null : { jsonrpc: "2.0", id, result });

    if (method === "initialize") {
      const name = params?.clientInfo?.name;
      clientName = typeof name === "string" && name.trim() !== ""
        ? name.trim().slice(0, 120)
        : "unnamed MCP client";
      return reply({
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "cowork-companion", version: "0.1.0" },
        instructions:
          "Cowork tools act on the page linked to this Companion. Offers are inert " +
          "until a human clicks them; solo execution needs a valid lease."
      });
    }
    if (method === "notifications/initialized") {
      initialized = true;
      return null;
    }
    if (method === "ping") return reply({});
    if (method === "tools/list") return reply({ tools });
    if (method === "tools/call") {
      const name = params?.name;
      if (!tools.some((tool) => tool.name === name)) {
        return isNotification ? null : {
          jsonrpc: "2.0",
          id,
          error: { code: -32_602, message: `Unknown tool: ${String(name).slice(0, 120)}` }
        };
      }
      return reply(await callTool(name, params?.arguments));
    }
    return isNotification ? null : {
      jsonrpc: "2.0",
      id,
      error: { code: -32_601, message: `Method not found: ${method.slice(0, 120)}` }
    };
  }

  return {
    handle,
    readState() {
      return { endpoint: baseUrl, clientName, initialized };
    }
  };
}

export async function runCompanionMcpServer({
  input = process.stdin,
  output = process.stdout,
  ...options
} = {}) {
  const server = await createCompanionMcpServer(options);
  let buffer = "";
  let queue = Promise.resolve();

  input.setEncoding?.("utf8");
  input.on("data", (chunk) => {
    buffer += chunk;
    if (buffer.length > MAX_LINE_BYTES) {
      buffer = "";
      return;
    }
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line === "") continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        output.write(`${JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32_700, message: "Parse error" }
        })}\n`);
        continue;
      }
      // One message at a time keeps replies in the order the client sent them.
      queue = queue.then(async () => {
        const response = await server.handle(message);
        if (response !== null) output.write(`${JSON.stringify(response)}\n`);
      });
    }
  });
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await runCompanionMcpServer();
}
