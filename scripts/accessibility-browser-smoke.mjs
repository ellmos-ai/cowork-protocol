import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createStaticServer } from "./serve.mjs";
import { validateAccessibilityObservation } from "./webmcp-browser-smoke-lib.mjs";

const profilePath = await mkdtemp(path.join(tmpdir(), "cowork-accessibility-smoke-"));
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
    throw new Error("Chrome was not found; set COWORK_CHROME_PATH to Chrome 150+");
  }
  return candidate;
}

async function waitForJson(url, attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      // Retry only the isolated browser process started by this script.
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

async function dispatchTrustedClick(call, selector) {
  const point = await evaluateValue(call, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return null;
    element.scrollIntoView({ block: "center", inline: "center" });
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  if (!point) throw new Error(`Cockpit control not found: ${selector}`);
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

try {
  const chromePath = await resolveChromePath();
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
      "--window-size=900,1000",
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
  await call("Page.enable");
  await call("Accessibility.enable");
  await call("Page.bringToFront");
  await call("Emulation.setFocusEmulationEnabled", { enabled: true });
  await call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: 390,
    screenHeight: 844
  });
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const observation = await evaluateValue(call, `(async () => {
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
      return style.display !== "none" && style.visibility !== "hidden" &&
        rect.width > 0 && rect.height > 0;
    });
    const horizontalClipping = [];
    const textClipping = [];
    for (const element of controls) {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const label = element.id || element.getAttribute("name") ||
        element.getAttribute("aria-label") || element.textContent.trim().slice(0, 60) ||
        element.tagName;
      if (rect.left < -1 || rect.right > window.innerWidth + 1) horizontalClipping.push(label);
      if (["A", "BUTTON", "SELECT"].includes(element.tagName) &&
          element.scrollWidth > element.clientWidth + 1 &&
          (style.overflowX === "hidden" || style.overflowX === "clip")) {
        textClipping.push(label);
      }
    }
    // Page-wide overflow scan: the control-only checks above miss running text
    // (headings, ledes, help copy) that never receives focus but can still be
    // clipped at the right edge of a narrow viewport.
    const textSelector = [
      "p", "h1", "h2", "h3", "h4", "h5", "h6", "span", "label", "li",
      "strong", "small", "dt", "dd", "pre", "legend", "figcaption"
    ].join(",");
    const overflowingTextElements = [];
    for (const element of document.querySelectorAll(textSelector)) {
      const text = element.textContent.trim();
      if (!text) continue;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (rect.right > window.innerWidth + 1) {
        overflowingTextElements.push(
          element.id || element.className || element.tagName + ":" + text.slice(0, 40)
        );
      }
    }
    return {
      url: location.href,
      title: document.title,
      readyState: document.readyState,
      bodyTextPreview: document.body?.innerText?.slice(0, 160) ?? "",
      viewportCssWidth: window.innerWidth,
      viewportCssHeight: window.innerHeight,
      documentHorizontalOverflow: Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth
      ) - document.documentElement.clientWidth,
      interactiveControlCount: controls.length,
      horizontallyClippedControls: horizontalClipping,
      textClippedControls: textClipping,
      overflowingTextElements
    };
  })()`);

  const { nodes } = await call("Accessibility.getFullAXTree");
  // "tab" was added for FormBuilder Studio's Build/Fill/Export role="tab" buttons.
  const interactiveRoles = new Set(["button", "checkbox", "combobox", "link", "tab", "textbox"]);
  observation.axInteractiveNodes = nodes
    .filter(
      (node) =>
        node.ignored !== true &&
        Number.isInteger(node.backendDOMNodeId) &&
        interactiveRoles.has(node.role?.value)
    )
    .map((node) => ({
      backendDOMNodeId: node.backendDOMNodeId,
      role: node.role.value,
      name: node.name?.value ?? ""
    }));

  await evaluateValue(call, `(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
    return true;
  })()`);
  observation.reachableControlCount = 0;
  observation.focusVisibleControlCount = 0;
  observation.tabSequence = [];
  for (let index = 0; index < observation.interactiveControlCount; index += 1) {
    await dispatchTrustedTab(call);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const focus = await evaluateValue(call, `(() => {
      const element = document.activeElement;
      if (!(element instanceof HTMLElement)) return null;
      const rect = element.getBoundingClientRect();
      return {
        label: element.id || element.getAttribute("name") ||
          element.getAttribute("aria-label") || element.textContent.trim().slice(0, 60) ||
          element.tagName,
        horizontallyVisible: rect.left >= -1 && rect.right <= window.innerWidth + 1,
        verticallyVisible: rect.top < window.innerHeight && rect.bottom > 0,
        focusVisible: element.matches(":focus-visible")
      };
    })()`);
    if (!focus) continue;
    observation.tabSequence.push(focus.label);
    if (focus.horizontallyVisible && focus.verticallyVisible) {
      observation.reachableControlCount += 1;
    }
    if (focus.focusVisible) observation.focusVisibleControlCount += 1;
  }

  let summary;
  try {
    summary = validateAccessibilityObservation(observation);
  } catch (error) {
    console.error(JSON.stringify({
      validationError: error.message,
      observation
    }, null, 2));
    throw error;
  }
  const roleCounts = Object.fromEntries(
    [...interactiveRoles].map((role) => [
      role,
      observation.axInteractiveNodes.filter((node) => node.role === role).length
    ])
  );
  const evidenceDirectory = process.env.COWORK_ACCESSIBILITY_EVIDENCE_DIR
    ? path.resolve(process.env.COWORK_ACCESSIBILITY_EVIDENCE_DIR)
    : null;
  if (evidenceDirectory) {
    await mkdir(evidenceDirectory, { recursive: true });
    await evaluateValue(call, "window.scrollTo(0, 0)");
    const screenshot = await call("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      fromSurface: true
    });
    await writeFile(
      path.join(evidenceDirectory, "formbuilder-embedded-cockpit-390px.png"),
      Buffer.from(screenshot.data, "base64")
    );
  }
  const actorControlStates = [];
  for (const expectedModelState of ["observing", "paused", "collaborating"]) {
    await dispatchTrustedClick(call, "#model-seat");
    const state = await evaluateValue(
      call,
      "document.querySelector('.cowork-panel')?.dataset.modelState"
    );
    if (state !== expectedModelState) {
      throw new Error(`Model actor control stopped at ${state ?? "missing"}`);
    }
    actorControlStates.push(`model:${state}`);
  }
  await dispatchTrustedClick(call, "#full-name");
  for (const expectedHumanState of ["afk-short", "afk-long", "present"]) {
    await dispatchTrustedClick(call, "#human-seat");
    const state = await evaluateValue(
      call,
      "document.querySelector('.cowork-panel')?.dataset.humanState"
    );
    if (state !== expectedHumanState) {
      throw new Error(`Human actor control stopped at ${state ?? "missing"}`);
    }
    actorControlStates.push(`human:${state}`);
  }
  console.log(JSON.stringify({
    ...summary,
    actorControlCycleClaim: true,
    actorControlStates,
    browserVersion: version.Browser,
    roleCounts,
    tabSequence: observation.tabSequence
  }, null, 2));
  socket.close();
} finally {
  browser?.kill();
  if (server?.listening) {
    await new Promise((resolve) => server.close(resolve));
  }
  await rm(profilePath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
