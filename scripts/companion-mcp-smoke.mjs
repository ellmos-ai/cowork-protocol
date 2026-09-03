import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { removeTempProfile, resolveExtensionBrowserPath } from "./smoke-runtime.mjs";

import { createCompanionSessionHost } from "../apps/desktop-companion/src/host.js";
import { createOpenAiCompatibleGatewaySender } from "../packages/model-transport/src/openai-compatible.js";
import { coworkToolDefinitions } from "../packages/native-webmcp/src/index.js";
import { createStaticServer } from "./serve.mjs";

// Proves the Companion is usable as a tool by a local agent: a real MCP client
// process speaks stdio JSON-RPC to the Companion's MCP server, the Companion
// relays each call to a real Chrome page, and the page answers. The offer this
// makes stays inert until a trusted human click, exactly as over WebMCP.
const MCP_SERVER = fileURLToPath(
  new URL("../apps/desktop-companion/src/mcp-server.js", import.meta.url)
);
const profilePath = await mkdtemp(path.join(tmpdir(), "cowork-companion-mcp-smoke-"));
let server;
let provider;
let browser;
let companionHost;
let mcpClient;

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

function cdpClient(socket) {
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id === undefined) return;
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

async function trustedClick(call, selector) {
  const point = await evaluateValue(call, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!(element instanceof HTMLElement)) return null;
    element.scrollIntoView({ block: "center" });
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  if (!point) throw new Error(`Trusted-click target not found: ${selector}`);
  for (const type of ["mousePressed", "mouseReleased"]) {
    await call("Input.dispatchMouseEvent", {
      type,
      x: point.x,
      y: point.y,
      button: "left",
      clickCount: 1
    });
  }
}

// A minimal stdio MCP client: newline-delimited JSON-RPC, the same framing the
// Companion's own Open Compute client uses.
function startMcpClient(endpoint) {
  const child = spawn(process.execPath, [MCP_SERVER], {
    env: { ...process.env, COWORK_COMPANION_ENDPOINT: endpoint },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true
  });
  const pending = new Map();
  let buffer = "";
  let stderrTail = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line === "") continue;
      const message = JSON.parse(line);
      const entry = pending.get(message.id);
      if (!entry) continue;
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
      else entry.resolve(message.result);
    }
  });
  child.stderr.on("data", (chunk) => {
    stderrTail = `${stderrTail}${chunk}`.slice(-2000);
  });
  let nextId = 0;
  return {
    child,
    request(method, params = {}) {
      const id = ++nextId;
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        setTimeout(
          () => reject(new Error(`MCP request timed out: ${method}; stderr=${stderrTail}`)),
          30_000
        );
      });
    },
    notify(method, params = {}) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
    },
    close() {
      child.stdin.end();
      child.kill();
    }
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const evidence = {};

try {
  const chromePath = await resolveExtensionBrowserPath();
  server = createStaticServer({ root: process.cwd() });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Showcase server has no port");
  const showcaseOrigin = `http://127.0.0.1:${address.port}`;
  // A provider that behaves the way the measured one does: qwen3.8:27b-mlx on
  // Ollama spent all 500 answer tokens on 2,136 characters of reasoning and
  // returned an empty content field, and only answered once the turn was sent
  // again with reasoning_effort "none". Faked here so the smoke stays fast;
  // the live numbers are in docs/evidence.md.
  const providerCalls = [];
  provider = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      const sent = JSON.parse(body);
      providerCalls.push(sent.reasoning_effort ?? null);
      const thinking = sent.reasoning_effort !== "none";
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        choices: [{
          finish_reason: thinking ? "length" : "stop",
          message: thinking
            ? { content: "", reasoning: "Weighing which field to offer. ".repeat(70) }
            : {
                content: JSON.stringify({
                  message: "I can put Grace Hopper in the name field.",
                  offers: [{
                    capabilityId: "form.set_value",
                    targetId: "form-field:full-name",
                    value: "Grace Hopper",
                    summary: "Set Full name to Grace Hopper"
                  }]
                })
              }
        }]
      }));
    });
  });
  await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
  const providerEndpoint =
    `http://127.0.0.1:${provider.address().port}/v1/chat/completions`;
  const modelNotices = [];
  companionHost = createCompanionSessionHost({
    allowedOrigins: [showcaseOrigin],
    port: 0,
    createLinkSessionId: () => "companion-mcp-link",
    sendModelTurn: createOpenAiCompatibleGatewaySender({
      endpoint: providerEndpoint,
      model: "reasoning-model",
      onNotice: (notice) => modelNotices.push(notice)
    })
  });
  const companionAddress = await companionHost.listen();
  const companionEndpoint =
    `http://${companionAddress.hostname}:${companionAddress.port}/cowork/v1`;
  const showcaseUrl =
    `${showcaseOrigin}/apps/formbuilder-showcase/?companionEndpoint=` +
    encodeURIComponent(companionEndpoint);

  browser = spawn(chromePath, [
    ...(process.env.COWORK_MCP_HEADFUL === "1" ? [] : ["--headless=new"]),
    "--disable-gpu",
    "--enable-features=WebMCP,WebMCPTesting",
    "--enable-blink-features=WebMCP",
    "--remote-debugging-port=0",
    "--window-size=1100,1000",
    `--user-data-dir=${profilePath}`,
    showcaseUrl
  ], { windowsHide: true, stdio: "ignore" });

  const debugPort = await waitForDevToolsPort();
  const version = await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
  const protocolSchema = await waitForJson(`http://127.0.0.1:${debugPort}/json/protocol`);
  const localNetworkPermission = ["loopbackNetwork", "localNetwork", "localNetworkAccess"]
    .find((name) => (protocolSchema.domains
      ?.find(({ domain }) => domain === "Browser")
      ?.types?.find(({ id }) => id === "PermissionType")?.enum ?? []).includes(name));
  if (!localNetworkPermission) {
    throw new Error("Chrome exposes no local-network permission for the Companion smoke");
  }
  const targets = await waitForJson(`http://127.0.0.1:${debugPort}/json`);
  const target = targets.find(
    (candidate) => candidate.type === "page" && candidate.url.includes("formbuilder-showcase")
  );
  if (!target) throw new Error("Showcase page target not found");
  const call = cdpClient(await connect(target.webSocketDebuggerUrl));
  await call("Runtime.enable");
  await call("Page.enable");
  await call("Page.bringToFront");
  await call("Browser.grantPermissions", {
    permissions: [localNetworkPermission],
    origin: showcaseOrigin
  });

  await waitForValue(
    call,
    `Boolean(window.coworkSession && document.querySelector("#open-companion"))`,
    (value) => value === true
  );
  await trustedClick(call, "#open-companion");
  await waitForValue(
    call,
    `document.querySelector("#open-companion")?.textContent ?? null`,
    (value) => value === "Connected"
  );
  // The workspace opens on the Studio canvas, so the fixed sample form this
  // proof reads is behind its tab: activate it with a real click first.
  await trustedClick(call, "#workspace-tab-sample");
  // The agent reads what the human is looking at, so give it a focus to read.
  await trustedClick(call, "#full-name");
  evidence.focusedField = await waitForValue(
    call,
    `document.activeElement?.id ?? null`,
    (value) => value === "full-name"
  );

  mcpClient = startMcpClient(companionEndpoint);
  const initialized = await mcpClient.request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "cowork-mcp-smoke", version: "0.1.0" }
  });
  mcpClient.notify("notifications/initialized");
  assert(
    initialized?.serverInfo?.name === "cowork-companion" &&
      typeof initialized.protocolVersion === "string",
    `MCP handshake was not answered: ${JSON.stringify(initialized)}`
  );
  evidence.handshake = {
    protocolVersion: initialized.protocolVersion,
    serverInfo: initialized.serverInfo
  };

  const listed = await mcpClient.request("tools/list");
  const publishedNames = (await coworkToolDefinitions()).map(({ name }) => name);
  evidence.tools = listed.tools.map(({ name }) => name);
  assert(
    JSON.stringify(evidence.tools) === JSON.stringify(publishedNames),
    `MCP tool list differs from the page's WebMCP registration: ${JSON.stringify(evidence.tools)}`
  );

  const focusCall = await mcpClient.request("tools/call", {
    name: "cowork_read_focus",
    arguments: {}
  });
  assert(
    focusCall?.isError !== true,
    `cowork_read_focus failed over MCP: ${JSON.stringify(focusCall)}`
  );
  evidence.focusPacket = focusCall.structuredContent;
  assert(
    evidence.focusPacket?.targetId === "form-field:full-name",
    `The relayed focus packet did not describe the focused field: ${JSON.stringify(evidence.focusPacket)}`
  );

  const beforeOffer = await evaluateValue(call, `(() => ({
    value: document.querySelector("#full-name")?.value,
    offers: document.querySelectorAll(".offer-chip").length
  }))()`);
  assert(
    beforeOffer.offers === 0,
    `The page already showed an offer before the agent made one: ${JSON.stringify(beforeOffer)}`
  );

  const offerCall = await mcpClient.request("tools/call", {
    name: "cowork_offer_action",
    arguments: {
      capabilityId: "form.set_value",
      targetId: "form-field:full-name",
      value: "Ada Lovelace",
      summary: "Set Full name to Ada Lovelace"
    }
  });
  assert(
    offerCall?.isError !== true,
    `cowork_offer_action failed over MCP: ${JSON.stringify(offerCall)}`
  );
  evidence.offerPacket = offerCall.structuredContent;

  const offered = await waitForValue(call, `(() => ({
    value: document.querySelector("#full-name")?.value,
    offers: document.querySelectorAll(".offer-chip").length,
    offerValue: document.querySelector(".offer-chip")?.dataset.offerValue ?? null
  }))()`, (state) => state.offers === 1);
  assert(
    offered.offerValue === "Ada Lovelace",
    `The relayed offer was not the one the agent made: ${JSON.stringify(offered)}`
  );
  assert(
    offered.value === beforeOffer.value,
    `An MCP offer changed the page before the human clicked: ${JSON.stringify(offered)}`
  );
  evidence.inertOffer = { valueBeforeClick: offered.value, offerValue: offered.offerValue };

  // The offer an agent made over MCP has to be authorizable by a real click on
  // the page, with the Companion connected and owning the session.
  evidence.offerReachableByHuman = await evaluateValue(call, `(() => {
    const chip = document.querySelector(".offer-chip");
    if (!chip) return { reachable: false, reason: "no offer chip in the page" };
    const style = getComputedStyle(chip);
    const rect = chip.getBoundingClientRect();
    const panel = document.querySelector(".cowork-panel");
    return {
      reachable: style.display !== "none" && rect.width > 0,
      width: rect.width,
      panelConnected: Boolean(panel?.classList.contains("is-companion-connected")),
      note: document.querySelector(".companion-authorization-note")?.textContent ?? null
    };
  })()`);
  assert(
    evidence.offerReachableByHuman.reachable &&
      evidence.offerReachableByHuman.panelConnected,
    `An MCP offer must stay clickable while the Companion is connected: ${JSON.stringify(evidence.offerReachableByHuman)}`
  );

  await trustedClick(call, ".offer-chip");
  evidence.afterHumanClick = await waitForValue(
    call,
    `(() => ({
      value: document.querySelector("#full-name")?.value,
      offers: document.querySelectorAll(".offer-chip").length,
      receipts: document.querySelectorAll("#receipt-list li").length,
      receiptText: document.querySelector("#receipt-list li strong")?.textContent ?? null,
      verdicts: [...document.querySelectorAll("#receipt-list .feedback-buttons button")]
        .map((button) => button.textContent)
    }))()`,
    (state) => state.value === "Ada Lovelace" && state.receipts >= 1
  );
  assert(
    evidence.afterHumanClick.receiptText?.startsWith("Verified"),
    `The authorized MCP offer did not produce a verified receipt: ${JSON.stringify(evidence.afterHumanClick)}`
  );
  assert(
    ["Good", "Adjust", "Different"].every(
      (label) => evidence.afterHumanClick.verdicts.includes(label)
    ),
    `The receipt did not offer the three verdicts: ${JSON.stringify(evidence.afterHumanClick.verdicts)}`
  );

  // One verdict click, to prove the feedback path is live in replica mode too.
  await trustedClick(
    call,
    "#receipt-list .feedback-buttons button"
  );
  evidence.afterFeedbackClick = await waitForValue(
    call,
    `document.querySelector("#receipt-list .feedback-recorded")?.textContent ?? null`,
    (value) => typeof value === "string" && value.length > 0
  );

  const uiState = await (await fetch(`${companionEndpoint}/ui/state`)).json();
  evidence.cockpitAgentLine = uiState.agent;
  assert(
    uiState.agent?.client === "cowork-mcp-smoke" &&
      uiState.agent.toolCalls === 2 &&
      uiState.agent.pageLinked === true,
    `The Companion window did not report the connected MCP agent: ${JSON.stringify(uiState.agent)}`
  );

  // --- The Companion's own model, end to end: a human types in the Companion,
  // the model answers, its suggestion appears on the page, and only a trusted
  // click there applies it. No MCP agent is involved in this part. ---
  const companionOrigin = `http://${companionAddress.hostname}:${companionAddress.port}`;
  const turnResponse = await fetch(
    `${companionOrigin}/cowork/v1/ui/sessions/companion-mcp-link/turns`,
    {
      method: "POST",
      headers: { "content-type": "application/json", origin: companionOrigin },
      body: JSON.stringify({
        turnId: "companion-model-turn",
        input: { transcript: "Fill in the form fields for me please." }
      })
    }
  );
  const turnResult = await turnResponse.json();
  assert(
    turnResponse.ok,
    `The Companion model turn failed: ${JSON.stringify(turnResult)}`
  );
  assert(
    providerCalls.length === 2 &&
      providerCalls[0] === null &&
      providerCalls[1] === "none" &&
      modelNotices[0]?.code === "MODEL_THOUGHT_PAST_ITS_BUDGET",
    `A reasoning model must be retried once, and the retry disclosed: ${JSON.stringify({ providerCalls, modelNotices })}`
  );
  evidence.companionModelTurn = {
    message: turnResult.reply.message,
    delivery: turnResult.delivery,
    providerCalls,
    retryDisclosed: modelNotices[0]?.code ?? null
  };
  assert(
    turnResult.delivery?.offered === 1 && turnResult.delivery.rejected === 0,
    `The model's offer did not reach the page: ${JSON.stringify(turnResult.delivery)}`
  );

  const modelOffer = await waitForValue(call, `(() => ({
    value: document.querySelector("#full-name")?.value,
    offerValue: document.querySelector(".offer-chip")?.dataset.offerValue ?? null,
    transcript: document.querySelector("#transcript")?.textContent ?? null
  }))()`, (state) => state.offerValue === "Grace Hopper" &&
    state.transcript?.includes("Grace Hopper"));
  assert(
    modelOffer.value === "Ada Lovelace",
    `The model's suggestion changed the page before any click: ${JSON.stringify(modelOffer)}`
  );
  assert(
    modelOffer.transcript?.includes("Fill in the form fields for me please.") &&
      modelOffer.transcript.includes("Grace Hopper"),
    `The page did not show the Companion-side conversation: ${JSON.stringify(modelOffer)}`
  );
  evidence.modelOfferBeforeClick = modelOffer;

  await trustedClick(call, ".offer-chip");
  evidence.modelOfferAfterClick = await waitForValue(call, `(() => ({
    value: document.querySelector("#full-name")?.value,
    receipts: document.querySelectorAll("#receipt-list li").length,
    receiptText: document.querySelector("#receipt-list li strong")?.textContent ?? null
  }))()`, (state) => state.value === "Grace Hopper" && state.receipts >= 1);
  assert(
    evidence.modelOfferAfterClick.receiptText?.startsWith("Verified"),
    `The model's authorized offer did not verify: ${JSON.stringify(evidence.modelOfferAfterClick)}`
  );

  evidence.browserVersion = version.Browser;
  console.log(JSON.stringify(evidence, null, 2));
  console.log("Companion MCP smoke passed: a local agent used the page as a tool.");
  console.log(
    "Companion model end to end: typed turn -> model reply -> page offer -> trusted click -> verified."
  );
} finally {
  mcpClient?.close();
  browser?.kill();
  await companionHost?.close();
  server?.close();
  provider?.close();
  await removeTempProfile(profilePath);
}
