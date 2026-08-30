import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createStaticServer } from "./serve.mjs";
import {
  validateBrowserHostBridgeObservation,
  validateConversationObservation,
  validateNativeWebMcpObservation,
  validateZoomReflowObservation
} from "./webmcp-browser-smoke-lib.mjs";

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

async function evaluateValue(call, expression) {
  const evaluation = await call("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (evaluation.exceptionDetails) throw new Error(JSON.stringify(evaluation.exceptionDetails));
  return evaluation.result.value;
}

function toolExecutionExpression(toolName, input) {
  return `(async () => {
    const modelContext = document.modelContext;
    const tools = await modelContext.getTools();
    const tool = tools.find((candidate) => candidate.name === ${JSON.stringify(toolName)});
    if (!tool) throw new Error("Native tool not found: " + ${JSON.stringify(toolName)});
    const input = ${JSON.stringify(input)};
    function parsePacket(result) {
      const envelope = typeof result === "string" ? JSON.parse(result) : result;
      return envelope.structuredContent;
    }
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
  })()`;
}

async function dispatchTrustedClick(call, elementExpression, label) {
  const point = await evaluateValue(call, `(() => {
    const element = ${elementExpression};
    if (!element) return null;
    element.scrollIntoView({ block: "center", inline: "center" });
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      visible: rect.width > 0 && rect.height > 0
    };
  })()`);
  if (!point?.visible) throw new Error(`${label} is not visible for a trusted browser click`);
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
}

async function dispatchTrustedTab(call) {
  const key = {
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
    nativeVirtualKeyCode: 9
  };
  await call("Input.dispatchKeyEvent", { type: "rawKeyDown", ...key });
  await call("Input.dispatchKeyEvent", { type: "keyUp", ...key });
}

try {
  const chromePath = await resolveChromePath();
  const zoomLevel = Math.log(2) / Math.log(1.2);
  const defaultProfilePath = path.join(profilePath, "Default");
  await mkdir(defaultProfilePath, { recursive: true });
  await writeFile(
    path.join(defaultProfilePath, "Preferences"),
    JSON.stringify({ partition: { default_zoom_level: { x: zoomLevel } } }),
    "utf8"
  );
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
      "--force-device-scale-factor=1",
      "--remote-debugging-port=0",
      "--window-size=1440,1200",
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
  await call("Emulation.setFocusEmulationEnabled", { enabled: true });
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const zoomObserved = await evaluateValue(call, `(async () => {
    await document.fonts?.ready;
    const selector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([type=hidden]):not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])"
    ].join(",");
    const controls = [...new Set(document.querySelectorAll(selector))].filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    });

    const viewportCssWidth = window.innerWidth;
    const viewportCssHeight = window.innerHeight;
    const devicePixelRatio = window.devicePixelRatio;
    return {
      requestedZoomPercent: 200,
      requestedSurfaceWidth: 1440,
      requestedSurfaceHeight: 1200,
      browserZoomFactor: devicePixelRatio,
      devicePixelRatio,
      visualViewportScale: window.visualViewport?.scale ?? 1,
      viewportCssWidth,
      viewportCssHeight,
      viewportPhysicalWidth: viewportCssWidth * devicePixelRatio,
      viewportPhysicalHeight: viewportCssHeight * devicePixelRatio,
      documentHorizontalOverflow: Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth
      ) - document.documentElement.clientWidth,
      interactiveControlCount: controls.length
    };
  })()`);

  await evaluateValue(call, `(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
    return document.activeElement?.tagName ?? null;
  })()`);
  zoomObserved.reachableControlCount = 0;
  zoomObserved.focusVisibleControlCount = 0;
  zoomObserved.tabSequence = [];
  zoomObserved.unreachableControls = [];
  zoomObserved.horizontallyClippedControls = [];
  zoomObserved.textClippedControls = [];

  for (let index = 0; index < zoomObserved.interactiveControlCount; index += 1) {
    await dispatchTrustedTab(call);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const focus = await evaluateValue(call, `(() => {
      const element = document.activeElement;
      if (!(element instanceof HTMLElement)) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const label = element.id || element.getAttribute("name") || element.getAttribute("aria-label") ||
        element.textContent.trim().slice(0, 60) || element.tagName;
      const horizontallyVisible = rect.left >= -1 && rect.right <= window.innerWidth + 1;
      const verticallyVisible = rect.top < window.innerHeight && rect.bottom > 0;
      return {
        label,
        horizontallyVisible,
        verticallyVisible,
        focus: element.matches(":focus"),
        focusVisible: element.matches(":focus-visible"),
        rectTop: rect.top,
        rectBottom: rect.bottom,
        transform: style.transform,
        position: style.position,
        textClipped: ["A", "BUTTON", "SELECT"].includes(element.tagName) &&
          element.scrollWidth > element.clientWidth + 1 &&
          (style.overflowX === "hidden" || style.overflowX === "clip")
      };
    })()`);
    if (!focus) {
      zoomObserved.unreachableControls.push({ label: `tab-${index + 1}`, reason: "no active element" });
      continue;
    }
    zoomObserved.tabSequence.push(focus.label);
    if (focus.focusVisible) zoomObserved.focusVisibleControlCount += 1;
    if (focus.horizontallyVisible && focus.verticallyVisible) {
      zoomObserved.reachableControlCount += 1;
    } else {
      zoomObserved.unreachableControls.push(focus);
    }
    if (!focus.horizontallyVisible) zoomObserved.horizontallyClippedControls.push(focus.label);
    if (focus.textClipped) zoomObserved.textClippedControls.push(focus.label);
  }

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
        const envelope = typeof result === "string" ? JSON.parse(result) : result;
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
  observed.offerExecutions = [];
  observed.humanClickObservations = [];

  for (const value of ["Ada Lovelace", "Lukas Geiger"]) {
    const offerExecution = await evaluateValue(
      call,
      toolExecutionExpression("cowork_offer_action", {
        capabilityId: "form.set_value",
        targetId: "form-field:full-name",
        value,
        summary: `Set Full name to ${value}`
      })
    );
    observed.offerExecutions.push(offerExecution);

    const beforeClick = await evaluateValue(call, `(() => ({
      valueBeforeHumanClick: document.querySelector("#full-name")?.value,
      visibleOfferValue: document.querySelector(".offer-chip")?.dataset.offerValue,
      visibleOfferCount: document.querySelectorAll(".offer-chip").length
    }))()`);
    if (beforeClick.visibleOfferCount !== 1) {
      throw new Error("Expected exactly one visible offer before the trusted click");
    }

    await dispatchTrustedClick(call, 'document.querySelector(".offer-chip")', "Visible action offer");
    await new Promise((resolve) => setTimeout(resolve, 100));
    const afterClick = await evaluateValue(call, `(() => ({
      inputValueAfterClick: document.querySelector("#full-name")?.value,
      receiptStatusText: document.querySelector("#receipt-list .feedback-controls")?.closest("li")?.textContent.trim()
    }))()`);
    observed.humanClickObservations.push({ ...beforeClick, ...afterClick });

    await dispatchTrustedClick(
      call,
      '[...document.querySelectorAll("#receipt-list .feedback-buttons button")].find((button) => button.textContent.trim() === "Good")',
      `Human feedback control after ${JSON.stringify(afterClick)}`
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  observed.changeExecution = await evaluateValue(
    call,
    toolExecutionExpression("cowork_read_changes", {})
  );
  observed.feedbackExecution = await evaluateValue(
    call,
    toolExecutionExpression("cowork_read_feedback", {})
  );
  await evaluateValue(call, `(() => {
    document.querySelector("#conversation-input").value = "Can you fill this for me?";
    document.querySelector("#speak-output").checked = false;
    return true;
  })()`);
  await dispatchTrustedClick(call, 'document.querySelector("#send-conversation")', "Bounded conversation send");
  await new Promise((resolve) => setTimeout(resolve, 100));
  const conversationBeforeClick = await evaluateValue(call, `(() => ({
    transportLabel: document.querySelector("#model-transport-badge")?.textContent.trim(),
    transcriptText: document.querySelector("#transcript")?.textContent.trim(),
    visibleOfferValue: document.querySelector(".offer-chip")?.dataset.offerValue,
    visibleOfferCount: document.querySelectorAll(".offer-chip").length,
    valueBeforeHumanClick: document.querySelector("#full-name")?.value
  }))()`);
  if (conversationBeforeClick.visibleOfferCount !== 1) {
    throw new Error("Expected exactly one conversation offer before the trusted click");
  }
  await dispatchTrustedClick(call, 'document.querySelector(".offer-chip")', "Conversation action offer");
  await new Promise((resolve) => setTimeout(resolve, 100));
  const conversationAfterClick = await evaluateValue(call, `(() => ({
    inputValueAfterClick: document.querySelector("#full-name")?.value,
    receiptStatusText: document.querySelector("#receipt-list li")?.textContent.trim()
  }))()`);
  await evaluateValue(call, `(() => {
    document.querySelector("#conversation-input").value = "Use a different name.";
    return true;
  })()`);
  await dispatchTrustedClick(call, 'document.querySelector("#send-conversation")', "Second bounded conversation send");
  await new Promise((resolve) => setTimeout(resolve, 100));
  const turnExecution = await evaluateValue(
    call,
    toolExecutionExpression("cowork_read_turn", {})
  );
  const replyExecution = await evaluateValue(
    call,
    toolExecutionExpression("cowork_reply_turn", {
      turnId: turnExecution.packet.latest.turnId,
      message: "I can use a different name. Click the exact offer to approve it.",
      offers: [
        {
          capabilityId: "form.set_value",
          targetId: "form-field:full-name",
          value: "Ada Byron",
          summary: "Set Full name to Ada Byron"
        }
      ]
    })
  );
  const webMcpReplyBeforeClick = await evaluateValue(call, `(() => {
    const offer = [...document.querySelectorAll(".offer-chip")]
      .find((candidate) => candidate.dataset.offerValue === "Ada Byron");
    return {
      visibleOfferValue: offer?.dataset.offerValue,
      valueBeforeHumanClick: document.querySelector("#full-name")?.value
    };
  })()`);
  await dispatchTrustedClick(
    call,
    '[...document.querySelectorAll(".offer-chip")].find((candidate) => candidate.dataset.offerValue === "Ada Byron")',
    "WebMCP conversation reply offer"
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
  const webMcpReplyAfterClick = await evaluateValue(call, `(() => ({
    inputValueAfterClick: document.querySelector("#full-name")?.value,
    receiptStatusText: document.querySelector("#receipt-list li")?.textContent.trim()
  }))()`);
  const conversationObserved = {
    ...conversationBeforeClick,
    ...conversationAfterClick,
    webMcpInbox: {
      readPacket: turnExecution.packet,
      replyPacket: replyExecution.packet,
      ...webMcpReplyBeforeClick,
      ...webMcpReplyAfterClick
    }
  };
  const bridgeObserved = await evaluateValue(call, `(async () => {
    const { negotiateCoworkRuntime } = await import("/packages/bridge/src/index.js");
    const tools = [
      {
        name: "calendar_read_slots",
        description: "Read open appointment slots without changing the calendar.",
        inputSchema: {
          type: "object",
          properties: { date: { type: "string" } },
          required: ["date"]
        },
        annotations: { readOnlyHint: true }
      },
      {
        name: "calendar_book_slot",
        description: "Book the chosen appointment slot.",
        inputSchema: {
          type: "object",
          properties: {
            slotId: { type: "string" },
            attendee: { type: "string" }
          },
          required: ["slotId", "attendee"]
        },
        annotations: { readOnlyHint: false }
      }
    ];
    const hostCalls = [];
    const runtime = await negotiateCoworkRuntime({
      native: { isAvailable: async () => false, readFocus: async () => ({}) },
      webMcp: {
        tools,
        async executeTool(request) {
          hostCalls.push(request);
          if (request.arguments.date === "large-result") {
            return { records: ["x".repeat(5000)] };
          }
          return {
            date: request.arguments.date,
            slots: ["09:00", "10:30"]
          };
        }
      }
    });
    const bridge = runtime.adapter;
    const smallResult = await bridge.executeRead({
      capabilityId: "webmcp:calendar_read_slots",
      arguments: { date: "2026-09-01" }
    });
    const largeResult = await bridge.executeRead({
      capabilityId: "webmcp:calendar_read_slots",
      arguments: { date: "large-result" }
    });
    let mutationError = null;
    try {
      await bridge.executeRead({
        capabilityId: "webmcp:calendar_book_slot",
        arguments: { slotId: "09:00", attendee: "Lukas" }
      });
    } catch (error) {
      mutationError = { name: error.name, code: error.code };
    }
    return {
      runtimeMode: runtime.mode,
      catalog: bridge.catalog,
      smallResult,
      largeResult,
      hostCalls,
      mutationError
    };
  })()`);
  const summary = validateNativeWebMcpObservation(observed);
  const conversationSummary = validateConversationObservation(conversationObserved);
  const bridgeSummary = validateBrowserHostBridgeObservation(bridgeObserved);
  const zoomSummary = validateZoomReflowObservation(zoomObserved);
  console.log(JSON.stringify({
    ...summary,
    conversation: conversationSummary,
    bridge: bridgeSummary,
    zoom: zoomSummary,
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
