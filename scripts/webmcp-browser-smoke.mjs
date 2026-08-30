import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createStaticServer } from "./serve.mjs";
import { validateNativeWebMcpObservation } from "./webmcp-browser-smoke-lib.mjs";

const profilePath = await mkdtemp(path.join(tmpdir(), "cowork-webmcp-smoke-"));
let server;
let browser;

async function firstExisting(paths) {
  for (const candidate of paths) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next explicit browser location.
    }
  }
  return null;
}

async function resolveChromePath() {
  if (process.env.COWORK_CHROME_PATH) {
    await access(process.env.COWORK_CHROME_PATH);
    return process.env.COWORK_CHROME_PATH;
  }
  const candidate = await firstExisting([
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable"
  ]);
  if (!candidate) {
    throw new Error("Chrome was not found; set COWORK_CHROME_PATH to a Chrome 150+ executable");
  }
  return candidate;
}

async function waitForJson(url, attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      // Retry only processes started by this script.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForDevToolsPort(attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const contents = await readFile(path.join(profilePath, "DevToolsActivePort"), "utf8");
      const port = Number(contents.split(/\r?\n/, 1)[0]);
      if (Number.isInteger(port) && port > 0) return port;
    } catch {
      // Retry only the isolated Chrome profile created by this script.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Timed out waiting for Chrome's isolated DevTools port");
}

function connect(webSocketDebuggerUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketDebuggerUrl);
    socket.addEventListener("open", () => resolve(socket), { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
}

function cdpClient(socket) {
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });
  return (method, params = {}) => {
    const id = ++nextId;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  };
}

try {
  const chromePath = await resolveChromePath();
  server = createStaticServer({ root: process.cwd() });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const serverAddress = server.address();
  if (!serverAddress || typeof serverAddress === "string") {
    throw new Error("The isolated showcase server did not expose a TCP port");
  }
  const showcaseUrl = `http://127.0.0.1:${serverAddress.port}/apps/formbuilder-showcase/`;

  browser = spawn(
    chromePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--enable-features=WebMCP,WebMCPTesting",
      "--enable-blink-features=WebMCP",
      "--remote-debugging-port=0",
      `--user-data-dir=${profilePath}`,
      showcaseUrl
    ],
    { windowsHide: true, stdio: "ignore" }
  );

  const debugPort = await waitForDevToolsPort();
  const version = await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
  const targets = await waitForJson(`http://127.0.0.1:${debugPort}/json`);
  const target = targets.find(
    (candidate) => candidate.type === "page" && candidate.url.includes("formbuilder-showcase")
  );
  if (!target) throw new Error("Showcase page target not found");

  const socket = await connect(target.webSocketDebuggerUrl);
  const call = cdpClient(socket);
  await call("Runtime.enable");
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const evaluation = await call("Runtime.evaluate", {
    expression: `(async () => {
      const modelContext = document.modelContext;
      const observed = {
        secureContext: window.isSecureContext,
        modelContextAvailable: Boolean(modelContext),
        methods: {
          registerTool: typeof modelContext?.registerTool,
          getTools: typeof modelContext?.getTools,
          executeTool: typeof modelContext?.executeTool
        },
        badge: document.querySelector("#capability-badge")?.textContent.trim()
      };
      if (!modelContext || typeof modelContext.getTools !== "function") return observed;

      const tools = await modelContext.getTools();
      observed.toolNames = tools.map((tool) => tool.name).sort();
      const field = document.querySelector('[data-field-id="full-name"]');
      field.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));

      function parsePacket(result) {
        const envelope = JSON.parse(result);
        return envelope.structuredContent;
      }
      async function executeReadOnly(tool, input) {
        try {
          const result = await modelContext.executeTool(tool, input);
          return { argumentKind: "object", packet: parsePacket(result) };
        } catch (objectError) {
          const result = await modelContext.executeTool(tool, JSON.stringify(input));
          return {
            argumentKind: "json-string",
            objectAttempt: objectError.name + ": " + objectError.message,
            packet: parsePacket(result)
          };
        }
      }

      observed.focusExecution = await executeReadOnly(
        tools.find((tool) => tool.name === "cowork_read_focus"),
        {}
      );
      observed.contextExecution = await executeReadOnly(
        tools.find((tool) => tool.name === "cowork_request_context"),
        { reason: "Need the related field rules for this focused control" }
      );
      return observed;
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  if (evaluation.exceptionDetails) throw new Error(JSON.stringify(evaluation.exceptionDetails));

  const observed = {
    browserVersion: version.Browser,
    ...evaluation.result.value
  };
  const summary = validateNativeWebMcpObservation(observed);
  console.log(JSON.stringify({
    ...summary,
    hostTokenClaim: false,
    toolNames: observed.toolNames
  }, null, 2));
  socket.close();
} finally {
  browser?.kill();
  if (server?.listening) {
    await new Promise((resolve) => server.close(resolve));
  }
  await rm(profilePath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
