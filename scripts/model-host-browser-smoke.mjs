import { spawn } from "node:child_process";
import { access, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { removeTempProfile } from "./smoke-runtime.mjs";

import { createOpenAiCompatibleTurnSender } from "../packages/model-transport/src/openai-compatible.js";
import { validateModelHostBrowserObservation } from "./model-host-browser-smoke-lib.mjs";
import { createStaticServer } from "./serve.mjs";

const profilePath = await mkdtemp(path.join(tmpdir(), "cowork-model-host-smoke-"));
const providerAcceptance = process.env.COWORK_ACCEPT_CONNECTED_MODEL === "1";
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
      // Retry only the isolated browser started below.
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
      // Retry only the isolated browser profile created above.
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

async function evaluateValue(call, expression) {
  const evaluation = await call("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (evaluation.exceptionDetails) throw new Error(JSON.stringify(evaluation.exceptionDetails));
  return evaluation.result.value;
}

async function waitForExpression(call, expression, label, attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluateValue(call, expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function dispatchTrustedClick(call, selector, label) {
  const point = await evaluateValue(call, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return null;
    element.scrollIntoView({ block: "center", inline: "center" });
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2,
      visible: rect.width > 0 && rect.height > 0 };
  })()`);
  if (!point?.visible) throw new Error(`${label} is not visible`);
  await call("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
  await call("Input.dispatchMouseEvent", {
    type: "mousePressed", x: point.x, y: point.y, button: "left", buttons: 1, clickCount: 1
  });
  await call("Input.dispatchMouseEvent", {
    type: "mouseReleased", x: point.x, y: point.y, button: "left", buttons: 0, clickCount: 1
  });
}

try {
  const chromePath = await resolveChromePath();
  const received = [];
  let preferredModelSender = null;
  let providerLocation = null;
  if (providerAcceptance) {
    const endpoint = process.env.COWORK_MODEL_ENDPOINT;
    const model = process.env.COWORK_MODEL_ID;
    if (!endpoint || !model) {
      throw new Error(
        "Connected-model acceptance requires COWORK_MODEL_ENDPOINT and COWORK_MODEL_ID"
      );
    }
    const endpointUrl = new URL(endpoint);
    providerLocation = ["127.0.0.1", "localhost", "::1"].includes(endpointUrl.hostname)
      ? "local"
      : "remote";
    preferredModelSender = createOpenAiCompatibleTurnSender({
      endpoint,
      model,
      apiKey: process.env.COWORK_MODEL_API_KEY ?? "",
      reasoningEffort: process.env.COWORK_MODEL_REASONING_EFFORT ?? "",
      maxTokens: Number(process.env.COWORK_MODEL_MAX_TOKENS ?? 500),
      timeoutMs: 120000
    });
  }
  server = createStaticServer({
    root: process.cwd(),
    modelTurnHandler: async (turn, metadata) => {
      received.push({ turn, metadata });
      if (preferredModelSender) return preferredModelSender(turn);
      return {
        message: "I can suggest a badge name. Click the offer to approve it.",
        offers: [
          {
            capabilityId: "form.set_value",
            targetId: "form-field:full-name",
            value: "Grace Hopper",
            summary: "Set Full name to Grace Hopper"
          }
        ]
      };
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Model host has no TCP port");
  const showcaseUrl = `http://127.0.0.1:${address.port}/apps/formbuilder-showcase/`;

  browser = spawn(
    chromePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--force-device-scale-factor=1",
      "--remote-debugging-port=0",
      "--window-size=1280,900",
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
  await call("Page.bringToFront");
  await waitForExpression(
    call,
    `document.querySelector("#model-transport-badge")?.textContent.trim() === "Connected model bridge"`,
    "model bridge discovery"
  );

  await dispatchTrustedClick(call, "#full-name", "Full name field");
  await evaluateValue(call, `(() => {
    document.querySelector("#conversation-input").value = ${JSON.stringify(
      providerAcceptance
        ? "Suggest exactly Grace Hopper for this Full name field."
        : "Suggest a badge name"
    )};
    document.querySelector("#speak-output").checked = false;
    return true;
  })()`);
  await dispatchTrustedClick(call, "#send-conversation", "Conversation send button");
  await waitForExpression(
    call,
    `document.querySelector(".offer-chip")?.dataset.offerValue === "Grace Hopper"`,
    "click-gated model offer",
    providerAcceptance ? 1200 : 60
  );

  const beforeClick = await evaluateValue(call, `(() => ({
    transportLabel: document.querySelector("#model-transport-badge")?.textContent.trim(),
    visibleOfferValue: document.querySelector(".offer-chip")?.dataset.offerValue,
    valueBeforeHumanClick: document.querySelector("#full-name")?.value
  }))()`);
  await dispatchTrustedClick(call, ".offer-chip", "Model action offer");
  await waitForExpression(
    call,
    `document.querySelector("#full-name")?.value === "Grace Hopper"`,
    "trusted offer application"
  );
  const afterClick = await evaluateValue(call, `(() => ({
    valueAfterHumanClick: document.querySelector("#full-name")?.value,
    receiptText: document.querySelector("#receipt-list li")?.textContent.trim()
  }))()`);
  socket.close();

  if (received.length !== 1) throw new Error(`Expected one model turn, received ${received.length}`);
  const [{ turn, metadata }] = received;
  const result = validateModelHostBrowserObservation({
    browserVersion: version.Browser,
    ...beforeClick,
    ...afterClick,
    receivedTurn: turn,
    packetCharacters: JSON.stringify(turn).length,
    browserRequestKeys: metadata.requestKeys,
    authorizationHeaderPresent: metadata.authorizationHeaderPresent,
    providerResponseAccepted: providerAcceptance,
    providerLocation
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (browser && !browser.killed) browser.kill();
  if (server) await new Promise((resolve) => server.close(resolve));
  await removeTempProfile(profilePath);
}
