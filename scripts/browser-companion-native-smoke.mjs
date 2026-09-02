import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { removeTempProfile, resolveExtensionBrowserPath } from "./smoke-runtime.mjs";

import { buildBrowserCompanion } from "./build-browser-companion.mjs";
import { createStaticServer } from "./serve.mjs";

const profilePath = await mkdtemp(path.join(tmpdir(), "cowork-native-companion-"));
const extensionPath = path.resolve("dist-browser-companion");
let browser;
let server;

async function waitForJson(url, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      // Retry only the isolated browser process owned by this smoke.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForDevToolsPort() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const text = await readFile(path.join(profilePath, "DevToolsActivePort"), "utf8");
      const port = Number(text.split(/\r?\n/, 1)[0]);
      if (Number.isInteger(port) && port > 0) return port;
    } catch {
      // Retry the isolated profile.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Timed out waiting for Chrome DevTools");
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.addEventListener("open", () => resolve(socket), { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
}

function cdpClient(socket, onEvent) {
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!Object.hasOwn(message, "id")) {
      onEvent?.(message);
      return;
    }
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

async function evaluate(call, expression, contextId) {
  const result = await call("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    ...(contextId ? { contextId } : {})
  });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}

async function waitForValue(call, expression, predicate, contextId) {
  let value;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    value = await evaluate(call, expression, contextId);
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for value: ${JSON.stringify(value)}`);
}

async function waitForExtensionContext(contexts, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const context = [...contexts.values()].find(
      (candidate) =>
        candidate.auxData?.type === "isolated" &&
        (candidate.origin?.startsWith("chrome-extension://") ||
          candidate.name?.startsWith("chrome-extension://"))
    );
    if (context) return context;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Extension isolated context not found: ${JSON.stringify(
    [...contexts.values()].map(({ id, name, origin, auxData }) => ({
      id,
      name,
      origin,
      type: auxData?.type
    }))
  )}`);
}

async function invokeExtensionActionShortcut(call) {
  const input = {
    modifiers: 10,
    key: "Y",
    code: "KeyY",
    windowsVirtualKeyCode: 89,
    nativeVirtualKeyCode: 89
  };
  await call("Input.dispatchKeyEvent", { type: "rawKeyDown", ...input });
  await call("Input.dispatchKeyEvent", { type: "keyUp", ...input });
}

async function activateExtensionWithRetry(call, contexts) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await call("Page.bringToFront");
    await invokeExtensionActionShortcut(call);
    try {
      return await waitForExtensionContext(contexts, 15);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function stopBrowser(child) {
  if (!child || child.exitCode !== null) return;
  const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
    windowsHide: true,
    stdio: "ignore"
  });
  await new Promise((resolve) => killer.once("exit", resolve));
}

try {
  await buildBrowserCompanion({ sourceRoot: process.cwd(), outputRoot: extensionPath });
  server = createStaticServer({ root: process.cwd() });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const showcaseUrl =
    `http://127.0.0.1:${address.port}/apps/formbuilder-showcase/`;
  browser = spawn(await resolveExtensionBrowserPath(), [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--enable-features=WebMCP,WebMCPTesting",
    "--enable-blink-features=WebMCP",
    "--remote-debugging-port=0",
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    `--user-data-dir=${profilePath}`,
    showcaseUrl
  ], { windowsHide: true, stdio: "ignore" });

  const debugPort = await waitForDevToolsPort();
  const version = await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
  const targets = await waitForJson(`http://127.0.0.1:${debugPort}/json`);
  const target = targets.find(
    (candidate) => candidate.type === "page" && candidate.url.includes("formbuilder-showcase")
  );
  if (!target) throw new Error("FormBuilder target not found");
  const contexts = new Map();
  const socket = await connect(target.webSocketDebuggerUrl);
  const call = cdpClient(socket, (event) => {
    if (event.method === "Runtime.executionContextCreated") {
      contexts.set(event.params.context.id, event.params.context);
    }
  });
  await call("Runtime.enable");
  await call("Page.reload", { ignoreCache: true });
  await waitForValue(
    call,
    `document.querySelector("#system-status")?.textContent ?? ""`,
    (value) => value.includes("Nine Native WebMCP tools registered")
  );
  const relayAbsentBeforeAction = await evaluate(
    call,
    `globalThis.__coworkNativePageBridgeInstalled !== true`
  );
  const isolatedContextsBeforeAction = [...contexts.values()].filter(
    (candidate) =>
      candidate.auxData?.type === "isolated" &&
      (candidate.origin?.startsWith("chrome-extension://") ||
        candidate.name?.startsWith("chrome-extension://"))
  ).length;
  await call("Page.bringToFront");
  const extensionContext = await activateExtensionWithRetry(call, contexts);
  const extensionContextId = extensionContext.id;
  await evaluate(
    call,
    `document.querySelector("#full-name").dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }))`,
    undefined
  );
  const enabledState = await waitForValue(
    call,
    `globalThis.__coworkBrowserCompanionLoading.then((api) => api.state())`,
    (value) =>
      value?.enabled === true &&
      value?.mode === "native-cowork" &&
      value?.nativeToolCount >= 9 &&
      value?.fallbackActive === false,
    extensionContextId
  );
  const focus = await evaluate(
    call,
    `globalThis.__coworkBrowserCompanionLoading.then((api) => api.request("readFocus", {}))`,
    extensionContextId
  );
  const pageUiInjected = await evaluate(
    call,
    `document.querySelector("#cowork-browser-companion-root") !== null`
  );
  if (
    enabledState.mode !== "native-cowork" ||
    enabledState.nativeToolCount < 9 ||
    enabledState.fallbackActive !== false ||
    focus.capabilityLevel !== "native" ||
    pageUiInjected ||
    relayAbsentBeforeAction !== true ||
    isolatedContextsBeforeAction !== 0
  ) {
    throw new Error(`Native-first companion assertion failed: ${JSON.stringify({
      enabledState,
      focus,
      pageUiInjected
    })}`);
  }
  console.log(JSON.stringify({
    nativeFirstCompanionClaim: true,
    userInitiatedActiveTabClaim: true,
    browserVersion: version.Browser,
    mode: enabledState.mode,
    nativeToolCount: enabledState.nativeToolCount,
    fallbackActive: enabledState.fallbackActive,
    focusCapabilityLevel: focus.capabilityLevel,
    pageUiInjected
  }, null, 2));
  socket.close();
} finally {
  await stopBrowser(browser);
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  await removeTempProfile(profilePath);
}
