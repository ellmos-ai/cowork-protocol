import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { buildBrowserCompanion } from "./build-browser-companion.mjs";
import { validateBrowserCompanionObservation } from "./browser-companion-smoke-lib.mjs";
import { createStaticServer } from "./serve.mjs";

const profilePath = await mkdtemp(path.join(tmpdir(), "cowork-companion-smoke-"));
const extensionPath = path.resolve("dist-browser-companion");
const evidenceDirectory = process.env.COWORK_COMPANION_EVIDENCE_DIR
  ? path.resolve(process.env.COWORK_COMPANION_EVIDENCE_DIR)
  : null;
let server;
let browser;

async function firstExisting(paths) {
  for (const candidate of paths) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next explicit browser path.
    }
  }
  return null;
}

async function installedChromeForTesting() {
  if (process.platform !== "win32") return null;
  const root = "C:\\_Local_DEV\\tools\\chrome-for-testing\\chrome";
  try {
    const versions = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
    for (const version of versions) {
      const candidate = path.join(root, version, "chrome-win64", "chrome.exe");
      try {
        await access(candidate);
        return candidate;
      } catch {
        // Try the next locally installed testing version.
      }
    }
  } catch {
    // The optional local testing-browser cache is absent.
  }
  return null;
}

async function resolveChromePath() {
  const configuredPath =
    process.env.COWORK_COMPANION_BROWSER_PATH ?? process.env.COWORK_CHROME_PATH;
  if (configuredPath) {
    await access(configuredPath);
    return configuredPath;
  }
  const testingBrowser = await installedChromeForTesting();
  if (testingBrowser) return testingBrowser;
  const candidate = await firstExisting([
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable"
  ]);
  if (!candidate) throw new Error("Chrome was not found; set COWORK_CHROME_PATH");
  return candidate;
}

async function waitForJson(url, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      // Retry only the isolated process owned by this smoke.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForPageTarget(debugPort, predicate, attempts = 80) {
  let lastTargets = [];
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const targets = await waitForJson(`http://127.0.0.1:${debugPort}/json`, 1);
    lastTargets = targets.map(({ id, title, type, url }) => ({ id, title, type, url }));
    const target = targets.find(
      (candidate) => candidate.type === "page" && predicate(candidate)
    );
    if (target) return target;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(
    `No-WebMCP companion fixture target not found: ${JSON.stringify(lastTargets)}`
  );
}

async function waitForDevToolsPort(attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const text = await readFile(path.join(profilePath, "DevToolsActivePort"), "utf8");
      const port = Number(text.split(/\r?\n/, 1)[0]);
      if (Number.isInteger(port) && port > 0) return port;
    } catch {
      // Retry only the isolated profile created by this script.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Timed out waiting for Chrome's isolated DevTools port");
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

async function evaluateValue(call, expression, contextId) {
  const result = await call("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    ...(contextId ? { contextId } : {})
  });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}

async function waitForValue(call, expression, predicate, attempts = 80) {
  let value;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    value = await evaluateValue(call, expression);
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for browser value: ${JSON.stringify(value)}`);
}

async function captureEvidenceFrame(call, filename) {
  if (!evidenceDirectory) return null;
  await mkdir(evidenceDirectory, { recursive: true });
  const result = await call("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
    fromSurface: true
  });
  const outputPath = path.join(evidenceDirectory, filename);
  await writeFile(outputPath, Buffer.from(result.data, "base64"));
  return path.basename(outputPath);
}

async function waitForExtensionContext(contexts, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const context = [...contexts.values()].find(
      (candidate) =>
        candidate.auxData?.type === "isolated" &&
        (candidate.origin?.startsWith("chrome-extension://") ||
          candidate.name?.startsWith("chrome-extension://"))
    );
    if (context) return context.id;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(
    `Extension content context not found: ${JSON.stringify(
      [...contexts.values()].map(({ id, name, origin, auxData }) => ({
        id,
        name,
        origin,
        type: auxData?.type
      }))
    )}`
  );
}

async function trustedClick(call, elementExpression, label) {
  const point = await evaluateValue(call, `(() => {
    const element = ${elementExpression};
    if (!element) return null;
    element.scrollIntoView({ block: "center", inline: "center" });
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2,
      visible: rect.width > 0 && rect.height > 0 };
  })()`);
  if (!point?.visible) throw new Error(`${label} is not visible`);
  await call("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: point.x,
    y: point.y
  });
  await call("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: point.x,
    y: point.y,
    button: "left",
    buttons: 1,
    clickCount: 1
  });
  await call("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: point.x,
    y: point.y,
    button: "left",
    buttons: 0,
    clickCount: 1
  });
  return point;
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

async function stopOwnedBrowser(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  if (process.platform === "win32" && child.pid) {
    await new Promise((resolve) => {
      const killer = spawn(
        "taskkill.exe",
        ["/PID", String(child.pid), "/T", "/F"],
        { windowsHide: true, stdio: "ignore" }
      );
      killer.once("exit", resolve);
      killer.once("error", resolve);
    });
  } else {
    child.kill("SIGKILL");
  }
  await Promise.race([
    exited,
    new Promise((resolve) => setTimeout(resolve, 5000))
  ]);
}

try {
  await buildBrowserCompanion({ sourceRoot: process.cwd(), outputRoot: extensionPath });
  const chromePath = await resolveChromePath();
  server = createStaticServer({ root: process.cwd() });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Smoke server has no TCP port");
  const fixtureUrl =
    `http://127.0.0.1:${address.port}/apps/browser-companion/test/fixture.html`;

  browser = spawn(
    chromePath,
    [
      ...(process.env.COWORK_COMPANION_HEADFUL === "1"
        ? process.env.COWORK_COMPANION_VISIBLE === "1"
          ? []
          : ["--window-position=-32000,-32000"]
        : ["--headless=new"]),
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "--disable-features=WebMCP,WebMCPTesting",
      "--disable-blink-features=WebMCP",
      "--force-device-scale-factor=1",
      "--remote-debugging-port=0",
      "--window-size=1200,900",
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      `--user-data-dir=${profilePath}`,
      fixtureUrl
    ],
    {
      windowsHide: process.env.COWORK_COMPANION_VISIBLE !== "1",
      stdio: "ignore"
    }
  );

  const debugPort = await waitForDevToolsPort();
  const version = await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
  const target = await waitForPageTarget(
    debugPort,
    (candidate) => candidate.url.includes("fixture.html")
  );

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
  await new Promise((resolve) => setTimeout(resolve, 100));
  const relayAbsentBeforeAction = await evaluateValue(
    call,
    "globalThis.__coworkNativePageBridgeInstalled !== true"
  );
  const isolatedContextsBeforeAction = [...contexts.values()].filter(
    (candidate) =>
      candidate.auxData?.type === "isolated" &&
      (candidate.origin?.startsWith("chrome-extension://") ||
        candidate.name?.startsWith("chrome-extension://"))
  ).length;
  const extensionContextId = await activateExtensionWithRetry(call, contexts);
  const extensionContext = contexts.get(extensionContextId);
  const extensionOrigin = extensionContext?.origin?.startsWith("chrome-extension://")
    ? extensionContext.origin
    : extensionContext?.name?.match(/chrome-extension:\/\/[^/]+/)?.[0];
  if (!extensionOrigin) throw new Error("Extension origin was not exposed by Chrome");
  const extensionState = (expression) =>
    evaluateValue(
      call,
      `globalThis.__coworkBrowserCompanionLoading.then((api) => ${expression})`,
      extensionContextId
    );

  const webMcpAvailable = await evaluateValue(call, "Boolean(document.modelContext)");
  let enabledState = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    enabledState = await extensionState("api.state()");
    if (
      enabledState?.enabled === true &&
      enabledState?.mode === "legacy-host-companion" &&
      enabledState?.fallbackActive === true
    ) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
  const pointer = await trustedClick(
    call,
    'document.querySelector("#project-title")',
    "Project title input"
  );
  const focus = await evaluateValue(
    call,
    'window.coworkCompanionRequest("readFocus", { lens: "pointer" })'
  );
  const nearbyContext = await evaluateValue(
    call,
    'window.coworkCompanionRequest("requestContext", { currentLevel: 0, requestedLevel: 1 })'
  );
  const accessibilityContext = await evaluateValue(
    call,
    'window.coworkCompanionRequest("requestContext", { currentLevel: 1, requestedLevel: 2 })'
  );
  const visualContext = await evaluateValue(
    call,
    `window.coworkCompanionRequest("requestContext", {
      currentLevel: 2,
      requestedLevel: 3,
      pointer: ${JSON.stringify(pointer)}
    })`
  );
  const visualReferenceId = visualContext.visualDelivery.referenceId;
  const visualConsumption = await extensionState(`(async () => {
    const referenceId = ${JSON.stringify(visualReferenceId)};
    const consumed = await api.consumeVisualRegion(referenceId);
    let replayCode = null;
    try {
      await api.consumeVisualRegion(referenceId);
    } catch (error) {
      replayCode = error.code;
    }
    return {
      referenceId: consumed.referenceId,
      width: consumed.width,
      height: consumed.height,
      mimeType: consumed.mimeType,
      dataUrlPrefix: consumed.dataUrl.slice(0, "data:image/png;base64,".length),
      dataUrlCharacters: consumed.dataUrl.length,
      replayCode
    };
  })()`);
  const valueBeforeOffer = await evaluateValue(
    call,
    'document.querySelector("#project-title").value'
  );
  await evaluateValue(
    call,
    `window.coworkCompanionRequest("offerAction", {
      offerId: "extension-offer-1",
      capabilityId: "legacy.offer_value",
      targetId: ${JSON.stringify(focus.targetId)},
      pageVersion: ${JSON.stringify(focus.pageVersion)},
      proposedArguments: { value: "Cowork Everywhere" },
      summary: "Use Cowork Everywhere as the project title",
      effect: "write",
      undoAvailable: true,
      expiresAt: "2099-09-01T10:05:00.000Z"
    })`
  );
  await call("Target.createTarget", {
    url: `${extensionOrigin}/sidepanel.html`
  });
  const sidePanelTarget = await waitForPageTarget(
    debugPort,
    (candidate) => candidate.url === `${extensionOrigin}/sidepanel.html`
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
  const sidePanelState = () =>
    evaluateValue(
      sidePanelCall,
      `(async () => {
        const envelope = await chrome.runtime.sendMessage({
          type: "cowork:sidepanel:get-state"
        });
        return envelope?.result?.state ?? null;
      })()`
    );
  const sidePanelOffer = await waitForValue(
    sidePanelCall,
    `(() => {
      const button = document.querySelector("#offer-action");
      return {
        visible: Boolean(button && !document.querySelector("#offer-card").hidden),
        text: button?.textContent ?? "",
        offerId: button?.dataset.offerId ?? ""
      };
    })()`,
    (value) => value?.visible === true
  );
  const offer = {
    valueBeforeOffer,
    valueBeforeHumanClick: await evaluateValue(
      call,
      'document.querySelector("#project-title").value'
    ),
    visibleOfferCount: sidePanelOffer.visible ? 1 : 0,
    visibleOfferText: sidePanelOffer.text,
    offerId: sidePanelOffer.offerId,
    pageUiInjected: await evaluateValue(
      call,
      'document.querySelector("#cowork-browser-companion-root") !== null'
    )
  };
  const evidenceScreenshots = [];
  const offerScreenshot = await captureEvidenceFrame(
    sidePanelCall,
    "browser-companion-offer-awaiting-click.png"
  );
  if (offerScreenshot) evidenceScreenshots.push(offerScreenshot);
  await trustedClick(
    sidePanelCall,
    'document.querySelector("#offer-action")',
    "Cowork Side Panel action offer"
  );
  await new Promise((resolve) => setTimeout(resolve, 150));
  const afterClickState = await sidePanelState();
  const clickSurface = {
    valueAfterHumanClick: await evaluateValue(
      call,
      'document.querySelector("#project-title").value'
    ),
    status: afterClickState.statusText
  };
  const verifiedScreenshot = await captureEvidenceFrame(
    sidePanelCall,
    "browser-companion-verified-after-click.png"
  );
  if (verifiedScreenshot) evidenceScreenshots.push(verifiedScreenshot);
  await trustedClick(sidePanelCall, 'document.querySelector("#toggle")', "Pause relay");
  const disabledState = await waitForValue(
    sidePanelCall,
    `(async () => {
      const envelope = await chrome.runtime.sendMessage({
        type: "cowork:sidepanel:get-state"
      });
      return envelope?.result?.state ?? null;
    })()`,
    (value) => value?.enabled === false
  );
  disabledState.pageUiAbsent = await evaluateValue(
    call,
    'document.querySelector("#cowork-browser-companion-root") === null'
  );

  if (relayAbsentBeforeAction !== true || isolatedContextsBeforeAction !== 0) {
    throw new Error(`On-demand precondition failed: ${JSON.stringify({
      relayAbsentBeforeAction,
      isolatedContextsBeforeAction
    })}`);
  }

  const report = validateBrowserCompanionObservation({
    browserVersion: version.Browser,
    relayAbsentBeforeAction,
    isolatedContextsBeforeAction,
    webMcpAvailable,
    enabledState,
    focus,
    nearbyContext,
    accessibilityContext,
    visualContext,
    visualConsumption,
    offer,
    click: {
      trusted: afterClickState.lastTrustedHumanClick,
      ...clickSurface
    },
    disabledState
  });
  if (evidenceScreenshots.length > 0) report.evidenceScreenshots = evidenceScreenshots;
  console.log(JSON.stringify(report, null, 2));
  sidePanelSocket.close();
  socket.close();
} finally {
  await stopOwnedBrowser(browser);
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(profilePath, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 150
  });
}
