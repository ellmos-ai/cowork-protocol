import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { removeTempProfile, resolveExtensionBrowserPath } from "./smoke-runtime.mjs";

import { buildBrowserCompanion } from "./build-browser-companion.mjs";
import { validateCockpitBrowserObservation } from "./browser-companion-cockpit-smoke-lib.mjs";
import { createStaticServer } from "./serve.mjs";

const profilePath = await mkdtemp(path.join(tmpdir(), "cowork-cockpit-smoke-"));
const evidenceDirectory = process.env.COWORK_COMPANION_EVIDENCE_DIR
  ? path.resolve(process.env.COWORK_COMPANION_EVIDENCE_DIR)
  : null;
let browser;
let server;
let socket;

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

async function waitForDevToolsPort(attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const text = await readFile(path.join(profilePath, "DevToolsActivePort"), "utf8");
      const port = Number(text.split(/\r?\n/, 1)[0]);
      if (Number.isInteger(port) && port > 0) return port;
    } catch {
      // The isolated profile is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Timed out waiting for Chrome's isolated DevTools port");
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const connected = new WebSocket(url);
    connected.addEventListener("open", () => resolve(connected), { once: true });
    connected.addEventListener("error", reject, { once: true });
  });
}

function cdpClient(connected) {
  let nextId = 0;
  const pending = new Map();
  connected.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });
  return (method, params = {}) => {
    const id = ++nextId;
    connected.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  };
}

async function evaluateValue(call, expression) {
  const evaluation = await call("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (evaluation.exceptionDetails) throw new Error(JSON.stringify(evaluation.exceptionDetails));
  return evaluation.result.value;
}

async function waitForValue(call, expression, predicate, attempts = 80) {
  let value;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    value = await evaluateValue(call, expression);
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for cockpit value: ${JSON.stringify(value)}`);
}

async function trustedClick(call, selector) {
  const rect = await evaluateValue(call, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return null;
    const box = element.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  })()`);
  if (!rect) throw new Error(`Cockpit control not found: ${selector}`);
  await call("Input.dispatchMouseEvent", { type: "mousePressed", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
  await call("Input.dispatchMouseEvent", { type: "mouseReleased", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
}

async function captureFrame(call, filename) {
  await evaluateValue(call, "window.scrollTo(0, 0)");
  const screenshot = await call("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
    fromSurface: true
  });
  if (evidenceDirectory) {
    await mkdir(evidenceDirectory, { recursive: true });
    await writeFile(path.join(evidenceDirectory, filename), Buffer.from(screenshot.data, "base64"));
  }
  return filename;
}

async function observeState(call) {
  return evaluateValue(call, `(() => {
    const root = document.querySelector(".cowork-cockpit");
    const controls = [...document.querySelectorAll("button:not([disabled])")].filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return !element.closest("[hidden]") && style.display !== "none" &&
        style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    });
    const labelOf = (element) => element.getAttribute("aria-label") ||
      element.textContent.trim().replace(/\\s+/g, " ");
    return {
      viewport: { width: innerWidth, height: innerHeight },
      documentHorizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth,
      horizontallyClippedControls: controls.filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left < -1 || rect.right > innerWidth + 1;
      }).map((element) => element.id || labelOf(element)),
      unnamedControls: controls.filter((element) => labelOf(element).length === 0).map((element) => element.tagName),
      visibleControlCount: controls.length,
      humanState: root.dataset.humanState,
      modelState: root.dataset.modelState,
      relayState: root.dataset.relayState,
      route: root.dataset.route,
      executionMode: root.dataset.executionMode,
      computerUseIndicatorVisible: (() => {
        const indicator = document.querySelector("#computer-use-indicator");
        return indicator.getAttribute("aria-hidden") !== "true" &&
          getComputedStyle(indicator).display !== "none";
      })(),
      modeLabel: document.querySelector("#relay-label").textContent,
      humanLabel: document.querySelector("#human-label").textContent,
      modelLabel: document.querySelector("#model-label").textContent,
      humanBadge: getComputedStyle(document.querySelector(".human-badge"), "::before").content,
      modelBadge: getComputedStyle(document.querySelector(".model-badge"), "::before").content
    };
  })()`);
}

async function keyboardOrder(call) {
  await evaluateValue(call, "document.querySelector('#human-control').focus(); window.scrollTo(0, 0)");
  const order = ["human-control"];
  for (let index = 0; index < 8; index += 1) {
    const key = { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 };
    await call("Input.dispatchKeyEvent", { type: "rawKeyDown", ...key });
    await call("Input.dispatchKeyEvent", { type: "keyUp", ...key });
    order.push(await evaluateValue(call, "document.activeElement?.id ?? ''"));
  }
  return order.filter(Boolean);
}

// The stub mirrors the shipped content runtime: it stores the two status
// variables per actor and cycles a figure from the *resolved* status, so the
// panel under test resolves the very same matrix the extension does.
const fixtureSource = `(() => {
  const state = {
    enabled: true,
    mode: "legacy-host-companion",
    executionMode: "structured",
    human: { availability: "here", role: "observing" },
    model: { availability: "here", role: "acting" },
    allowParallel: false,
    modelAuthorityValid: true,
    soloLeaseValid: true,
    contextLevel: 0,
    focusLabel: "Point to a page control",
    focusDetail: "No page content requested yet",
    statusText: "Cowork is active through the bounded bridge.",
    pendingOffer: { offerId: "offer-cockpit-proof", summary: "Apply suggested title: Team meetup registration" }
  };
  const cycle = [
    { availability: "here", role: "acting" },
    { availability: "here", role: "observing" },
    { availability: "standby", role: "observing" },
    { availability: "away", role: "observing" }
  ];
  // The conflict rule demotes a model that acts while the human acts, so the
  // stub cycles on from what the panel shows, not from the stored intent.
  const resolved = (side) => {
    const actor = state[side];
    if (actor.availability !== "here") return { availability: actor.availability, role: "observing" };
    if (side === "model" && actor.role === "acting" && !state.allowParallel &&
      state.human.availability === "here" && state.human.role === "acting") {
      return { availability: "here", role: "observing" };
    }
    return actor;
  };
  const advance = (side) => {
    const current = resolved(side);
    const index = cycle.findIndex((candidate) => candidate.availability === current.availability &&
      (current.availability !== "here" || candidate.role === current.role));
    state[side] = cycle[(index + 1) % cycle.length];
  };
  const envelope = () => ({ ok: true, result: { state: structuredClone(state) } });
  const sendMessage = async (message) => {
    if (message.type === "cowork:sidepanel:cycle-model") {
      advance("model");
      state.enabled = state.model.availability !== "away";
    } else if (message.type === "cowork:sidepanel:cycle-human") {
      advance("human");
    } else if (message.type === "cowork:sidepanel:toggle") {
      state.enabled = !state.enabled;
      state.model = state.enabled
        ? { availability: "here", role: "acting" }
        : { availability: "away", role: "observing" };
    } else if (message.type === "cowork:sidepanel:read-focus") {
      state.focusLabel = "Selected: Registration title";
      state.focusDetail = "Stable field · text input";
    } else if (message.type === "cowork:sidepanel:request-context") {
      state.contextLevel = Math.min(3, state.contextLevel + 1);
    } else if (message.type === "cowork:sidepanel:confirm-offer") {
      state.pendingOffer = null;
    }
    return envelope();
  };
  const runtime = { sendMessage };
  const chromeObject = globalThis.chrome ?? {};
  Object.defineProperty(chromeObject, "runtime", { configurable: true, value: runtime });
  Object.defineProperty(globalThis, "chrome", { configurable: true, value: chromeObject });
})();`;

async function killOwnedBrowser() {
  if (!browser?.pid) return;
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill.exe", ["/PID", String(browser.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore"
      });
      killer.once("exit", resolve);
      killer.once("error", resolve);
    });
  } else {
    browser.kill("SIGTERM");
  }
}

try {
  await buildBrowserCompanion({
    sourceRoot: process.cwd(),
    outputRoot: path.resolve("dist-browser-companion")
  });
  const chromePath = await resolveExtensionBrowserPath();
  server = createStaticServer({ root: process.cwd() });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Cockpit server did not expose a port");
  const cockpitUrl = `http://127.0.0.1:${address.port}/dist-browser-companion/sidepanel.html`;

  browser = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--force-device-scale-factor=1",
    "--remote-debugging-port=0",
    "--window-size=900,1000",
    `--user-data-dir=${profilePath}`,
    "about:blank"
  ], { windowsHide: true, stdio: "ignore" });

  const debugPort = await waitForDevToolsPort();
  const version = await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
  const targets = await waitForJson(`http://127.0.0.1:${debugPort}/json`);
  const target = targets.find((candidate) => candidate.type === "page");
  if (!target) throw new Error("Cockpit browser page target not found");
  socket = await connect(target.webSocketDebuggerUrl);
  const call = cdpClient(socket);
  await call("Runtime.enable");
  await call("Page.enable");
  await call("Page.addScriptToEvaluateOnNewDocument", { source: fixtureSource });
  await call("Emulation.setFocusEmulationEnabled", { enabled: true });
  await call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: 390,
    screenHeight: 844
  });
  await call("Page.navigate", { url: cockpitUrl });
  await waitForValue(call, "document.readyState", (value) => value === "complete");
  await waitForValue(call, "document.querySelector('.cowork-cockpit')?.dataset.relayState", (value) => value === "live");

  await trustedClick(call, "#focus-action");
  await trustedClick(call, "#context-gauge");
  await waitForValue(call, "document.querySelector('#context-gauge')?.dataset.level", (value) => value === "1");

  const humanState = "document.querySelector('.cowork-cockpit')?.dataset.humanState";
  const modelState = "document.querySelector('.cowork-cockpit')?.dataset.modelState";
  const states = [];
  const screenshots = [];

  // 1 - both here, the model acts while the human watches.
  states.push(await observeState(call));
  screenshots.push(await captureFrame(call, "cockpit-01-cowork-model.png"));

  // 2 - the human leaves; the lease keeps the model working alone.
  await trustedClick(call, "#human-control");
  await waitForValue(call, humanState, (value) => value === "standby");
  await trustedClick(call, "#human-control");
  await waitForValue(call, humanState, (value) => value === "away");
  states.push(await observeState(call));
  screenshots.push(await captureFrame(call, "cockpit-02-model-solo.png"));

  // 3 - the human returns and the hand on the mouse takes the click right back.
  await trustedClick(call, "#human-control");
  await waitForValue(call, humanState, (value) => value === "here-acting");
  states.push(await observeState(call));
  screenshots.push(await captureFrame(call, "cockpit-03-cowork-human.png"));

  // 4 - the model stands by; the human works alone.
  await trustedClick(call, "#model-control");
  await waitForValue(call, modelState, (value) => value === "standby");
  states.push(await observeState(call));
  screenshots.push(await captureFrame(call, "cockpit-04-human-solo.png"));

  const responsiveSamples = [];
  for (const viewport of [
    { width: 320, height: 640 },
    { width: 390, height: 844 },
    { width: 480, height: 900 }
  ]) {
    await call("Emulation.setDeviceMetricsOverride", {
      ...viewport,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: viewport.width,
      screenHeight: viewport.height
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const sample = await observeState(call);
    responsiveSamples.push({
      viewport: sample.viewport,
      documentHorizontalOverflow: sample.documentHorizontalOverflow,
      horizontallyClippedControls: sample.horizontallyClippedControls
    });
  }
  await call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: 390,
    screenHeight: 844
  });

  const observation = {
    browser: version.Browser,
    cockpitUrl,
    screenshots,
    states,
    focusLabel: await evaluateValue(call, "document.querySelector('#focus-label').textContent"),
    contextLevel: await evaluateValue(call, "document.querySelector('#context-gauge').dataset.level"),
    keyboardOrder: await keyboardOrder(call),
    responsiveSamples
  };
  const report = validateCockpitBrowserObservation(observation);
  if (evidenceDirectory) {
    await writeFile(
      path.join(evidenceDirectory, "browser-companion-cockpit-report.json"),
      `${JSON.stringify(report, null, 2)}\n`
    );
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  socket?.close();
  await killOwnedBrowser();
  if (server) await new Promise((resolve) => server.close(resolve));
  await removeTempProfile(profilePath);
}
