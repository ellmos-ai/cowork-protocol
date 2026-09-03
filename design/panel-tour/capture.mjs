// Regenerates the panel tour: three screenshots of the live Cowork panel, one
// of the Desktop Companion, the measured geometry of every annotated region,
// and the annotated PNG built from that geometry. Chrome renders the overlay
// too, so nothing here needs an image library.
//
//   node design/panel-tour/capture.mjs
//
// Env: COWORK_CHROME_PATH (browser), COWORK_PANEL_TOUR_URL (showcase),
// COWORK_COMPANION_UI (companion UI; skipped when unreachable).
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { removeTempProfile, resolveExtensionBrowserPath } from "../../scripts/smoke-runtime.mjs";

const OUT = path.dirname(fileURLToPath(import.meta.url));
const SHOWCASE_URL =
  process.env.COWORK_PANEL_TOUR_URL ??
  "https://ellmos-ai.github.io/cowork-protocol/apps/formbuilder-showcase/";
const COMPANION_URL = process.env.COWORK_COMPANION_UI ?? "http://127.0.0.1:47831/cowork/v1/ui";
const VIEWPORT = { width: 1440, height: 1100 };
const SCALE = 2;

// Marker order is top-to-bottom on the panel so the legend reads as a tour.
const MARKERS = [
  { n: 1, selector: ".panel-topline", label: "Surface header" },
  { n: 2, selector: "#status-steps", label: "Present · Working on · Role" },
  { n: 3, selector: ".actor-stage", label: "The two figures" },
  { n: 4, selector: "#webmcp-help", label: "WebMCP help" },
  { n: 5, selector: "section.panel-section.model-seat", label: "Model seat + demo switch" },
  { n: 6, selector: ".focus-readout", label: "Attention lens" },
  { n: 7, selector: 'section[aria-labelledby="work-mode-heading"]', label: "Role and offers" },
  { n: 8, selector: 'section[aria-labelledby="audio-heading"]', label: "Conversation" },
  { n: 9, selector: ".receipt-panel", label: "Verified receipts" },
  { n: 10, selector: 'section[aria-labelledby="presence-heading"]', label: "Handoff" }
];

const profilePath = await mkdtemp(path.join(tmpdir(), "cowork-panel-tour-"));
let browser;

async function waitForDevToolsPort(attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const port = Number((await readFile(path.join(profilePath, "DevToolsActivePort"), "utf8")).split(/\r?\n/, 1)[0]);
      if (Number.isInteger(port) && port > 0) return port;
    } catch {
      // The isolated profile started by this script is not ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Timed out waiting for Chrome's isolated DevTools port");
}

async function waitForJson(url, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      // Retry only the browser process started below.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
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

async function evaluate(call, expression) {
  const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}

async function waitFor(call, expression, label, attempts = 120) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      if (await evaluate(call, expression)) return;
    } catch {
      // The navigation may not have an execution context yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function pointAt(call, selector) {
  const point = await evaluate(call, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return null;
    element.scrollIntoView({ block: "center", inline: "center" });
    const box = element.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  })()`);
  if (!point) throw new Error(`Control not found: ${selector}`);
  return point;
}

async function click(call, selector) {
  const point = await pointAt(call, selector);
  await call("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 });
  await call("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 });
}

async function hover(call, selector) {
  await call("Input.dispatchMouseEvent", { type: "mouseMoved", ...(await pointAt(call, selector)) });
}

/** Screenshot of one element, in document coordinates, at SCALE. The panel is
 *  `position: sticky`; captureBeyondViewport resizes the viewport underneath,
 *  which would make a stuck panel slide. Pinning it to its resting place first
 *  changes no pixel at scroll 0 and keeps the capture honest. */
async function shootElement(call, selector, filename) {
  const clip = await evaluate(call, `(() => {
    const panel = document.querySelector(".cowork-panel");
    if (panel) panel.style.position = "static";
    window.scrollTo(0, 0);
    const element = document.querySelector(${JSON.stringify(selector)});
    const box = element.getBoundingClientRect();
    return { x: box.left + scrollX, y: box.top + scrollY, width: box.width, height: box.height };
  })()`);
  const shot = await call("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { ...clip, scale: SCALE }
  });
  await writeFile(path.join(OUT, filename), Buffer.from(shot.data, "base64"));
  return { filename, clip };
}

const escapeXml = (value) =>
  value.replace(/[&<>]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character]);

/** Panel image on the left, a numbered pin in the margin beside every measured
 *  region, and a legend column whose rows sit at the height of the thing they
 *  name - pushed down only where two regions would collide. */
function buildOverlaySvg({ panel, boxes, pngBase64 }) {
  const padTop = 20;
  const padLeft = 46;
  const gutter = 74; // room for the elbow connectors
  const column = 296;
  const width = padLeft + panel.width + gutter + column + 20;
  const height = padTop + panel.height + padTop;
  const columnX = padLeft + panel.width + gutter;
  const minRowGap = 30;

  // Legend rows follow the panel; only overlaps are nudged, so a row never
  // drifts away from the region it labels.
  let previousRow = -Infinity;
  const rows = boxes.map((box) => {
    const wanted = padTop + box.y + box.height / 2;
    const row = Math.max(wanted, previousRow + minRowGap);
    previousRow = row;
    return row;
  });

  const parts = boxes.map((box, index) => {
    const marker = MARKERS[index];
    const left = padLeft + box.x;
    const top = padTop + box.y;
    const midY = top + box.height / 2;
    const rightEdge = left + box.width;
    const rowY = rows[index];
    const pinX = columnX - 24;
    return `
    <rect class="zone" x="${left - 4}" y="${top - 4}" width="${box.width + 8}" height="${box.height + 8}" rx="10"/>
    <path class="lead" d="M${rightEdge + 6} ${midY} H${pinX - 30} V${rowY} H${pinX - 13}"/>
    <circle class="pin" cx="24" cy="${midY}" r="13"/>
    <text class="pin-number" x="24" y="${midY + 5}">${marker.n}</text>
    <circle class="pin" cx="${pinX}" cy="${rowY}" r="13"/>
    <text class="pin-number" x="${pinX}" y="${rowY + 5}">${marker.n}</text>
    <text class="legend" x="${columnX + 4}" y="${rowY + 5}">${escapeXml(marker.label)}</text>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
  width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style>
    .bg { fill: #fdfbf7; }
    .zone { fill: none; stroke: #ff604a; stroke-width: 2; stroke-dasharray: 6 4; opacity: .9; }
    .lead { fill: none; stroke: #0a7a72; stroke-width: 1.6; opacity: .7; }
    .pin { fill: #ff604a; stroke: #fdfbf7; stroke-width: 2.5; }
    .pin-number { fill: #fdfbf7; font: 700 14px "Segoe UI", system-ui, sans-serif; text-anchor: middle; }
    .legend { fill: #241c15; font: 500 16px "Segoe UI", system-ui, sans-serif; }
    .rule { stroke: #e5be6b; stroke-width: 2; }
  </style>
  <rect class="bg" x="0" y="0" width="${width}" height="${height}"/>
  <image x="${padLeft}" y="${padTop}" width="${panel.width}" height="${panel.height}"
    xlink:href="data:image/png;base64,${pngBase64}"/>
  <line class="rule" x1="${columnX - 54}" y1="${padTop}" x2="${columnX - 54}" y2="${height - padTop}"/>
  ${parts.join("\n")}
</svg>`;
}

try {
  const chromePath = await resolveExtensionBrowserPath();
  await mkdir(OUT, { recursive: true });
  browser = spawn(
    chromePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--enable-features=WebMCP,WebMCPTesting",
      "--force-device-scale-factor=1",
      "--hide-scrollbars",
      "--remote-debugging-port=0",
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
      `--user-data-dir=${profilePath}`,
      SHOWCASE_URL
    ],
    { windowsHide: true, stdio: "ignore" }
  );

  const debugPort = await waitForDevToolsPort();
  const version = await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
  const targets = await waitForJson(`http://127.0.0.1:${debugPort}/json`);
  const target = targets.find((candidate) => candidate.type === "page" && candidate.url.includes("formbuilder-showcase"));
  if (!target) throw new Error("Showcase page target not found");
  const socket = await connect(target.webSocketDebuggerUrl);
  const call = cdpClient(socket);
  await call("Runtime.enable");
  await call("Page.enable");
  await call("Emulation.setDeviceMetricsOverride", { ...VIEWPORT, deviceScaleFactor: 1, mobile: false });
  await waitFor(
    call,
    `document.readyState === "complete" && document.querySelector("#builder-add-field") !== null`,
    "the showcase to finish loading"
  );

  const captured = [];

  // The WebMCP help panel opens itself once capability detection lands and
  // grows the panel by ~134px. Measuring across that moment silently shifted
  // every marker below it by exactly that much, so the verdict is awaited and
  // the disclosure is pinned open - the tour explains what is inside it anyway.
  await waitFor(
    call,
    `document.querySelector("#webmcp-help-state").textContent.trim() !== "checking…"`,
    "the WebMCP capability verdict"
  );
  await evaluate(call, `document.querySelector("#webmcp-help").open = true`);
  await new Promise((resolve) => setTimeout(resolve, 400));

  const measure = () => evaluate(call, `(() => {
    const panel = document.querySelector(".cowork-panel");
    panel.style.position = "static";
    window.scrollTo(0, 0);
    const frame = panel.getBoundingClientRect();
    return ${JSON.stringify(MARKERS.map((marker) => marker.selector))}.map((selector) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error("Marker target missing: " + selector);
      const box = element.getBoundingClientRect();
      return { x: box.left - frame.left, y: box.top - frame.top, width: box.width, height: box.height };
    });
  })()`);

  // (a) Resting state: nothing has happened yet, the human holds the click right.
  const before = await measure();
  captured.push(await shootElement(call, ".cowork-panel", "panel-initial.png"));
  const boxes = await measure();
  const restingMode = await evaluate(call, `document.querySelector("#mode-badge").textContent`);
  const panelBox = captured[0].clip;

  // An overlay drawn on stale geometry looks plausible and points at the wrong
  // thing, so a layout that moved during the capture fails the run instead.
  const drift = boxes
    .map((box, index) => ({
      selector: MARKERS[index].selector,
      dy: Math.abs(box.y - before[index].y),
      dh: Math.abs(box.height - before[index].height)
    }))
    .filter((entry) => entry.dy > 1 || entry.dh > 1);
  if (drift.length > 0) {
    throw new Error(`The panel moved while it was captured: ${JSON.stringify(drift)}`);
  }
  if (boxes.at(-1).y + boxes.at(-1).height > panelBox.height + 1) {
    throw new Error("The last marker falls outside the captured panel");
  }

  // (b) A waiting offer: add one Studio field, point at it, let the model propose.
  await evaluate(call, `document.querySelector("#builder-field-type").value = "text-short"`);
  await click(call, "#builder-add-field");
  await waitFor(call, `document.querySelectorAll(".builder-field-row").length === 1`, "the first Studio field");
  await hover(call, ".builder-field-row");
  // The demo control sits in the Role section's detail disclosure; the tour
  // opens it the way a reader would, after the resting shot was taken.
  await evaluate(call, `document.querySelector("#work-mode-detail").open = true`);
  await waitFor(
    call,
    `document.querySelector("#demo-offer").textContent === "Model suggests a field"`,
    "the panel lens to reach the Studio canvas"
  );
  await click(call, "#demo-offer");
  await waitFor(call, `document.querySelectorAll("#offer-list .offer-chip").length === 1`, "the offer chip");
  captured.push(await shootElement(call, ".cowork-panel", "panel-offer.png"));
  const offerText = await evaluate(call, `document.querySelector("#offer-list .offer-chip").textContent.trim()`);

  // (c) After handing the job over while watching: the model holds the click right.
  await hover(call, ".builder-field-row");
  await click(call, "#hand-over");
  await waitFor(
    call,
    `document.querySelector(".cowork-panel").dataset.modelState.startsWith("here-executing")`,
    "the model to take the click right"
  );
  captured.push(await shootElement(call, ".cowork-panel", "panel-handover.png"));
  const handoverMode = await evaluate(call, `document.querySelector("#mode-badge").textContent`);

  // The annotated composite, rendered by the same browser.
  const panelPng = await readFile(path.join(OUT, "panel-initial.png"));
  const svg = buildOverlaySvg({
    panel: { width: panelBox.width, height: panelBox.height },
    boxes,
    pngBase64: panelPng.toString("base64")
  });
  await writeFile(path.join(OUT, "panel-annotated.svg"), svg, "utf8");
  await call("Page.navigate", { url: `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}` });
  await waitFor(call, `document.querySelector("svg") !== null`, "the overlay to render");
  const overlay = await shootElement(call, "svg", "panel-annotated.png");

  // The Desktop Companion, if a host is listening.
  let companion = null;
  try {
    const probe = await fetch(COMPANION_URL, { signal: AbortSignal.timeout(3000) });
    if (!probe.ok) throw new Error(`HTTP ${probe.status}`);
    await call("Emulation.setDeviceMetricsOverride", { width: 980, height: 900, deviceScaleFactor: 1, mobile: false });
    await call("Page.navigate", { url: COMPANION_URL });
    await waitFor(call, `document.readyState === "complete" && document.body.children.length > 0`, "the companion UI");
    await new Promise((resolve) => setTimeout(resolve, 600));
    companion = (await shootElement(call, "body", "companion-ui.png")).filename;
  } catch (error) {
    process.stderr.write(`warning: Desktop Companion not captured (${error.message}): ${COMPANION_URL}\n`);
  }

  console.log(JSON.stringify({
    browser: version.Browser,
    source: SHOWCASE_URL,
    restingMode,
    offerText,
    handoverMode,
    files: [...captured.map((entry) => entry.filename), overlay.filename, companion].filter(Boolean),
    overlaySize: { width: overlay.clip.width, height: overlay.clip.height }
  }, null, 2));
  socket.close();
} finally {
  browser?.kill();
  await removeTempProfile(profilePath);
}
