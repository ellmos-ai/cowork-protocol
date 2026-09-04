import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { removeTempProfile } from "./smoke-runtime.mjs";

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

async function waitForPageValue(call, expression, predicate, attempts = 100) {
  let lastValue;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      lastValue = await evaluateValue(call, expression);
      if (predicate(lastValue)) return lastValue;
    } catch {
      // Navigation and page-owned WebMCP registration may still be settling.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for the showcase page: ${JSON.stringify(lastValue)}`);
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

async function stopOwnedBrowser(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  if (process.platform === "win32" && child.pid) {
    const killer = spawn(
      "taskkill.exe",
      ["/PID", String(child.pid), "/T", "/F"],
      { windowsHide: true, stdio: "ignore" }
    );
    await new Promise((resolve) => killer.once("exit", resolve));
  } else {
    child.kill("SIGTERM");
  }
  await Promise.race([
    exited,
    new Promise((resolve) => setTimeout(resolve, 5_000))
  ]);
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
  await waitForPageValue(
    call,
    `(() => ({
      readyState: document.readyState,
      modelContextAvailable: Boolean(document.modelContext),
      getTools: typeof document.modelContext?.getTools,
      badge: document.querySelector("#capability-badge")?.textContent.trim()
    }))()`,
    (value) =>
      value?.readyState === "complete" &&
      value.modelContextAvailable === true &&
      value.getTools === "function" &&
      value.badge === "Native WebMCP"
  );


  const zoomObserved = await evaluateValue(call, `(async () => {
    await document.fonts?.ready;
    const selector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([type=hidden]):not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      // A <summary> is focusable and keyboard-operable; the zoom reflow check
      // has to reach the panel's collapsible sections like any other control.
      "summary",
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

  // The workspace opens on the Studio canvas, so the fixed sample form the rest
  // of this proof reads is behind its tab: activate it with a real click. The
  // zoom census above deliberately runs before this, on the default canvas.
  await dispatchTrustedClick(call, 'document.querySelector("#workspace-tab-sample")', "Sample form tab");

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
  const sharedContext = await evaluateValue(
    call,
    `window.coworkSession.readContext()`
  );
  if (
    sharedContext?.type !== "context-snapshot" ||
    sharedContext.sessionId !== "formbuilder-showcase" ||
    sharedContext.revision < 4 ||
    sharedContext.recentTurns.length < 4 ||
    !sharedContext.recentTurns.some(({ role }) => role === "human") ||
    !sharedContext.recentTurns.some(({ role }) => role === "assistant")
  ) {
    throw new Error("Cowork-owned conversation turns did not reach the shared Context Manager");
  }
  const conversationObserved = {
    ...conversationBeforeClick,
    ...conversationAfterClick,
    sharedContext,
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
  // --- K3: the model works alone WITHOUT anyone pointing at a field. A human
  // who has stepped away cannot point, so stepping away has to widen the lens
  // to the whole form and the model has to fill it by itself. Before this,
  // both handover paths refused without a focused field and the human never
  // got to see the model work alone at all. ---
  await evaluateValue(call, `document.querySelector("#fold-handoff").open = true`);
  // Start from an empty form: the model fills what is empty, so a field an
  // earlier step already filled would otherwise silently shrink the pass.
  await evaluateValue(call, `(() => {
    for (const field of document.querySelectorAll("#demo-form .form-field[data-field-id]")) {
      const control = field.querySelector("input, textarea, select");
      control.value = "";
      control.dispatchEvent(new Event("input", { bubbles: true }));
    }
  })()`);
  // Turning attention off and back on is how a human clears the lens without
  // pointing somewhere else - the smoke reaches "no pointer" the same way.
  await evaluateValue(call, `(() => {
    const select = document.querySelector("#attention-mode");
    for (const value of ["off", "pointer"]) {
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return select.value;
  })()`);
  // Native WebMCP reports a refusing tool as an opaque DOMException, so the
  // observable fact here is that the focus lens refuses - not which code it
  // refused with. packages/core's unit tests own the code itself.
  const focusBeforeSoloPass = await evaluateValue(call, `(async () => {
    const tools = await document.modelContext.getTools();
    const tool = tools.find((candidate) => candidate.name === "cowork_read_focus");
    try {
      const result = await document.modelContext.executeTool(tool, {});
      const envelope = typeof result === "string" ? JSON.parse(result) : result;
      return { refused: false, packet: envelope.structuredContent };
    } catch (error) {
      return { refused: true, name: error.name };
    }
  })()`);
  await dispatchTrustedClick(
    call,
    'document.querySelector("#away-short")',
    "Step away with nothing pointed at"
  );
  // The pass is one bounded turn per field, so it takes a few frames.
  let soloPassObserved = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    soloPassObserved = await evaluateValue(call, `(() => ({
      values: [...document.querySelectorAll("#demo-form .form-field[data-field-id]")]
        .map((field) => [field.dataset.fieldId, field.querySelector("input, textarea, select")?.value ?? ""]),
      focusLabel: document.querySelector("#focus-label")?.textContent ?? null,
      areaLabel: document.querySelector("#area-label")?.textContent ?? null,
      microcopy: document.querySelector("#lease-microcopy")?.textContent ?? null
    }))()`);
    if (soloPassObserved.values.every(([, value]) => value !== "")) break;
  }
  const presenceUnderWholeForm = await evaluateValue(
    call,
    toolExecutionExpression("cowork_read_presence", {})
  );
  const receiptsAfterSoloPass = await evaluateValue(call, `(() => ({
    verifiedSolo: [...document.querySelectorAll("#receipt-list li")]
      .filter((item) =>
        item.textContent.startsWith("Verified:") &&
        item.textContent.includes("during Agent Solo")
      ).length,
    total: document.querySelectorAll("#receipt-list li").length
  }))()`);
  await dispatchTrustedClick(
    call,
    'document.querySelector("#return-human")',
    "Come back and read what the model did alone"
  );
  await new Promise((resolve) => setTimeout(resolve, 80));
  const returnAfterSoloPass = await evaluateValue(call, `(() => ({
    highlighted: document.querySelectorAll("#demo-form .form-field.is-new-since-handover").length,
    status: document.querySelector("#system-status")?.textContent ?? null
  }))()`);
  observed.soloWithoutPointer = {
    focusBeforeSoloPass,
    ...soloPassObserved,
    grant: presenceUnderWholeForm.packet?.grant ?? null,
    effectiveMode: presenceUnderWholeForm.packet?.effectiveMode ?? null,
    receiptsAfterSoloPass,
    returnAfterSoloPass
  };
  // Without a pointer the focus lens has nothing to answer, and saying so is
  // correct: the grant, carried on presence, is where a solo agent reads its
  // targets. Both facts are asserted together so neither can quietly go away.
  if (focusBeforeSoloPass.refused !== true) {
    throw new Error(
      `cowork_read_focus must still refuse without a pointer: ${JSON.stringify(focusBeforeSoloPass)}`
    );
  }
  if (
    presenceUnderWholeForm.packet?.effectiveMode !== "agent-solo" ||
    presenceUnderWholeForm.packet?.grant?.targetCount !== 4 ||
    // A grant still labelled "Complete only the focused field" while covering
    // the whole form would say one thing and do another.
    presenceUnderWholeForm.packet?.grant?.goal !== "Fill in the visible form fields"
  ) {
    throw new Error(
      `Stepping away without a pointer must grant over the whole form: ${JSON.stringify(presenceUnderWholeForm)}`
    );
  }
  const emptyAfterSoloPass = soloPassObserved.values.filter(([, value]) => value === "");
  if (emptyAfterSoloPass.length > 0) {
    throw new Error(
      `The model did not work alone across the form: ${JSON.stringify(soloPassObserved)}`
    );
  }
  if (!soloPassObserved.focusLabel?.includes("Whole form (4 fields)")) {
    throw new Error(
      `The lens must say it widened: ${JSON.stringify(soloPassObserved.focusLabel)}`
    );
  }
  if (receiptsAfterSoloPass.verifiedSolo !== 4) {
    throw new Error(
      `Each solo write needs its own verified receipt: ${JSON.stringify(receiptsAfterSoloPass)}`
    );
  }
  if (returnAfterSoloPass.highlighted !== 4) {
    throw new Error(
      `A returning human must see what changed: ${JSON.stringify(returnAfterSoloPass)}`
    );
  }
  // Back to an empty form, so the pre-existing checks below start where they
  // always did instead of on a form this new block already filled.
  await evaluateValue(call, `(() => {
    for (const field of document.querySelectorAll("#demo-form .form-field[data-field-id]")) {
      const control = field.querySelector("input, textarea, select");
      control.value = "";
      control.dispatchEvent(new Event("input", { bubbles: true }));
      field.classList.remove("is-new-since-handover");
    }
  })()`);

  // --- Solo lease + cowork_execute_solo/cowork_read_presence: neither tool
  // was previously exercised in this smoke. Added specifically to prove the
  // GAP-01 delegation-grant change (authorizeSoloAction() now checks the
  // grant's own human origin instead of humanPresence) did not silently
  // break the pre-existing fixed-form AFK lease it also governs. ---
  await evaluateValue(call, `(() => {
    document.querySelector('[data-field-id="email"]')
      .dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 50));
  // The Handoff section starts folded and opens itself once a handoff, a
  // grant or an absence is running - which the buttons inside it are what
  // starts. A trusted click needs the control visible, so the smoke opens
  // the section first, exactly as a reader reaches for it.
  await evaluateValue(call, `document.querySelector("#fold-handoff").open = true`);
  await dispatchTrustedClick(call, 'document.querySelector("#away-short")', "Briefly away, granting a solo lease");
  await new Promise((resolve) => setTimeout(resolve, 50));
  const presenceExecution = await evaluateValue(
    call,
    toolExecutionExpression("cowork_read_presence", {})
  );
  const soloExecution = await evaluateValue(
    call,
    toolExecutionExpression("cowork_execute_solo", {
      capabilityId: "form.set_value",
      targetId: "form-field:email",
      value: "lukas@example.com"
    })
  );
  const soloObserved = await evaluateValue(call, `(() => ({
    emailValueAfterSolo: document.querySelector("#email")?.value
  }))()`);
  await dispatchTrustedClick(call, 'document.querySelector("#return-human")', "Return from the solo lease");
  observed.presenceExecution = presenceExecution;
  observed.soloExecution = { ...soloExecution, ...soloObserved };
  if (presenceExecution.packet?.effectiveMode !== "agent-solo") {
    throw new Error(
      `cowork_read_presence did not report agent-solo under the active lease: ${JSON.stringify(presenceExecution)}`
    );
  }
  if (
    soloExecution.packet?.status !== "verified" ||
    soloObserved.emailValueAfterSolo !== "lukas@example.com"
  ) {
    throw new Error(
      `cowork_execute_solo did not verify a real solo-lease action: ${JSON.stringify({ soloExecution, soloObserved })}`
    );
  }

  // --- GAP-06: the model comments on a human's own change while it is
  // advising - explaining and proposing are one state now - and the comment
  // hides live the moment the model stops advising. After the return above
  // the human holds the click right and the model advises, so no mode switch
  // is needed to reach that state.
  await evaluateValue(call, `(() => {
    const textarea = document.querySelector("#access-needs");
    textarea.value = "Please provide a ramp.";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const advisorObserved = await evaluateValue(call, `(() => ({
    hidden: document.querySelector("#advisor-comment")?.hidden,
    text: document.querySelector("#advisor-comment")?.textContent
  }))()`);
  if (advisorObserved.hidden !== false || !advisorObserved.text?.includes("Access needs")) {
    throw new Error(`Expected a visible advisor comment naming the changed field: ${JSON.stringify(advisorObserved)}`);
  }
  await evaluateValue(call, `(() => {
    const select = document.querySelector("#work-mode");
    select.value = "human-solo";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const advisorHiddenAfterModeChange = await evaluateValue(call, `document.querySelector("#advisor-comment")?.hidden`);
  if (advisorHiddenAfterModeChange !== true) {
    throw new Error("Expected the advisor comment to hide live once the model stops advising");
  }
  observed.advisorComment = advisorObserved;

  // --- The security core, proven in the browser: asking the model to
  // execute without a grant must not give it the click right. The select
  // snaps back to the mode in force and the page says what is missing. ---
  const pickWorkMode = (choiceId) => `(() => {
    const select = document.querySelector("#work-mode");
    select.value = ${JSON.stringify(choiceId)};
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return {
      selected: select.value,
      offered: [...select.options].map((option) => option.value),
      modeBadge: document.querySelector("#mode-badge")?.textContent?.trim() ?? null,
      modelLabel: document.querySelector("#agent-label")?.textContent?.trim() ?? null,
      status: document.querySelector("#system-status")?.textContent ?? null
    };
  })()`;
  const refusedExecution = await evaluateValue(call, pickWorkMode("sparring-model"));
  if (
    refusedExecution.selected !== "idle" ||
    refusedExecution.modelLabel !== "Model is advising" ||
    !refusedExecution.status?.includes("granted job")
  ) {
    throw new Error(
      `A model without a grant must stay advising: ${JSON.stringify(refusedExecution)}`
    );
  }
  if (refusedExecution.offered.includes("doubling")) {
    throw new Error(
      `Doubling must not be offered while the two share no distinct areas: ${JSON.stringify(refusedExecution.offered)}`
    );
  }
  observed.grantRequiredForExecution = refusedExecution;

  // --- ...and with a grant it is reachable. Handing a job over while
  // staying present is the everyday flow: you say what to do, the model
  // executes inside the grant, you watch. Doubling then appears exactly
  // when the two stand on different fields, and not before. ---
  const pointAt = (fieldId) => `(() => {
    document.querySelector('[data-field-id="${fieldId}"]')
      .dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));
    return document.querySelector("#focus-label")?.textContent ?? null;
  })()`;
  const readPanel = `(() => ({
    selected: document.querySelector("#work-mode")?.value ?? null,
    offered: [...document.querySelector("#work-mode").options].map((option) => option.value),
    modeBadge: document.querySelector("#mode-badge")?.textContent?.trim() ?? null,
    modelLabel: document.querySelector("#agent-label")?.textContent?.trim() ?? null,
    humanLabel: document.querySelector("#human-label")?.textContent?.trim() ?? null,
    areaLabel: document.querySelector("#area-label")?.textContent?.trim() ?? null
  }))()`;

  await evaluateValue(call, `(() => {
    const select = document.querySelector("#work-mode");
    select.value = "sparring-human";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  await evaluateValue(call, pointAt("email"));
  await new Promise((resolve) => setTimeout(resolve, 50));
  await dispatchTrustedClick(call, 'document.querySelector("#hand-over")', "Hand the job over while watching");
  await new Promise((resolve) => setTimeout(resolve, 50));
  const handedOver = await evaluateValue(call, readPanel);
  if (
    handedOver.selected !== "sparring-model" ||
    handedOver.modelLabel !== "Model is executing" ||
    handedOver.humanLabel !== "You are advising"
  ) {
    throw new Error(
      `Handing a job over while staying must reach sparring-model: ${JSON.stringify(handedOver)}`
    );
  }
  if (handedOver.offered.includes("doubling")) {
    throw new Error(
      `Doubling must not be offered while both stand on the same field: ${JSON.stringify(handedOver)}`
    );
  }

  await evaluateValue(call, pointAt("full-name"));
  await new Promise((resolve) => setTimeout(resolve, 50));
  const disjointAreas = await evaluateValue(call, readPanel);
  if (!disjointAreas.offered.includes("doubling")) {
    throw new Error(
      `Doubling must appear once the two stand on different fields: ${JSON.stringify(disjointAreas)}`
    );
  }
  const doubling = await evaluateValue(call, pickWorkMode("doubling"));
  if (doubling.selected !== "doubling" || doubling.modeBadge !== "Doubling") {
    throw new Error(`Doubling must take effect on disjoint areas: ${JSON.stringify(doubling)}`);
  }
  await dispatchTrustedClick(call, 'document.querySelector("#return-human")', "Take the job back");
  observed.handedOverWhileWatching = { handedOver, disjointAreas, doubling };

  // --- The Studio canvas through the same three tools. Before this, the
  // sample form was the only surface an agent could follow: pointing at the
  // Studio left cowork_read_focus at STALE_FOCUS while the panel's own lens
  // already named the field. Now the focus, its context and an inert offer
  // come back for a Studio field on the same `form-field:<id>` target. ---
  await evaluateValue(call, `document.querySelector("#workspace-tab-studio").click()`);
  await evaluateValue(call, `document.querySelector("#builder-field-type").value = "text-short"`);
  await dispatchTrustedClick(call, 'document.querySelector("#builder-add-field")', "Add a Studio field");
  const studioFieldId = await evaluateValue(call, `(() => {
    const row = document.querySelector(".builder-field-row[data-field-id]");
    if (!row) return null;
    row.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    return row.dataset.fieldId;
  })()`);
  if (typeof studioFieldId !== "string") throw new Error("The Studio has no field row to point at");
  const studioTargetId = `form-field:${studioFieldId}`;
  const studioFocus = await evaluateValue(call, toolExecutionExpression("cowork_read_focus", {}));
  if (
    studioFocus.packet?.targetId !== studioTargetId ||
    !studioFocus.packet?.capabilityIds?.includes("form-update-field")
  ) {
    throw new Error(`cowork_read_focus did not follow the human onto the Studio field: ${JSON.stringify(studioFocus)}`);
  }
  const studioContext = await evaluateValue(
    call,
    toolExecutionExpression("cowork_request_context", { reason: "Need the field kind before proposing a label" })
  );
  if (studioContext.packet?.level !== 3 || !studioContext.packet?.relatedContext?.includes("Short answer")) {
    throw new Error(`cowork_request_context did not describe the Studio field: ${JSON.stringify(studioContext)}`);
  }
  const studioOffer = await evaluateValue(
    call,
    toolExecutionExpression("cowork_offer_action", {
      capabilityId: "form-update-field",
      targetId: studioTargetId,
      value: "Work email",
      summary: "Rename the field to Work email"
    })
  );
  const studioBeforeClick = await evaluateValue(call, `(() => ({
    label: document.querySelector('.builder-field-row[data-field-id="${studioFieldId}"] label input')?.value ?? null,
    visibleOfferCount: document.querySelectorAll(".offer-chip").length
  }))()`);
  if (!studioOffer.packet?.offerId || studioBeforeClick.visibleOfferCount !== 1 || studioBeforeClick.label === "Work email") {
    throw new Error(`A Studio offer must be visible and inert before the click: ${JSON.stringify({ studioOffer, studioBeforeClick })}`);
  }
  await dispatchTrustedClick(call, 'document.querySelector(".offer-chip")', "Studio action offer");
  await new Promise((resolve) => setTimeout(resolve, 100));
  const studioAfterClick = await evaluateValue(call, `(() => ({
    label: document.querySelector('.builder-field-row[data-field-id="${studioFieldId}"] label input')?.value ?? null,
    visibleOfferCount: document.querySelectorAll(".offer-chip").length
  }))()`);
  if (studioAfterClick.label !== "Work email" || studioAfterClick.visibleOfferCount !== 0) {
    throw new Error(`The trusted click did not apply the Studio offer: ${JSON.stringify(studioAfterClick)}`);
  }
  observed.studioThroughTools = { focus: studioFocus.packet, contextLevel: studioContext.packet.level, studioBeforeClick, studioAfterClick };

  // --- K3 on the Studio canvas: under a canvas-scoped grant an agent adds a
  // field with no offer and no click. Without this an agent building a long
  // form has to park one offer per field and wait for a click on each, and the
  // panel shows three at a time - unusable past a handful of fields. ---
  await evaluateValue(call, `document.querySelector("#fold-handoff").open = true`);
  await evaluateValue(call, `document.querySelector("#lease-goal").value = "Draft the rest of this form"`);
  const studioFieldsBeforeGrant = await evaluateValue(
    call,
    `document.querySelectorAll(".builder-field-row").length`
  );
  await dispatchTrustedClick(
    call,
    'document.querySelector("#hand-over")',
    "Hand the Studio canvas over while watching"
  );
  await new Promise((resolve) => setTimeout(resolve, 400));
  const studioSolo = await evaluateValue(
    call,
    toolExecutionExpression("cowork_execute_solo", {
      capabilityId: "form-add-field",
      targetId: "form-builder:canvas",
      value: "date: Preferred start date"
    })
  );
  const studioSoloObserved = await evaluateValue(call, `(() => ({
    rows: document.querySelectorAll(".builder-field-row").length,
    labels: [...document.querySelectorAll(".builder-field-row label input")].map((input) => input.value),
    visibleOfferCount: document.querySelectorAll(".offer-chip").length
  }))()`);
  await dispatchTrustedClick(call, 'document.querySelector("#return-human")', "End the Studio grant");
  observed.studioSolo = { execution: studioSolo, ...studioSoloObserved, studioFieldsBeforeGrant };
  if (studioSolo.packet?.status !== "verified") {
    throw new Error(`cowork_execute_solo did not verify a Studio field: ${JSON.stringify(studioSolo)}`);
  }
  if (!studioSoloObserved.labels.includes("Preferred start date")) {
    throw new Error(
      `The agent's field did not land on the canvas: ${JSON.stringify(studioSoloObserved)}`
    );
  }
  if (studioSoloObserved.visibleOfferCount !== 0) {
    throw new Error("Solo work must not leave an offer waiting for a click");
  }

  // --- K7: the model's own figure cycles three states, never "away". For a
  // model, away means no seat connected at all, so pressing the seat into it
  // read as "the connection is gone" and the human had to reach for the other
  // figure to get back. The Companion cockpit has only ever offered paused and
  // active; this is the page saying the same thing. ---
  await evaluateValue(call, `document.querySelector("#workspace-tab-sample").click()`);
  const seatCycle = [];
  for (let press = 0; press < 4; press += 1) {
    await dispatchTrustedClick(call, 'document.querySelector("#model-seat")', "Model seat");
    await new Promise((resolve) => setTimeout(resolve, 120));
    seatCycle.push(await evaluateValue(call, `(() => ({
      modelState: document.querySelector(".cowork-panel")?.dataset.modelState ?? null,
      status: document.querySelector("#system-status")?.textContent ?? null
    }))()`));
  }
  observed.modelSeatCycle = seatCycle;
  const awayPress = seatCycle.findIndex((step) => step.modelState === "away");
  if (awayPress !== -1) {
    throw new Error(
      `The model seat must never cycle into away: ${JSON.stringify(seatCycle)}`
    );
  }
  const paused = seatCycle.find((step) => step.modelState === "standby");
  if (!paused) {
    throw new Error(`The model seat must still reach standby: ${JSON.stringify(seatCycle)}`);
  }
  if (!paused.status?.includes("click again to resume")) {
    throw new Error(`A parked model must say how to bring it back: ${JSON.stringify(paused)}`);
  }

  const summary = validateNativeWebMcpObservation(observed);
  const conversationSummary = validateConversationObservation(conversationObserved);
  const bridgeSummary = validateBrowserHostBridgeObservation(bridgeObserved);
  const zoomSummary = validateZoomReflowObservation(zoomObserved);
  console.log(JSON.stringify({
    ...summary,
    conversation: conversationSummary,
    sharedContextClaim: true,
    bridge: bridgeSummary,
    zoom: zoomSummary,
    hostTokenClaim: false,
    toolNames: observed.toolNames,
    agentSoloLeaseClaim: true,
    presenceReportedEffectiveMode: presenceExecution.packet?.effectiveMode,
    soloExecutionStatus: soloExecution.packet?.status,
    soloWithoutPointer: {
      focusStillRefuses: observed.soloWithoutPointer.focusBeforeSoloPass.refused,
      grantTargetCount: observed.soloWithoutPointer.grant?.targetCount,
      grantGoal: observed.soloWithoutPointer.grant?.goal,
      fieldsFilledAlone: observed.soloWithoutPointer.values.filter(([, value]) => value !== "").length,
      verifiedSoloReceipts: observed.soloWithoutPointer.receiptsAfterSoloPass.verifiedSolo,
      highlightedOnReturn: observed.soloWithoutPointer.returnAfterSoloPass.highlighted
    },
    advisorCommentClaim: true,
    advisorCommentHiddenWhenModelStopsAdvising: advisorHiddenAfterModeChange,
    modelExecutionNeedsGrantClaim: true,
    studioFollowedThroughToolsClaim: true,
    studioSoloAddedFieldWithoutClick: observed.studioSolo.labels.includes("Preferred start date"),

    modelSeatNeverAwayClaim: observed.modelSeatCycle.every((step) => step.modelState !== "away"),
    modelSeatStates: observed.modelSeatCycle.map((step) => step.modelState),
    handOverWhileWatchingClaim: true,
    doublingOnDisjointAreasClaim: true
  }, null, 2));
  socket.close();
} finally {
  await stopOwnedBrowser(browser);
  if (server?.listening) {
    await new Promise((resolve) => server.close(resolve));
  }
  await removeTempProfile(profilePath);
}
