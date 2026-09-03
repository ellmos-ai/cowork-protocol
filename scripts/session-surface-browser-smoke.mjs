import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { removeTempProfile } from "./smoke-runtime.mjs";

import { createCompanionSessionHost } from "../apps/desktop-companion/src/host.js";
import { createStaticServer } from "./serve.mjs";

const profilePath = await mkdtemp(path.join(tmpdir(), "cowork-session-surface-smoke-"));
let server;
let browser;
let companionHost;

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
  if (!candidate) throw new Error("Chrome was not found; set COWORK_CHROME_PATH");
  return candidate;
}

async function waitForJson(url, attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      // Retry only the isolated browser process started below.
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
      // Retry only the isolated profile created above.
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

function cdpClient(socket, onEvent = () => {}) {
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id === undefined) {
      onEvent(message);
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

async function evaluateValue(call, expression) {
  const evaluation = await call("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (evaluation.exceptionDetails) throw new Error(JSON.stringify(evaluation.exceptionDetails));
  return evaluation.result.value;
}

async function waitForValue(call, expression, predicate, attempts = 60) {
  let latest;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    latest = await evaluateValue(call, expression);
    if (predicate(latest)) return latest;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for browser state: ${JSON.stringify(latest)}`);
}

// The Companion disables its actor controls while a control request is in
// flight (`controlBusy`). Clicking through that window is silently swallowed
// and shifts the whole cycle by one, so wait for the control to come back
// before pressing it.
async function clickCompanionControl(call, selector) {
  await waitForValue(
    call,
    `document.querySelector(${JSON.stringify(selector)})?.disabled === false`,
    (value) => value === true
  );
  return trustedClick(call, selector);
}

async function trustedClick(call, selector) {
  const point = await evaluateValue(call, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!(element instanceof HTMLElement)) return null;
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  if (!point) throw new Error(`Trusted-click target not found: ${selector}`);
  await call("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: point.x,
    y: point.y,
    button: "left",
    clickCount: 1
  });
  await call("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: point.x,
    y: point.y,
    button: "left",
    clickCount: 1
  });
}

async function captureFrame(call, directory, filename) {
  await mkdir(directory, { recursive: true });
  const capture = await call("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false
  });
  await writeFile(path.join(directory, filename), Buffer.from(capture.data, "base64"));
}

try {
  const chromePath = await resolveChromePath();
  server = createStaticServer({ root: process.cwd() });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Showcase server has no port");
  const showcaseOrigin = `http://127.0.0.1:${address.port}`;
  let modelRequestCount = 0;
  companionHost = createCompanionSessionHost({
    allowedOrigins: [showcaseOrigin],
    port: 0,
    createLinkSessionId: () => "browser-surface-link",
    sendModelTurn: async () => {
      modelRequestCount += 1;
      return { message: "Shared browser smoke reply" };
    }
  });
  const companionAddress = await companionHost.listen();
  const companionEndpoint =
    `http://${companionAddress.hostname}:${companionAddress.port}/cowork/v1`;
  const showcaseUrl =
    `${showcaseOrigin}/apps/formbuilder-showcase/?companionEndpoint=` +
    encodeURIComponent(companionEndpoint);
  const headful = process.env.COWORK_SURFACE_HEADFUL === "1";
  const chromeArguments = [
    ...(headful ? [] : ["--headless=new"]),
    "--disable-gpu",
    "--enable-features=WebMCP,WebMCPTesting,DocumentPictureInPictureAPI",
    "--enable-blink-features=WebMCP",
    "--remote-debugging-port=0",
    "--window-size=1100,1000",
    `--user-data-dir=${profilePath}`,
    showcaseUrl
  ];
  browser = spawn(chromePath, chromeArguments, {
    windowsHide: !headful,
    stdio: "ignore"
  });

  const debugPort = await waitForDevToolsPort();
  const version = await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
  const protocolSchema = await waitForJson(
    `http://127.0.0.1:${debugPort}/json/protocol`
  );
  const permissionTypes = protocolSchema.domains
    ?.find(({ domain }) => domain === "Browser")
    ?.types?.find(({ id }) => id === "PermissionType")?.enum ?? [];
  const localNetworkPermission = [
    "loopbackNetwork",
    "localNetwork",
    "localNetworkAccess"
  ].find((name) => permissionTypes.includes(name));
  if (!localNetworkPermission) {
    throw new Error("Chrome exposes no local-network permission for the Companion smoke");
  }
  const targets = await waitForJson(`http://127.0.0.1:${debugPort}/json`);
  const target = targets.find(
    (candidate) => candidate.type === "page" && candidate.url.includes("formbuilder-showcase")
  );
  if (!target) throw new Error("Showcase page target not found");

  const socket = await connect(target.webSocketDebuggerUrl);
  const networkEvidence = [];
  const call = cdpClient(socket, (message) => {
    if (
      message.method === "Network.loadingFailed" ||
      message.method === "Network.responseReceived"
    ) {
      networkEvidence.push({ method: message.method, params: message.params });
    }
  });
  await call("Runtime.enable");
  await call("Page.enable");
  await call("Network.enable");
  await call("Page.bringToFront");
  await call("Browser.grantPermissions", {
    permissions: [localNetworkPermission],
    origin: showcaseOrigin
  });

  const initial = await waitForValue(
    call,
    `(() => ({
      ready: Boolean(window.coworkSession && document.querySelector("#detach-cowork")),
      supported: typeof window.documentPictureInPicture?.requestWindow === "function",
      snapshot: window.coworkSession?.readSnapshot?.() ?? null,
      integration: window.coworkIntegration?.readDeclaration?.() ?? null
    }))()`,
    (value) => value?.ready === true
  );
  if (!initial.supported) {
    throw new Error("Document Picture-in-Picture is unavailable in the selected browser mode");
  }

  await trustedClick(call, "#detach-cowork");
  const detached = await waitForValue(
    call,
    `(() => ({
      hasDetachedWindow: Boolean(window.documentPictureInPicture?.window),
      panelInDetachedDocument: Boolean(
        window.documentPictureInPicture?.window?.document.querySelector(".cowork-panel")
      ),
      mainPanelAbsent: document.querySelector(".cowork-panel") === null,
      snapshot: window.coworkSession.readSnapshot(),
      buttonLabel: window.documentPictureInPicture?.window?.document
        .querySelector("#detach-cowork")?.textContent ?? null
    }))()`,
    (value) =>
      value?.hasDetachedWindow === true &&
      value?.panelInDetachedDocument === true &&
      value?.snapshot?.state?.surface?.kind === "document-pip"
  );

  await evaluateValue(call, `(() => {
    window.documentPictureInPicture.window.close();
    return true;
  })()`);
  const restored = await waitForValue(
    call,
    `(() => ({
      detachedWindowClosed: window.documentPictureInPicture?.window == null,
      panelRestored: Boolean(document.querySelector(".cowork-panel")),
      snapshot: window.coworkSession.readSnapshot(),
      buttonLabel: document.querySelector("#detach-cowork")?.textContent ?? null
    }))()`,
    (value) =>
      value?.detachedWindowClosed === true &&
      value?.panelRestored === true &&
      value?.snapshot?.state?.surface?.kind === "embedded"
  );

  await trustedClick(call, "#open-companion");
  let companion;
  try {
    companion = await waitForValue(
      call,
      `(() => ({
      snapshot: window.coworkSession.readSnapshot(),
      buttonLabel: document.querySelector("#open-companion")?.textContent ?? null,
      status: document.querySelector("#system-status")?.textContent ?? null,
      conversationDisabled: document.querySelector("#conversation-input")?.disabled ?? null,
      collapsed: document.querySelector(".cowork-panel")?.classList
        .contains("is-companion-connected") ?? false
      }))()`,
      (value) =>
        value?.snapshot?.state?.surface?.kind === "desktop" &&
        value?.buttonLabel === "Connected"
    );
  } catch (error) {
    throw new Error(
      `${error.message}; network=${JSON.stringify(networkEvidence.slice(-8))}`
    );
  }
  let initiallyActiveSnapshot = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    initiallyActiveSnapshot = companionHost.readSnapshot("browser-surface-link");
    if (initiallyActiveSnapshot?.state?.applicationSurface?.visibility === "visible") break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (initiallyActiveSnapshot?.state?.applicationSurface?.visibility !== "visible") {
    throw new Error("Companion handoff did not report the page's initial visibility");
  }
  await evaluateValue(call, `(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden"
    });
    document.dispatchEvent(new Event("visibilitychange"));
    return document.visibilityState;
  })()`);
  let hiddenSnapshot = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    hiddenSnapshot = companionHost.readSnapshot("browser-surface-link");
    if (hiddenSnapshot?.state?.applicationSurface?.visibility === "hidden") break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (hiddenSnapshot?.state?.applicationSurface?.visibility !== "hidden") {
    throw new Error("Connected page visibility did not reach the Companion authority");
  }
  if (modelRequestCount !== 0) {
    throw new Error("A token-free surface event unexpectedly invoked the model");
  }
  const soloCommit = await companionHost.commitSession("browser-surface-link", {
    kind: "companion-background-work",
    nextState: {
      ...hiddenSnapshot.state,
      backgroundProof: { status: "continued-while-page-hidden" }
    },
    expectedRevision: hiddenSnapshot.revision,
    sourceSurfaceId: hiddenSnapshot.state.surface.primarySurfaceId,
    at: "2026-08-31T16:00:00.000Z"
  });
  await evaluateValue(call, `(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible"
    });
    document.dispatchEvent(new Event("visibilitychange"));
    return document.visibilityState;
  })()`);
  const resumed = await waitForValue(
    call,
    `(() => ({ snapshot: window.coworkSession.readSnapshot() }))()`,
    (value) =>
      value?.snapshot?.revision > soloCommit.revision &&
      value?.snapshot?.state?.applicationSurface?.visibility === "visible" &&
      value?.snapshot?.state?.backgroundProof?.status ===
        "continued-while-page-hidden"
  );
  const companionSnapshot = companionHost.readSnapshot("browser-surface-link");
  const companionWindowTarget = await call("Target.createTarget", {
    url: `${companionEndpoint}/ui`,
    newWindow: true,
    width: 430,
    height: 760
  });
  let companionWindowDescriptor = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const currentTargets = await waitForJson(`http://127.0.0.1:${debugPort}/json`, 1);
    companionWindowDescriptor = currentTargets.find(
      (candidate) => candidate.id === companionWindowTarget.targetId
    );
    if (companionWindowDescriptor) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!companionWindowDescriptor) throw new Error("Companion app window target not found");
  const companionWindowSocket = await connect(companionWindowDescriptor.webSocketDebuggerUrl);
  const companionWindowCall = cdpClient(companionWindowSocket);
  await companionWindowCall("Runtime.enable");
  await companionWindowCall("Page.enable");
  await companionWindowCall("Emulation.setDeviceMetricsOverride", {
    width: 430,
    height: 760,
    deviceScaleFactor: 1,
    mobile: false
  });
  const companionReportDirectory = path.join(
    process.cwd(),
    "_reports",
    "desktop-companion-cockpit-v1"
  );
  const visibleCompanion = await waitForValue(
    companionWindowCall,
    `(() => ({
      providerId: document.documentElement.dataset.uiProvider,
      title: document.querySelector("h1")?.textContent ?? null,
      sessionId: document.querySelector("#session-heading")?.textContent ?? null,
      mode: document.querySelector("#mode")?.textContent ?? null,
      applicationSurface: document.querySelector("#page-availability")?.textContent ?? null,
      human: document.querySelector("#human-label")?.textContent ?? null,
      model: document.querySelector("#model-label")?.textContent ?? null,
      modelIdentity: document.querySelector("#model-identity")?.textContent ?? null,
      humanState: document.querySelector(".companion-cockpit")?.dataset.humanState ?? null,
      modelState: document.querySelector(".companion-cockpit")?.dataset.modelState ?? null,
      relayState: document.querySelector(".companion-cockpit")?.dataset.relayState ?? null,
      cockpitVisible: Boolean(document.querySelector("#human-control") && document.querySelector("#model-control") && document.querySelector("#relay-core")),
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      audioControlCount: ["#talk", "#stop-speech", "#speak"]
        .filter((selector) => document.querySelector(selector)).length,
      modelInputEnabled: !document.querySelector("#conversation-input")?.disabled
    }))()`,
    (value) => value?.sessionId === initial.snapshot.sessionId && value.modelInputEnabled === true
  );
  await captureFrame(
    companionWindowCall,
    companionReportDirectory,
    "companion-01-cowork.png"
  );

  await trustedClick(companionWindowCall, "#appearance-toggle");
  await trustedClick(companionWindowCall, '[data-cockpit-color="#eaf2ff"]');
  const chosenBackground = await waitForValue(
    companionWindowCall,
    `(() => ({
      color: getComputedStyle(document.documentElement).getPropertyValue("--cockpit-background").trim(),
      stored: localStorage.getItem("cowork.companion.cockpit-background.v1")
    }))()`,
    (value) => value?.color === "#eaf2ff" && value?.stored === "#eaf2ff"
  );
  await captureFrame(
    companionWindowCall,
    companionReportDirectory,
    "companion-01b-sky-background.png"
  );
  await companionWindowCall("Page.reload", { ignoreCache: true });
  const restoredBackground = await waitForValue(
    companionWindowCall,
    `(() => ({
      color: getComputedStyle(document.documentElement).getPropertyValue("--cockpit-background").trim(),
      stored: localStorage.getItem("cowork.companion.cockpit-background.v1"),
      sessionId: document.querySelector("#session-heading")?.textContent ?? null
    }))()`,
    (value) => value?.color === "#eaf2ff" &&
      value?.stored === "#eaf2ff" &&
      value?.sessionId === initial.snapshot.sessionId
  );

  // The model starts advising (the page publishes the derived engagement, and
  // the default is the offer-and-click rhythm), so no click is needed to reach
  // the advising turn.
  const observingCompanion = await waitForValue(
    companionWindowCall,
    `(() => ({
      modelState: document.querySelector(".companion-cockpit")?.dataset.modelState ?? null,
      relayState: document.querySelector(".companion-cockpit")?.dataset.relayState ?? null,
      label: document.querySelector("#model-label")?.textContent ?? null
    }))()`,
    (value) => value?.modelState === "here-advising" && value?.relayState === "watching"
  );
  await captureFrame(
    companionWindowCall,
    companionReportDirectory,
    "companion-02-observing.png"
  );

  await clickCompanionControl(companionWindowCall, "#model-control");
  const pausedCompanion = await waitForValue(
    companionWindowCall,
    `(() => ({
      modelState: document.querySelector(".companion-cockpit")?.dataset.modelState ?? null,
      relayState: document.querySelector(".companion-cockpit")?.dataset.relayState ?? null,
      inputDisabled: document.querySelector("#conversation-input")?.disabled ?? null
    }))()`,
    (value) => value?.modelState === "standby" && value?.inputDisabled === true
  );
  await captureFrame(
    companionWindowCall,
    companionReportDirectory,
    "companion-03-paused.png"
  );

  await clickCompanionControl(companionWindowCall, "#model-control");
  await waitForValue(
    companionWindowCall,
    `document.querySelector(".companion-cockpit")?.dataset.modelState ?? null`,
    (value) => value === "here-advising"
  );
  await clickCompanionControl(companionWindowCall, "#human-control");
  const awayWithoutLease = await waitForValue(
    companionWindowCall,
    `(() => ({
      humanState: document.querySelector(".companion-cockpit")?.dataset.humanState ?? null,
      relayState: document.querySelector(".companion-cockpit")?.dataset.relayState ?? null,
      detail: document.querySelector("#relay-detail")?.textContent ?? null
    }))()`,
    (value) => value?.humanState === "standby" && value?.relayState === "dormant"
  );
  await captureFrame(
    companionWindowCall,
    companionReportDirectory,
    "companion-04-away-without-lease.png"
  );
  await clickCompanionControl(companionWindowCall, "#human-control");
  await waitForValue(
    companionWindowCall,
    `document.querySelector(".companion-cockpit")?.dataset.humanState ?? null`,
    (value) => value === "away"
  );
  await clickCompanionControl(companionWindowCall, "#human-control");
  await waitForValue(
    companionWindowCall,
    `(() => ({
      humanState: document.querySelector(".companion-cockpit")?.dataset.humanState ?? null,
      relayState: document.querySelector(".companion-cockpit")?.dataset.relayState ?? null
    }))()`,
    // Back at the screen and no grant exists yet, so the seat click could not
    // hand the job over. The model advises, the human keeps the click right,
    // and the cockpit says why instead of parking on a state nobody holds.
    (value) => value?.humanState === "here-executing" && value?.relayState === "watching"
  );
  const beforeDelegation = companionHost.readSnapshot("browser-surface-link");
  const delegatedAt = new Date();
  await companionHost.commitSession("browser-surface-link", {
    kind: "smoke-solo-lease-authorized",
    nextState: {
      ...beforeDelegation.state,
      lease: {
        leaseId: "surface-smoke-solo-lease",
        goal: "Continue the bounded form task",
        expiresAt: new Date(delegatedAt.getTime() + 5 * 60 * 1000).toISOString()
      }
    },
    expectedRevision: beforeDelegation.revision,
    sourceSurfaceId: beforeDelegation.state.surface.primarySurfaceId,
    at: delegatedAt.toISOString()
  });
  // With a grant running, the seat click hands the job over for real. The
  // model's three statuses cycle in the page's order, so advising reaches
  // executing by way of standby.
  await clickCompanionControl(companionWindowCall, "#model-control");
  await clickCompanionControl(companionWindowCall, "#model-control");
  await waitForValue(
    companionWindowCall,
    `(() => ({
      modelState: document.querySelector(".companion-cockpit")?.dataset.modelState ?? null,
      status: document.querySelector("#cockpit-status")?.textContent ?? null
    }))()`,
    (value) => value?.modelState === "here-executing" &&
      value.status.includes("Continue the bounded form task")
  );
  await clickCompanionControl(companionWindowCall, "#human-control");
  const delegatedSolo = await waitForValue(
    companionWindowCall,
    `(() => ({
      humanState: document.querySelector(".companion-cockpit")?.dataset.humanState ?? null,
      modelState: document.querySelector(".companion-cockpit")?.dataset.modelState ?? null,
      relayState: document.querySelector(".companion-cockpit")?.dataset.relayState ?? null,
      label: document.querySelector("#relay-label")?.textContent ?? null
    }))()`,
    (value) => value?.humanState === "standby" && value?.relayState === "to-model"
  );
  await captureFrame(
    companionWindowCall,
    companionReportDirectory,
    "companion-05-delegated-solo.png"
  );
  await clickCompanionControl(companionWindowCall, "#human-control");
  await waitForValue(
    companionWindowCall,
    `document.querySelector(".companion-cockpit")?.dataset.humanState ?? null`,
    (value) => value === "away"
  );
  await clickCompanionControl(companionWindowCall, "#human-control");
  // Back at the screen while the grant still covers the model: the model
  // executes and the human advises. This is the concept's headline turn, and
  // the Companion is the only surface with a real model seat to show it on.
  const modelExecutingWhileWatched = await waitForValue(
    companionWindowCall,
    `(() => ({
      humanState: document.querySelector(".companion-cockpit")?.dataset.humanState ?? null,
      modelState: document.querySelector(".companion-cockpit")?.dataset.modelState ?? null,
      label: document.querySelector("#relay-label")?.textContent ?? null
    }))()`,
    (value) => value?.humanState === "here-advising" && value?.modelState === "here-executing"
  );
  await evaluateValue(companionWindowCall, `(() => {
    document.querySelector("#conversation-input").value = "Continue in the Companion.";
    document.querySelector("#conversation-form").requestSubmit();
    return true;
  })()`);
  const companionConversation = await waitForValue(
    companionWindowCall,
    `(() => ({
      status: document.querySelector("#status")?.textContent ?? null,
      turnCount: document.querySelectorAll("#turns li").length
    }))()`,
    (value) => value?.status === "Shared browser smoke reply" && value.turnCount === 2
  );

  // Named expectations: a smoke that only says "something is wrong" costs an
  // hour of bisecting. Each row names the claim it stands for.
  const expectations = [
    ["integration mode", initial.integration?.presentation?.mode, "protocol-and-ui"],
    ["page UI provider", initial.integration?.presentation?.pageUiProviderId, "cowork-reference-ui"],
    ["detached session id", detached.snapshot.sessionId, initial.snapshot.sessionId],
    ["restored session id", restored.snapshot.sessionId, initial.snapshot.sessionId],
    ["detach raises the revision", detached.snapshot.revision > initial.snapshot.revision, true],
    ["restore raises the revision", restored.snapshot.revision > detached.snapshot.revision, true],
    ["main panel is gone while detached", detached.mainPanelAbsent, true],
    ["detached button label", detached.buttonLabel, "Dock in page"],
    ["restored button label", restored.buttonLabel, "Detach"],
    ["page panel collapses for the Companion", companion.collapsed, true],
    ["page conversation is disabled", companion.conversationDisabled, true],
    ["companion snapshot revision", companionSnapshot?.revision, resumed.snapshot.revision],
    ["companion surface kind", companionSnapshot?.state?.surface?.kind, "desktop"],
    ["companion UI provider", visibleCompanion.providerId, "cowork-reference-ui"],
    ["companion title", visibleCompanion.title, "Desktop Companion"],
    ["companion work mode", visibleCompanion.mode, "Sparring · you execute"],
    ["companion application surface", visibleCompanion.applicationSurface, "Page active"],
    ["human status", visibleCompanion.humanState, "here-executing"],
    ["model status", visibleCompanion.modelState, "here-advising"],
    ["model identity", visibleCompanion.modelIdentity, "preferred-model"],
    ["relay state", visibleCompanion.relayState, "watching"],
    ["cockpit is visible", visibleCompanion.cockpitVisible, true],
    ["no horizontal overflow", visibleCompanion.horizontalOverflow <= 0, true],
    ["advising label", observingCompanion.label, "Model is advising"],
    ["standby relay", pausedCompanion.relayState, "dormant"],
    ["away without authority", awayWithoutLease.detail, "No one holds the click right right now."],
    ["the model executes while the human watches", modelExecutingWhileWatched.modelState, "here-executing"],
    ["and that turn is named as sparring", modelExecutingWhileWatched.label, "Sparring · model executes"],
    ["delegated solo status", delegatedSolo.modelState, "here-executing"],
    ["delegated solo label", delegatedSolo.label, "Model works alone"],
    ["audio controls", visibleCompanion.audioControlCount, 3],
    ["chosen background", chosenBackground.color, "#eaf2ff"],
    ["restored background", restoredBackground.color, "#eaf2ff"],
    ["companion turns", companionConversation.turnCount, 2]
  ];
  const broken = expectations.filter(([, actual, expected]) => actual !== expected);
  if (broken.length > 0) {
    throw new Error(
      `Detached surface did not preserve one versioned Cowork session: ${broken
        .map(([claim, actual, expected]) => `${claim} is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`)
        .join("; ")}`
    );
  }

  // --- Leaving the Companion: the page takes its session back and shows the
  // full embedded panel again. Before this there was no way back short of
  // reloading the page. ---
  await trustedClick(call, "#leave-companion");
  const leftCompanion = await waitForValue(
    call,
    `(() => ({
      surfaceKind: window.coworkSession.readSnapshot()?.state?.surface?.kind ?? null,
      buttonLabel: document.querySelector("#open-companion")?.textContent ?? null,
      collapsed: document.querySelector(".cowork-panel")?.classList.contains("is-companion-connected") ?? null,
      localAuthority: window.coworkSession.readDeltas(0) !== null,
      conversationDisabled: document.querySelector("#conversation-input")?.disabled ?? null
    }))()`,
    (value) =>
      value?.surfaceKind === "embedded" &&
      value?.buttonLabel === "Desktop Companion" &&
      value?.collapsed === false &&
      value?.localAuthority === true &&
      value?.conversationDisabled === false
  );

  console.log(JSON.stringify({
    detachedSurfaceClaim: true,
    leaveCompanionClaim: leftCompanion.surfaceKind === "embedded",
    sameSessionClaim: true,
    protocolUiSeparationClaim: true,
    noExtensionCompanionHandoffClaim: true,
    tokenFreeSurfaceSignalClaim: true,
    returnDeltaRecoveryClaim: true,
    independentCompanionWindowClaim: true,
    companionActorCockpitClaim: true,
    independentActorStateClaim: true,
    leaseTruthfulnessClaim: true,
    delegatedSoloVisualClaim: true,
    sharedModelGatewayClaim: true,
    companionAudioControlsClaim: true,
    visibleModelIdentityClaim: true,
    persistentCockpitBackgroundClaim: true,
    browserVersion: version.Browser,
    localNetworkPermission,
    headful,
    sessionId: initial.snapshot.sessionId,
    integrationMode: initial.integration.presentation.mode,
    companionReportDirectory,
    revisions: {
      initial: initial.snapshot.revision,
      detached: detached.snapshot.revision,
      restored: restored.snapshot.revision,
      companion: resumed.snapshot.revision
    },
    surfaceKinds: [
      initial.snapshot.state.surface.kind,
      detached.snapshot.state.surface.kind,
      restored.snapshot.state.surface.kind,
      companion.snapshot.state.surface.kind
    ]
  }, null, 2));
  companionWindowSocket.close();
  socket.close();
} finally {
  browser?.kill();
  await companionHost?.close();
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  await removeTempProfile(profilePath);
}
