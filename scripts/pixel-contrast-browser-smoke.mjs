import { spawn } from "node:child_process";
import { access, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { removeTempProfile } from "./smoke-runtime.mjs";

import { createStaticServer } from "./serve.mjs";
import {
  contrastRatio,
  parseCssColor,
  validatePixelContrastObservation
} from "./pixel-contrast-smoke-lib.mjs";

const profilePath = await mkdtemp(path.join(tmpdir(), "cowork-contrast-smoke-"));
let server;
let browser;

async function firstExisting(paths) {
  for (const candidate of paths) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next explicit Chrome location.
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
      // Retry only the isolated Chrome process started by this script.
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

async function waitForExpression(call, expression, label, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      if (await evaluateValue(call, expression)) return;
    } catch {
      // The navigation may not have created its execution context yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function elementPoint(call, elementExpression, label) {
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
  if (!point?.visible) throw new Error(`${label} is not visible in Chrome`);
  return point;
}

async function dispatchTrustedClick(call, elementExpression, label) {
  const point = await elementPoint(call, elementExpression, label);
  await call("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
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
  await new Promise((resolve) => setTimeout(resolve, 80));
}

async function dispatchTrustedPointer(call, elementExpression, label) {
  const point = await elementPoint(call, elementExpression, label);
  await call("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
  await new Promise((resolve) => setTimeout(resolve, 80));
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
  await new Promise((resolve) => setTimeout(resolve, 80));
}

async function discoverVisibleTextItems(call) {
  return evaluateValue(call, `(() => {
    document.querySelectorAll("[data-cowork-contrast-id]").forEach((element) => {
      element.removeAttribute("data-cowork-contrast-id");
    });
    let nextId = 0;
    const items = [];
    const cleanContent = (value) => {
      if (!value || value === "none" || value === "normal") return "";
      return value.replace(/^['\"]|['\"]$/g, "").trim();
    };
    const elementLabel = (element) => {
      if (element.id) return "#" + element.id;
      const classes = [...element.classList].slice(0, 2).join(".");
      return element.tagName.toLowerCase() + (classes ? "." + classes : "");
    };
    for (const element of document.querySelectorAll("body *")) {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number.parseFloat(style.opacity) === 0 ||
        style.clip !== "auto" ||
        element.classList.contains("visually-hidden") ||
        rect.width <= 0 ||
        rect.height <= 0
      ) continue;

      const sources = [];
      const directText = [...element.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .join(" ");
      if (directText) {
        sources.push({
          kind: "direct-text",
          text: directText,
          foreground: style.color,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight
        });
      }

      if (element instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit", "hidden"].includes(element.type)) {
        const text = element.value || element.placeholder;
        if (text) {
          const valueStyle = element.value ? style : getComputedStyle(element, "::placeholder");
          sources.push({
            kind: element.value ? "input-value" : "input-placeholder",
            text,
            foreground: valueStyle.color,
            fontSize: valueStyle.fontSize,
            fontWeight: valueStyle.fontWeight
          });
        }
      } else if (element instanceof HTMLTextAreaElement) {
        const text = element.value || element.placeholder;
        if (text) {
          const valueStyle = element.value ? style : getComputedStyle(element, "::placeholder");
          sources.push({
            kind: element.value ? "textarea-value" : "textarea-placeholder",
            text,
            foreground: valueStyle.color,
            fontSize: valueStyle.fontSize,
            fontWeight: valueStyle.fontWeight
          });
        }
      } else if (element instanceof HTMLSelectElement) {
        const text = element.selectedOptions[0]?.textContent?.trim();
        if (text) {
          sources.push({
            kind: "select-value",
            text,
            foreground: style.color,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight
          });
        }
      }

      for (const pseudo of ["::before", "::after"]) {
        const pseudoStyle = getComputedStyle(element, pseudo);
        const text = cleanContent(pseudoStyle.content);
        if (text) {
          sources.push({
            kind: pseudo,
            text,
            foreground: pseudoStyle.color,
            fontSize: pseudoStyle.fontSize,
            fontWeight: pseudoStyle.fontWeight
          });
        }
      }

      if (sources.length === 0) continue;
      const nodeKey = String(++nextId);
      element.dataset.coworkContrastId = nodeKey;
      const baseLabel = elementLabel(element);
      for (const source of sources) {
        items.push({
          nodeKey,
          label: baseLabel + ":" + source.kind + ":" + source.text.slice(0, 80),
          ...source
        });
      }
    }
    return items;
  })()`);
}

function flattenDomTree(root) {
  const nodes = new Map();
  const visit = (node, parentId = null) => {
    nodes.set(node.nodeId, { ...node, parentId: node.parentId ?? parentId });
    for (const child of node.children ?? []) visit(child, node.nodeId);
    if (node.shadowRoots) {
      for (const shadowRoot of node.shadowRoots) visit(shadowRoot, node.nodeId);
    }
    if (node.contentDocument) visit(node.contentDocument, node.nodeId);
  };
  visit(root);
  return nodes;
}

function compositeCssColor(foregroundValue, backgroundValue) {
  const foreground = parseCssColor(foregroundValue);
  const background = parseCssColor(backgroundValue);
  if (background.alpha !== 1) {
    throw new Error(`Background composition remained translucent: ${backgroundValue}`);
  }
  const red = foreground.red * foreground.alpha + background.red * (1 - foreground.alpha);
  const green = foreground.green * foreground.alpha + background.green * (1 - foreground.alpha);
  const blue = foreground.blue * foreground.alpha + background.blue * (1 - foreground.alpha);
  return `rgb(${red} ${green} ${blue})`;
}

async function resolveBackgroundRange(call, nodeId, nodes, cache) {
  if (cache.has(nodeId)) return cache.get(nodeId);
  const node = nodes.get(nodeId);
  if (!node) return { error: `DOM node ${nodeId} was not present in the document snapshot` };

  const direct = await call("CSS.getBackgroundColors", { nodeId });
  const directColors = direct.backgroundColors ?? [];
  const directOpaque = directColors.length > 0 && directColors.every((color) => {
    try {
      return parseCssColor(color).alpha === 1;
    } catch {
      return false;
    }
  });
  if (directOpaque) {
    const resolved = { backgroundColors: directColors, source: "chrome-range" };
    cache.set(nodeId, resolved);
    return resolved;
  }

  if (node.nodeName === "#document") {
    const resolved = { backgroundColors: ["rgb(255 255 255)"], source: "canvas" };
    cache.set(nodeId, resolved);
    return resolved;
  }

  let computed;
  try {
    computed = await call("CSS.getComputedStyleForNode", { nodeId });
  } catch (error) {
    const resolved = { error: `Chrome could not read computed background style: ${error.message}` };
    cache.set(nodeId, resolved);
    return resolved;
  }
  const properties = new Map(
    (computed.computedStyle ?? []).map((property) => [property.name, property.value])
  );
  const backgroundImage = properties.get("background-image") ?? "none";
  const ownBackground = properties.get("background-color") ?? "rgba(0, 0, 0, 0)";
  let own;
  try {
    own = parseCssColor(ownBackground);
  } catch (error) {
    const resolved = { error: `Unsupported computed background ${ownBackground}: ${error.message}` };
    cache.set(nodeId, resolved);
    return resolved;
  }
  if (backgroundImage === "none" && own.alpha === 1) {
    const resolved = { backgroundColors: [ownBackground], source: "opaque-computed-color" };
    cache.set(nodeId, resolved);
    return resolved;
  }
  if (backgroundImage !== "none") {
    const resolved = {
      error: `Chrome returned no opaque range for background image ${backgroundImage}`
    };
    cache.set(nodeId, resolved);
    return resolved;
  }

  const parentId = node.parentId;
  if (!parentId) {
    const resolved = { error: "Text background had no resolvable DOM parent" };
    cache.set(nodeId, resolved);
    return resolved;
  }
  const parent = await resolveBackgroundRange(call, parentId, nodes, cache);
  if (parent.error) {
    cache.set(nodeId, parent);
    return parent;
  }

  if (own.alpha === 0) {
    const resolved = { ...parent, source: `${parent.source}+transparent-child` };
    cache.set(nodeId, resolved);
    return resolved;
  }

  try {
    const resolved = {
      backgroundColors: parent.backgroundColors.map((background) =>
        compositeCssColor(ownBackground, background)
      ),
      source: `${parent.source}+alpha-composite`
    };
    cache.set(nodeId, resolved);
    return resolved;
  } catch (error) {
    const resolved = { error: error.message };
    cache.set(nodeId, resolved);
    return resolved;
  }
}

async function auditRenderedState(call, name, markerExpression) {
  const markerPassed = await evaluateValue(call, markerExpression);
  const items = await discoverVisibleTextItems(call);
  const documentNode = await call("DOM.getDocument", { depth: -1, pierce: true });
  const nodes = flattenDomTree(documentNode.root);
  const entries = [];
  const unsupported = [];
  const backgroundsByNode = new Map();
  const resolvedBackgrounds = new Map();

  for (const item of items) {
    let resolved = backgroundsByNode.get(item.nodeKey);
    if (!resolved) {
      const selector = `[data-cowork-contrast-id="${item.nodeKey}"]`;
      const node = await call("DOM.querySelector", {
        nodeId: documentNode.root.nodeId,
        selector
      });
      if (!node.nodeId) {
        resolved = { error: "DOM node disappeared before CSS inspection" };
      } else {
        resolved = await resolveBackgroundRange(
          call,
          node.nodeId,
          nodes,
          resolvedBackgrounds
        );
      }
      backgroundsByNode.set(item.nodeKey, resolved);
    }

    if (resolved.error) {
      unsupported.push({ label: item.label, reason: resolved.error });
    } else {
      entries.push({
        label: item.label,
        foreground: item.foreground,
        backgroundColors: resolved.backgroundColors,
        fontSize: item.fontSize,
        fontWeight: item.fontWeight
      });
    }
  }

  return {
    name,
    markerPassed,
    visibleTextItems: items.length,
    entries,
    unsupported
  };
}

function stateMinimumContrast(state) {
  let minimum = Number.POSITIVE_INFINITY;
  for (const entry of state.entries) {
    for (const background of entry.backgroundColors) {
      minimum = Math.min(minimum, contrastRatio(entry.foreground, background));
    }
  }
  return minimum;
}

try {
  const chromePath = await resolveChromePath();
  server = createStaticServer({ root: process.cwd() });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("The isolated contrast server did not expose a TCP port");
  }
  const showcaseUrl = `http://127.0.0.1:${address.port}/apps/formbuilder-showcase/`;

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
      "about:blank"
    ],
    { windowsHide: true, stdio: "ignore" }
  );

  const debugPort = await waitForDevToolsPort();
  const version = await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
  const targets = await waitForJson(`http://127.0.0.1:${debugPort}/json`);
  const target = targets.find((candidate) => candidate.type === "page");
  if (!target) throw new Error("Chrome page target not found");

  const socket = await connect(target.webSocketDebuggerUrl);
  const call = cdpClient(socket);
  await call("Runtime.enable");
  await call("Page.enable");
  await call("DOM.enable");
  await call("CSS.enable");
  await call("Page.bringToFront");
  await call("Emulation.setFocusEmulationEnabled", { enabled: true });
  await call("Emulation.setEmulatedMedia", {
    media: "screen",
    features: [{ name: "prefers-reduced-motion", value: "reduce" }]
  });
  await call("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      class CoworkContrastRecognition {
        start() { queueMicrotask(() => this.onstart?.({ type: "start" })); }
        stop() { queueMicrotask(() => this.onend?.({ type: "end" })); }
      }
      Object.defineProperty(globalThis, "SpeechRecognition", {
        configurable: true,
        value: CoworkContrastRecognition
      });
      Object.defineProperty(globalThis, "webkitSpeechRecognition", {
        configurable: true,
        value: CoworkContrastRecognition
      });
    })()`
  });
  await call("Page.navigate", { url: showcaseUrl });
  await waitForExpression(
    call,
    `document.readyState === "complete" && document.querySelector("#capability-badge")?.textContent.trim() === "Native WebMCP"`,
    "the native showcase"
  );
  await evaluateValue(call, "document.fonts.ready.then(() => true)");

  const states = [];
  states.push(await auditRenderedState(
    call,
    "native-ready",
    `document.querySelector("#capability-badge")?.textContent.trim() === "Native WebMCP"`
  ));

  await evaluateValue(call, `(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
    return true;
  })()`);
  await dispatchTrustedTab(call);
  states.push(await auditRenderedState(
    call,
    "keyboard-focus",
    `document.activeElement?.classList.contains("skip-link") === true && document.activeElement.matches(":focus-visible")`
  ));

  await dispatchTrustedPointer(call, 'document.querySelector("#full-name")', "Full name field");
  states.push(await auditRenderedState(
    call,
    "focused-field",
    `(() => {
      const field = document.querySelector('[data-field-id="full-name"]');
      const selector = document.querySelector("#attention-mode");
      return field?.classList.contains("is-focused") === true &&
        getComputedStyle(field, "::before").content.includes("Model focus") &&
        selector?.value === "pointer" &&
        selector.selectedOptions[0]?.textContent.startsWith("Follow me");
    })()`
  ));

  await dispatchTrustedClick(call, 'document.querySelector(".primary-action")', "Validate and export");
  states.push(await auditRenderedState(
    call,
    "validation-errors",
    `document.querySelectorAll(".form-field.has-error").length === 2`
  ));

  await dispatchTrustedClick(call, 'document.querySelector("#demo-offer")', "Create local demo offer");
  states.push(await auditRenderedState(
    call,
    "visible-offer",
    `(() => {
      const field = document.querySelector('[data-field-id="full-name"]');
      return document.querySelectorAll(".offer-chip").length === 1 &&
        field?.classList.contains("is-model-working") === true &&
        getComputedStyle(field, "::before").content.includes("Model working");
    })()`
  ));

  await dispatchTrustedClick(call, 'document.querySelector(".offer-chip")', "Visible action offer");
  states.push(await auditRenderedState(
    call,
    "receipt-controls",
    `document.querySelectorAll("#receipt-list .feedback-controls").length === 1`
  ));

  await dispatchTrustedClick(
    call,
    '[...document.querySelectorAll("#receipt-list .feedback-buttons button")].find((button) => button.textContent.trim() === "Good")',
    "Good feedback"
  );
  states.push(await auditRenderedState(
    call,
    "feedback-recorded",
    `document.querySelectorAll("#receipt-list .feedback-recorded").length === 1`
  ));

  // Handing the work over is the grant itself now: there is no separate
  // action-rights select to switch first.
  await dispatchTrustedClick(call, 'document.querySelector("#away-short")', "Briefly away");
  states.push(await auditRenderedState(
    call,
    "agent-solo",
    `document.querySelector("#mode-badge")?.textContent.trim() === "Model works alone" && document.querySelector("#human-label")?.textContent.includes("away")`
  ));

  await dispatchTrustedClick(call, 'document.querySelector("#return-human")', "Human return");
  await dispatchTrustedClick(call, 'document.querySelector("#toggle-agent")', "Pause model");
  states.push(await auditRenderedState(
    call,
    "human-solo",
    `document.querySelector("#mode-badge")?.textContent.trim() === "You work alone" && document.querySelector("#agent-label")?.textContent.includes("standby")`
  ));

  await dispatchTrustedClick(call, 'document.querySelector("#talk")', "Push to talk");
  await waitForExpression(call, 'document.querySelector("#talk")?.classList.contains("is-listening") === true', "listening state");
  states.push(await auditRenderedState(
    call,
    "listening",
    `document.querySelector("#talk")?.classList.contains("is-listening") === true && document.querySelector("#talk")?.textContent.trim() === "Listening…"`
  ));

  await dispatchTrustedClick(call, 'document.querySelector("#builder-tab-build")', "FormBuilder Studio Build tab");
  await dispatchTrustedClick(call, 'document.querySelector("#builder-suggest-add")', "Model suggests a field");
  states.push(await auditRenderedState(
    call,
    "builder-offer-visible",
    `document.querySelectorAll("#builder-offer-list .offer-chip").length === 1`
  ));

  const observation = {
    browserVersion: version.Browser,
    auditMethod: "chrome-css-background-ranges",
    states
  };
  const summary = validatePixelContrastObservation(observation);
  console.log(JSON.stringify({
    ...summary,
    browserVersion: version.Browser,
    stateResults: states.map((state) => ({
      name: state.name,
      markerPassed: state.markerPassed,
      auditedTextItems: state.entries.length,
      unsupportedTextItems: state.unsupported.length,
      minimumContrast: stateMinimumContrast(state)
    }))
  }, null, 2));
  socket.close();
} finally {
  browser?.kill();
  if (server?.listening) {
    await new Promise((resolve) => server.close(resolve));
  }
  await removeTempProfile(profilePath);
}
