import { spawn } from "node:child_process";

export class McpStdioClientError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "McpStdioClientError";
    this.code = code;
  }
}

function validateConfig({ command, args, env, requestTimeoutMs }) {
  if (typeof command !== "string" || command.trim() === "" || command.length > 500) {
    throw new TypeError("MCP command must be a bounded executable name");
  }
  if (
    !Array.isArray(args) ||
    args.length > 32 ||
    args.some((value) => typeof value !== "string" || value.length > 1000)
  ) {
    throw new TypeError("MCP arguments must be a bounded string list");
  }
  if (
    !env ||
    typeof env !== "object" ||
    Array.isArray(env) ||
    Object.entries(env).some(
      ([key, value]) => !/^[A-Z_][A-Z0-9_]{0,79}$/i.test(key) || typeof value !== "string"
    )
  ) {
    throw new TypeError("MCP environment must contain string values");
  }
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 25 || requestTimeoutMs > 120_000) {
    throw new TypeError("MCP request timeout must be in 25..120000 milliseconds");
  }
}

export function createMcpStdioClient({
  command,
  args = [],
  env = {},
  cwd = process.cwd(),
  requestTimeoutMs = 10_000,
  spawnImpl = spawn
}) {
  validateConfig({ command, args, env, requestTimeoutMs });
  if (typeof cwd !== "string" || cwd === "" || cwd.length > 1000) {
    throw new TypeError("MCP working directory must be bounded");
  }
  if (typeof spawnImpl !== "function") throw new TypeError("spawnImpl must be a function");

  let child = null;
  let started = false;
  let exited = false;
  let nextId = 1;
  let stdoutBuffer = "";
  let stderrTail = "";
  let exitResolve;
  let exitPromise = Promise.resolve();
  const pending = new Map();

  function rejectPending(code, message) {
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(new McpStdioClientError(code, message));
    }
    pending.clear();
  }

  function handleMessage(message) {
    if (!message || message.jsonrpc !== "2.0" || message.id === undefined) return;
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    clearTimeout(entry.timer);
    if (message.error) {
      entry.reject(new McpStdioClientError(
        "MCP_REQUEST_FAILED",
        "The Open Compute MCP server rejected a request"
      ));
      return;
    }
    entry.resolve(message.result);
  }

  function handleStdout(chunk) {
    stdoutBuffer += chunk.toString("utf8");
    if (stdoutBuffer.length > 2 * 1024 * 1024) {
      rejectPending("MCP_PROTOCOL_ERROR", "Open Compute MCP output exceeded its line budget");
      stdoutBuffer = "";
      return;
    }
    let newline;
    while ((newline = stdoutBuffer.indexOf("\n")) >= 0) {
      const line = stdoutBuffer.slice(0, newline).trim();
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      if (!line) continue;
      try {
        handleMessage(JSON.parse(line));
      } catch {
        rejectPending("MCP_PROTOCOL_ERROR", "Open Compute MCP returned invalid JSON-RPC");
      }
    }
  }

  function writeMessage(message) {
    if (!child || exited || !child.stdin?.writable) {
      throw new McpStdioClientError(
        "MCP_PROCESS_UNAVAILABLE",
        "Open Compute MCP is not available"
      );
    }
    child.stdin.write(`${JSON.stringify(message)}\n`, "utf8");
  }

  function request(method, params = {}) {
    const id = nextId;
    nextId += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new McpStdioClientError(
          "MCP_REQUEST_TIMEOUT",
          "Open Compute MCP did not answer within the bounded timeout"
        ));
      }, requestTimeoutMs);
      pending.set(id, { resolve, reject, timer });
      try {
        writeMessage({ jsonrpc: "2.0", id, method, params });
      } catch (error) {
        clearTimeout(timer);
        pending.delete(id);
        reject(error);
      }
    });
  }

  function notify(method, params = {}) {
    writeMessage({ jsonrpc: "2.0", method, params });
  }

  async function closeProcess() {
    if (child && !exited) {
      try {
        child.stdin.end();
      } catch {
        // The scoped child may already be stopping.
      }
      await Promise.race([
        exitPromise,
        new Promise((resolve) => setTimeout(resolve, 500))
      ]);
      if (!exited) {
        child.kill();
        await Promise.race([
          exitPromise,
          new Promise((resolve) => setTimeout(resolve, 500))
        ]);
      }
    }
    rejectPending("MCP_CLIENT_CLOSED", "Open Compute MCP client closed");
    child = null;
    started = false;
    exited = true;
    stderrTail = "";
  }

  return {
    async start() {
      if (started && !exited) return;
      try {
        child = spawnImpl(command, [...args], {
          cwd,
          env: { ...process.env, ...env },
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
          shell: false
        });
      } catch {
        throw new McpStdioClientError(
          "MCP_PROCESS_START_FAILED",
          "Open Compute MCP could not be started"
        );
      }
      if (!child?.stdin || !child?.stdout || !child?.stderr) {
        throw new McpStdioClientError(
          "MCP_PROCESS_START_FAILED",
          "Open Compute MCP did not expose stdio"
        );
      }
      started = true;
      exited = false;
      stdoutBuffer = "";
      stderrTail = "";
      exitPromise = new Promise((resolve) => { exitResolve = resolve; });
      child.stdout.on("data", handleStdout);
      child.stderr.on("data", (chunk) => {
        stderrTail = `${stderrTail}${chunk.toString("utf8")}`.slice(-4000);
      });
      child.once("error", () => {
        exited = true;
        rejectPending("MCP_PROCESS_FAILED", "Open Compute MCP process failed");
        exitResolve?.();
      });
      child.once("exit", () => {
        exited = true;
        rejectPending("MCP_PROCESS_EXITED", "Open Compute MCP process exited");
        exitResolve?.();
      });

      try {
        const initialized = await request("initialize", {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "cowork-protocol", version: "0.1.0" }
        });
        if (
          !initialized ||
          typeof initialized !== "object" ||
          typeof initialized.protocolVersion !== "string" ||
          !initialized.capabilities
        ) {
          throw new McpStdioClientError(
            "MCP_HANDSHAKE_INVALID",
            "Open Compute MCP returned an invalid handshake"
          );
        }
        notify("notifications/initialized");
      } catch (error) {
        await closeProcess();
        throw error;
      }
    },

    async listTools() {
      if (!started || exited) {
        throw new McpStdioClientError("MCP_PROCESS_UNAVAILABLE", "Open Compute MCP is not started");
      }
      const result = await request("tools/list");
      if (!Array.isArray(result?.tools)) {
        throw new McpStdioClientError(
          "MCP_TOOL_LIST_INVALID",
          "Open Compute MCP returned an invalid tool list"
        );
      }
      return result.tools.map(({ name }) => name).filter(
        (name) => typeof name === "string" && name.length <= 120
      );
    },

    async callTool(name, arguments_ = {}) {
      if (typeof name !== "string" || name === "" || name.length > 120) {
        throw new TypeError("MCP tool name must be bounded");
      }
      const result = await request("tools/call", { name, arguments: arguments_ });
      if (result?.isError === true) {
        throw new McpStdioClientError(
          "MCP_TOOL_FAILED",
          "Open Compute MCP tool failed"
        );
      }
      return result;
    },

    async close() {
      await closeProcess();
    }
  };
}
