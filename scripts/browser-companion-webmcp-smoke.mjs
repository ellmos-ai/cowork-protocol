// Cowork tools on a page that has none: the extension registers them itself,
// so any WebMCP agent in the browser reads and proposes through the same
// bounded relay, and the click still happens in the Side Panel.
import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { removeTempProfile, resolveExtensionBrowserPath } from "./smoke-runtime.mjs";
import { buildBrowserCompanion } from "./build-browser-companion.mjs";
import { createStaticServer } from "./serve.mjs";

const EXPECTED_TOOLS = [
  "cowork_read_focus",
  "cowork_request_context",
  "cowork_offer_action",
  "cowork_read_presence"
];
const PROPOSED_VALUE = "Cowork Everywhere";

const profilePath = await mkdtemp(path.join(tmpdir(), "cowork-webmcp-companion-"));
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

async function waitForPageTarget(debugPort, predicate, attempts = 80) {
  let seen = [];
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    seen = await waitForJson(`http://127.0.0.1:${debugPort}/json`);
    const target = seen.find(
      (candidate) => candidate.type === "page" && predicate(candidate)
    );
    if (target?.webSocketDebuggerUrl) return target;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Target not found: ${JSON.stringify(seen.map(({ url }) => url))}`);
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

async function waitForValue(call, expression, predicate, contextId, attempts = 100) {
  let value;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    value = await evaluate(call, expression, contextId);
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for value: ${JSON.stringify(value)}`);
}

/** Exactly how the page's own agent would call a registered WebMCP tool. */
function executeToolExpression(name, input) {
  return `(async () => {
    const tools = await document.modelContext.getTools();
    const tool = tools.find((candidate) => candidate.name === ${JSON.stringify(name)});
    if (!tool) throw new Error("tool not registered: ${name}");
    const raw = await document.modelContext.executeTool(tool, ${
      JSON.stringify(JSON.stringify(input))
    });
    const envelope = typeof raw === "string" ? JSON.parse(raw) : raw;
    return envelope?.structuredContent ?? envelope;
  })()`;
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
  throw new Error("Extension isolated context not found");
}

async function activateExtensionWithRetry(call, contexts) {
  const input = {
    modifiers: 10,
    key: "Y",
    code: "KeyY",
    windowsVirtualKeyCode: 89,
    nativeVirtualKeyCode: 89
  };
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await call("Page.bringToFront");
    await call("Input.dispatchKeyEvent", { type: "rawKeyDown", ...input });
    await call("Input.dispatchKeyEvent", { type: "keyUp", ...input });
    try {
      return await waitForExtensionContext(contexts, 15);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/** A real, browser-generated click on one Side Panel control. */
async function trustedClick(call, selector) {
  const rect = await evaluate(call, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    const box = element.getBoundingClientRect();
    return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  })()`);
  for (const type of ["mousePressed", "mouseReleased"]) {
    await call("Input.dispatchMouseEvent", {
      type,
      x: rect.x,
      y: rect.y,
      button: "left",
      clickCount: 1
    });
  }
  return rect;
}

function requireCondition(condition, message, detail) {
  if (!condition) throw new Error(`${message}: ${JSON.stringify(detail)}`);
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
  const fixtureUrl =
    `http://127.0.0.1:${address.port}/apps/browser-companion/test/fixture.html`;
  browser = spawn(await resolveExtensionBrowserPath(), [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--enable-features=WebMCP,WebMCPTesting",
    "--enable-blink-features=WebMCP",
    "--force-device-scale-factor=1",
    "--window-size=1200,900",
    "--remote-debugging-port=0",
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    `--user-data-dir=${profilePath}`,
    fixtureUrl
  ], { windowsHide: true, stdio: "ignore" });

  const debugPort = await waitForDevToolsPort();
  const version = await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
  const target = await waitForPageTarget(debugPort, ({ url }) => url.includes("fixture.html"));
  const contexts = new Map();
  const socket = await connect(target.webSocketDebuggerUrl);
  const call = cdpClient(socket, (event) => {
    if (event.method === "Runtime.executionContextCreated") {
      contexts.set(event.params.context.id, event.params.context);
    } else if (event.method === "Runtime.executionContextDestroyed") {
      contexts.delete(event.params.executionContextId);
    } else if (event.method === "Runtime.executionContextsCleared") {
      contexts.clear();
    }
  });
  await call("Runtime.enable");
  await call("Page.bringToFront");
  await call("Page.reload", { ignoreCache: true });
  await new Promise((resolve) => setTimeout(resolve, 500));
  await call("Runtime.disable");
  contexts.clear();
  await call("Runtime.enable");
  await call("Page.bringToFront");

  const webMcpAvailable = await evaluate(call, "Boolean(document.modelContext)");
  const pageToolsBeforeAction = await evaluate(call, `(async () => {
    const tools = await document.modelContext.getTools();
    return tools.map((tool) => tool.name);
  })()`);
  const relayAbsentBeforeAction = await evaluate(
    call,
    "globalThis.__coworkNativePageBridgeInstalled !== true"
  );

  const extensionContext = await activateExtensionWithRetry(call, contexts);
  const extensionContextId = extensionContext.id;
  const extensionOrigin =
    (extensionContext.origin?.startsWith("chrome-extension://")
      ? extensionContext.origin
      : extensionContext.name?.match(/chrome-extension:\/\/[^/]+/)?.[0]) ?? null;
  if (!extensionOrigin) throw new Error("Extension origin was not exposed by Chrome");

  const enabledState = await waitForValue(
    call,
    "globalThis.__coworkBrowserCompanionLoading.then((api) => api.state())",
    (value) =>
      value?.enabled === true &&
      value?.mode === "legacy-host-companion" &&
      value?.toolsRegistered === true,
    extensionContextId
  );

  // The page now advertises the tools the extension put there.
  const registeredToolNames = await waitForValue(
    call,
    `(async () => {
      const tools = await document.modelContext.getTools();
      return tools.map((tool) => tool.name);
    })()`,
    (value) => EXPECTED_TOOLS.every((name) => value?.includes(name))
  );

  // The human points at a control; the agent never chooses the target.
  await evaluate(call, 'document.querySelector("#project-title").focus()');
  const focus = await evaluate(call, executeToolExpression("cowork_read_focus", {}));
  const presence = await evaluate(call, executeToolExpression("cowork_read_presence", {}));
  const valueBeforeOffer = await evaluate(
    call,
    'document.querySelector("#project-title").value'
  );
  const offerResult = await evaluate(call, executeToolExpression("cowork_offer_action", {
    capabilityId: "legacy.offer_value",
    targetId: focus?.targetId,
    value: PROPOSED_VALUE,
    summary: "Use Cowork Everywhere as the project title"
  }));
  const valueAfterOffer = await evaluate(
    call,
    'document.querySelector("#project-title").value'
  );
  const offeredState = await waitForValue(
    call,
    "globalThis.__coworkBrowserCompanionLoading.then((api) => api.state())",
    (value) => typeof value?.pendingOffer?.offerId === "string",
    extensionContextId
  );

  // The click is the human's, in the panel, on a real button.
  await call("Target.createTarget", { url: `${extensionOrigin}/sidepanel.html` });
  const sidePanelTarget = await waitForPageTarget(
    debugPort,
    ({ url }) => url === `${extensionOrigin}/sidepanel.html`
  );
  const sidePanelSocket = await connect(sidePanelTarget.webSocketDebuggerUrl);
  const sidePanelCall = cdpClient(sidePanelSocket);
  await sidePanelCall("Runtime.enable");
  await sidePanelCall("Page.enable");
  await sidePanelCall("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: false
  });
  await sidePanelCall("Page.bringToFront");
  const panelOffer = await waitForValue(
    sidePanelCall,
    `(() => {
      const button = document.querySelector("#offer-action");
      return {
        visible: Boolean(button && !document.querySelector("#offer-card").hidden),
        offerId: button?.dataset.offerId ?? "",
        route: document.documentElement.dataset.route ??
          document.querySelector("[data-route]")?.dataset.route ?? "",
        routeExplainer: document.querySelector("#route-explainer")?.textContent ?? "",
        bridge: document.querySelector(".cowork-cockpit")?.dataset.bridge ?? "",
        bridgeMessage: document.querySelector("#bridge-message")?.textContent ?? ""
      };
    })()`,
    (value) => value?.visible === true
  );
  await trustedClick(sidePanelCall, "#offer-action");
  await new Promise((resolve) => setTimeout(resolve, 200));
  const afterClickState = await waitForValue(
    sidePanelCall,
    `(async () => {
      const envelope = await chrome.runtime.sendMessage({
        type: "cowork:sidepanel:get-state"
      });
      return envelope?.result?.state ?? null;
    })()`,
    (value) => value?.pendingOffer === null
  );
  const valueAfterHumanClick = await evaluate(
    call,
    'document.querySelector("#project-title").value'
  );

  requireCondition(
    webMcpAvailable === true && relayAbsentBeforeAction === true,
    "WebMCP must be live and the relay absent before the trusted action",
    { webMcpAvailable, relayAbsentBeforeAction }
  );
  requireCondition(
    pageToolsBeforeAction.length === 0,
    "The fixture must expose no tools of its own",
    { pageToolsBeforeAction }
  );
  requireCondition(
    EXPECTED_TOOLS.every((name) => registeredToolNames.includes(name)),
    "The extension must register its four Cowork tools on the page",
    { registeredToolNames }
  );
  requireCondition(
    typeof focus?.targetId === "string" &&
      focus.targetId.startsWith("legacy-dom:") &&
      focus.capabilityIds?.includes("legacy.offer_value"),
    "cowork_read_focus must return the bounded legacy focus packet",
    { focus }
  );
  requireCondition(
    presence?.human?.availability === "here" && presence?.modelAuthorityValid === false,
    "cowork_read_presence must report the human seat and the missing grant",
    { presence }
  );
  requireCondition(
    valueBeforeOffer === "Draft" &&
      valueAfterOffer === "Draft" &&
      offerResult?.requiresHumanConfirmation === true &&
      offeredState.pendingOffer.offerId.startsWith("webmcp-offer:"),
    "cowork_offer_action must create an inert offer and change nothing",
    { valueBeforeOffer, valueAfterOffer, offerResult, pendingOffer: offeredState.pendingOffer }
  );
  requireCondition(
    panelOffer.route === "bridge-webmcp" &&
      panelOffer.routeExplainer.includes("this bridge registered them"),
    "The Side Panel must name the registered-tools route",
    { panelOffer }
  );
  // An attached bridge with nobody on it says so, and only an agent's own tool
  // call puts a model on it. Enabling the relay is the human's hand and must
  // not count.
  requireCondition(
    enabledState.agentLastSeenAt === null,
    "An enabled bridge no agent has called must still be empty",
    { agentLastSeenAt: enabledState.agentLastSeenAt }
  );
  requireCondition(
    Number.isFinite(offeredState.agentLastSeenAt) &&
      panelOffer.bridge === "crossing" &&
      panelOffer.bridgeMessage.trim() === "A model is on the bridge.",
    "The agent's tool calls must put a model on the bridge in the panel",
    {
      agentLastSeenAt: offeredState.agentLastSeenAt,
      bridge: panelOffer.bridge,
      bridgeMessage: panelOffer.bridgeMessage
    }
  );
  requireCondition(
    afterClickState.lastTrustedHumanClick === true &&
      valueAfterHumanClick === PROPOSED_VALUE &&
      afterClickState.statusText === "Verified after your click",
    "Only the human click in the panel may apply and verify the value",
    { afterClickState, valueAfterHumanClick }
  );

  console.log(JSON.stringify({
    extensionRegisteredToolsClaim: true,
    browserVersion: version.Browser,
    pageToolsBeforeAction,
    registeredToolNames,
    mode: enabledState.mode,
    toolsRegistered: enabledState.toolsRegistered,
    panelRoute: panelOffer.route,
    bridgeEmptyBeforeAgent: enabledState.agentLastSeenAt === null,
    panelBridgeAfterAgent: panelOffer.bridge,
    focusTargetId: focus.targetId,
    valueBeforeOffer,
    valueAfterOffer,
    valueAfterHumanClick,
    trustedHumanClick: afterClickState.lastTrustedHumanClick,
    agentClientClaim: false
  }, null, 2));
  sidePanelSocket.close();
  socket.close();
} finally {
  await stopBrowser(browser);
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  await removeTempProfile(profilePath);
}
