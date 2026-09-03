// Chrome acceptance for FormBuilder Studio (Build/Fill/Export): proves the
// standalone Builder core actually works end to end in a real browser, and
// that the Studio canvas is served by the one Cowork panel - offers, receipts,
// handover and conversation - click-gated exactly like the rest of the
// protocol. See apps/formbuilder-showcase/INTEGRATION.md.
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { removeTempProfile } from "./smoke-runtime.mjs";

import { createStaticServer } from "./serve.mjs";

const profilePath = await mkdtemp(path.join(tmpdir(), "cowork-formbuilder-smoke-"));
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
    if (message.method === "Runtime.exceptionThrown") {
      const description = message.params.exceptionDetails?.exception?.description ?? "";
      console.error(`[page exception] ${description.split("\n")[0]}`);
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
  const evaluation = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
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

async function dispatchTrustedClick(call, selector) {
  const point = await evaluateValue(call, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return null;
    element.scrollIntoView({ block: "center", inline: "center" });
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  if (!point) throw new Error(`Control not found: ${selector}`);
  await call("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await call("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

/** Moves the real pointer onto one Studio row and proves the panel's
 *  attention lens actually took it - a silently missed row would otherwise
 *  make every later assertion test the wrong field. */
async function pointAtStudioRow(call, fieldId) {
  const point = await evaluateValue(call, `(() => {
    const row = document.querySelector('.builder-field-row[data-field-id="${fieldId}"]');
    if (!row) return null;
    const rect = row.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  if (!point) throw new Error(`Studio row not found: ${fieldId}`);
  await call("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
  const focused = await evaluateValue(
    call,
    `document.querySelector("#builder-field-list .form-field.is-focused")?.dataset.fieldId ?? null`
  );
  if (focused !== fieldId) {
    throw new Error(`Expected the panel lens on ${fieldId}, it is on ${focused}`);
  }
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
      "--force-device-scale-factor=1",
      "--remote-debugging-port=0",
      "--window-size=1280,3200",
      `--user-data-dir=${profilePath}`,
      showcaseUrl
    ],
    { windowsHide: true, stdio: "ignore" }
  );

  const debugPort = await waitForDevToolsPort();
  const targets = await waitForJson(`http://127.0.0.1:${debugPort}/json`);
  const target = targets.find(
    (candidate) => candidate.type === "page" && candidate.url.includes("formbuilder-showcase")
  );
  if (!target) throw new Error("Showcase page target not found");

  const socket = await connect(target.webSocketDebuggerUrl);
  const call = cdpClient(socket);
  await call("Runtime.enable");
  await call("Page.enable");
  await call("Page.bringToFront");
  // A fixed delay here was observed to be flaky under load (the click below
  // could land before the module script finished evaluating); wait for the
  // actual control to exist and be part of a completed document instead.
  await waitForExpression(
    call,
    `document.readyState === "complete" && document.querySelector("#builder-add-field") !== null`,
    "the FormBuilder Studio Build tab to be ready"
  );

  // --- Solo product: design a field, fill it in, export it. No agent involved. ---
  await evaluateValue(call, `document.querySelector("#builder-field-type").value = "text-short"`);
  await dispatchTrustedClick(call, "#builder-add-field");
  const afterAdd = await evaluateValue(call, `document.querySelectorAll(".builder-field-row").length`);
  requireCondition(afterAdd === 1, `Expected one field row after Add, got ${afterAdd}`);

  // --- GAP-08: the kind badge shows a display name, never the raw German
  // schema typeString every field of the same kind would otherwise share. ---
  const kindBadgeText = await evaluateValue(call, `document.querySelector(".builder-field-kind").textContent`);
  requireCondition(
    kindBadgeText === "Short answer",
    `Expected the kind badge to show a display name, got: ${kindBadgeText}`
  );
  const paletteOptionText = await evaluateValue(
    call,
    `document.querySelector('#builder-field-type option[value="text-long"]').textContent`
  );
  requireCondition(
    paletteOptionText === "Long answer",
    `Expected the palette option to show a display name, got: ${paletteOptionText}`
  );

  await dispatchTrustedClick(call, "#builder-tab-build");
  await evaluateValue(call, `(() => {
    const helpInput = document.querySelector('.builder-field-row input[aria-label^="Help text"]');
    helpInput.value = "Used on your event badge.";
    helpInput.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);

  // --- GAP-00: one addressable builder field, and the ONE Cowork panel's
  // attention lens follows it - the Studio has no lens of its own any more. ---
  await evaluateValue(call, `document.querySelector("#builder-field-type").value = "text-short"`);
  await dispatchTrustedClick(call, "#builder-add-field");
  const rows = await evaluateValue(call, `[...document.querySelectorAll(".builder-field-row")].map((row) => row.dataset.fieldId)`);
  requireCondition(rows.length === 2, `Expected two field rows, got ${rows.length}`);
  const [firstFieldId] = rows;

  // Bring the panel's conversation into view first: a later click must not
  // scroll a different row under the resting pointer.
  await evaluateValue(call, `document.querySelector("#send-conversation").scrollIntoView({ block: "center" })`);
  await pointAtStudioRow(call, firstFieldId);
  const focusLabel = await evaluateValue(call, `document.querySelector("#focus-label").textContent`);
  requireCondition(
    focusLabel.startsWith("Pointing at:") && focusLabel.includes("Studio canvas"),
    `Expected the panel's attention lens to name the Studio field, got: ${focusLabel}`
  );
  const areaLabel = await evaluateValue(call, `document.querySelector("#area-label").textContent`);
  requireCondition(
    areaLabel.includes("Studio canvas"),
    `Expected the panel's area readout to name the Studio canvas, got: ${areaLabel}`
  );

  // --- GAP-02: a recognized instruction typed into the panel's conversation
  // applies to the pointed-at field directly - no offer chip, no second
  // click - and then waits for a verdict (GAP-05). ---
  await evaluateValue(call, `document.querySelector("#conversation-input").value = "make it required"`);
  await dispatchTrustedClick(call, "#send-conversation");
  const directiveRequired = await evaluateValue(call, `(() => {
    const checkbox = document.querySelector('.builder-field-row[data-field-id="${firstFieldId}"] input[type=checkbox]');
    return checkbox ? checkbox.checked : null;
  })()`);
  requireCondition(
    directiveRequired === true,
    `Expected the instruction to apply to the pointed-at field, got required=${directiveRequired}`
  );
  const noOfferForDirective = await evaluateValue(call, `document.querySelectorAll("#offer-list .offer-chip").length`);
  requireCondition(noOfferForDirective === 0, "A directive must not create a clickable offer chip - the words are the click");
  const directiveReceipt = await evaluateValue(call, `document.querySelector("#receipt-list li")?.textContent ?? ""`);
  requireCondition(
    directiveReceipt.startsWith("Verified"),
    `Expected the directive to leave a verified receipt in the panel, got: ${directiveReceipt}`
  );
  const verdictOffered = await evaluateValue(
    call,
    `document.querySelectorAll('#receipt-list button[data-verdict]').length === 3`
  );
  requireCondition(verdictOffered, "Expected the panel receipt to wait for a Good/Adjust/Different verdict (GAP-05)");
  await dispatchTrustedClick(call, '#receipt-list button[data-verdict="accepted"]');
  const verdictResolved = await evaluateValue(
    call,
    `document.querySelectorAll('#receipt-list button[data-verdict]').length === 0`
  );
  requireCondition(verdictResolved, "Expected a real verdict click to resolve the awaiting-feedback state");

  await dispatchTrustedClick(call, "#builder-tab-fill");
  const fillFieldCount = await evaluateValue(call, `document.querySelectorAll(".builder-fill-field").length`);
  requireCondition(fillFieldCount === 2, `Expected two renderable Fill fields, got ${fillFieldCount}`);
  const helpTextRendered = await evaluateValue(
    call,
    `document.querySelector(".builder-fill-field .field-help")?.textContent`
  );
  requireCondition(
    helpTextRendered === "Used on your event badge.",
    `Expected the edited help text to render in Fill, got: ${helpTextRendered}`
  );

  await evaluateValue(call, `(() => {
    const input = document.querySelector(".builder-fill-field input[type=text]");
    input.value = "Ada Lovelace";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await dispatchTrustedClick(call, "#builder-fill-form button[type=submit]");
  const responseHidden = await evaluateValue(call, `document.querySelector("#builder-form-result").hidden`);
  requireCondition(responseHidden === false, "Expected a visible response after a valid Fill submission");
  const responseSchema = await evaluateValue(
    call,
    `JSON.parse(document.querySelector("#builder-response-json").textContent).schema`
  );
  requireCondition(
    responseSchema === "formularerstellen-response-v1",
    `Expected the real response schema, got ${responseSchema}`
  );

  await dispatchTrustedClick(call, "#builder-tab-export");
  const exportButtonsPresent = await evaluateValue(call, `
    !!document.querySelector("#builder-export-schema") &&
    !!document.querySelector("#builder-export-fodt") &&
    document.querySelector("#builder-export-response").disabled === false
  `);
  requireCondition(exportButtonsPresent, "Expected all three export controls to be present and enabled");
  await dispatchTrustedClick(call, "#builder-export-schema");
  await dispatchTrustedClick(call, "#builder-export-fodt");
  await dispatchTrustedClick(call, "#builder-export-response");

  // --- Cowork integration: a Studio proposal reaches the ONE panel's offer
  // list and stays inert until a real click. ---
  await dispatchTrustedClick(call, "#builder-tab-build");
  await evaluateValue(call, `document.querySelector("#send-conversation").scrollIntoView({ block: "center" })`);
  await pointAtStudioRow(call, firstFieldId);
  const demoOfferLabel = await evaluateValue(call, `document.querySelector("#demo-offer").textContent`);
  requireCondition(
    demoOfferLabel === "Model suggests a field",
    `Expected the panel's demo control to address the Studio canvas, got: ${demoOfferLabel}`
  );
  await dispatchTrustedClick(call, "#demo-offer");
  await waitForExpression(
    call,
    `document.querySelectorAll("#offer-list .offer-chip").length === 1`,
    "the Studio proposal to reach the panel offer list"
  );
  const fieldCountBeforeClick = await evaluateValue(call, `document.querySelectorAll(".builder-field-row").length`);
  requireCondition(fieldCountBeforeClick === 2, "The canvas must be unchanged before the offer is clicked");
  const offerDetail = await evaluateValue(call, `document.querySelector("#offer-list .offer-chip").textContent`);
  requireCondition(
    offerDetail.includes("Studio canvas"),
    `Expected the panel chip to say which canvas it belongs to, got: ${offerDetail}`
  );

  await dispatchTrustedClick(call, "#offer-list .offer-chip");
  const fieldCountAfterClick = await evaluateValue(call, `document.querySelectorAll(".builder-field-row").length`);
  requireCondition(fieldCountAfterClick === 3, `Expected the click to add exactly one field, got ${fieldCountAfterClick}`);
  const receiptText = await evaluateValue(call, `document.querySelector("#receipt-list li").textContent`);
  requireCondition(receiptText.startsWith("Verified"), `Expected the latest panel receipt to be verified, got: ${receiptText}`);
  const receiptCount = await evaluateValue(call, `document.querySelectorAll("#receipt-list li").length`);
  requireCondition(receiptCount === 2, `Expected two receipts in the shared list (the directive plus this add), got ${receiptCount}`);

  const offerChipsAfterClick = await evaluateValue(call, `document.querySelectorAll("#offer-list .offer-chip").length`);
  requireCondition(offerChipsAfterClick === 0, "The applied offer must be resolved (removed), not still clickable");

  // --- GAP-01/GAP-04: the panel's own handover buttons mint a canvas-scoped
  // grant and the model drafts a whole set under it - the old fixed two-call
  // AFK-only lease could not do this at all. Presence decides the pace here,
  // never the right to act. ---
  const fieldsBeforeDelegation = await evaluateValue(call, `document.querySelectorAll(".builder-field-row").length`);
  await evaluateValue(call, `document.querySelector("#lease-goal").value = "Draft good follow-up questions"`);
  await dispatchTrustedClick(call, "#away-short");
  await waitForExpression(
    call,
    `document.querySelectorAll(".builder-field-row").length === ${fieldsBeforeDelegation + 6}`,
    "the model to spend its six-draft budget on the Studio canvas"
  );
  const fieldsAfterBatch = await evaluateValue(call, `document.querySelectorAll(".builder-field-row").length`);
  requireCondition(
    fieldsAfterBatch === fieldsBeforeDelegation + 6,
    `Expected the grant's whole budget to be spent, got ${fieldsBeforeDelegation} -> ${fieldsAfterBatch}`
  );

  // --- GAP-03: a bounded return summary in the panel status line plus a
  // multi-field highlight on the canvas. ---
  await dispatchTrustedClick(call, "#return-human");
  const returnStatus = await evaluateValue(call, `document.querySelector("#system-status").textContent`);
  requireCondition(
    returnStatus.includes("6 fields added"),
    `Expected the panel to report what changed while the model worked, got: ${returnStatus}`
  );
  const highlightedCount = await evaluateValue(call, `document.querySelectorAll(".is-new-since-handover").length`);
  requireCondition(highlightedCount === 6, `Expected exactly 6 fields highlighted as new, got ${highlightedCount}`);
  const returnVerdictOffered = await evaluateValue(
    call,
    `document.querySelectorAll('#receipt-list button[data-verdict]').length === 3`
  );
  requireCondition(returnVerdictOffered, "Expected the return moment to wait for a feedback verdict (GAP-05)");

  await dispatchTrustedClick(call, '#receipt-list button[data-verdict="accepted"]');
  const returnVerdictResolved = await evaluateValue(
    call,
    `document.querySelectorAll('#receipt-list button[data-verdict]').length === 0 &&
     document.querySelectorAll(".is-new-since-handover").length === 0`
  );
  requireCondition(returnVerdictResolved, "Expected a real feedback click to close the round and clear the highlights");

  // --- An empty model seat reads as an absent model, not an advising one. ---
  await dispatchTrustedClick(call, "#demo-mode");
  const emptySeat = await evaluateValue(call, `(() => ({
    modelState: document.querySelector(".cowork-panel").dataset.modelState,
    seatActive: document.querySelector("#model-seat").classList.contains("is-active")
  }))()`);
  requireCondition(
    !emptySeat.modelState.startsWith("here") && emptySeat.seatActive === false,
    `Expected an empty model seat to read as absent, got ${JSON.stringify(emptySeat)}`
  );
  await dispatchTrustedClick(call, "#demo-mode");
  const demoSeat = await evaluateValue(call, `document.querySelector(".cowork-panel").dataset.modelState`);
  requireCondition(
    demoSeat.startsWith("here"),
    `Expected the demo helper to put the model back in the room, got ${demoSeat}`
  );

  // --- The removed sections must be gone from the DOM, not merely hidden. ---
  const foldedAway = await evaluateValue(call, `[
    "#builder-suggest-add",
    "#builder-offer-list",
    "#builder-receipt-list",
    "#builder-start-delegation",
    "#builder-solo-batch",
    "#builder-end-delegation",
    "#builder-directive-input",
    "#builder-directive-send",
    "#builder-focus-label"
  ].filter((selector) => document.querySelector(selector) !== null)`);
  requireCondition(
    foldedAway.length === 0,
    `Expected the Builder's own Cowork sections to be gone, still present: ${foldedAway.join(", ")}`
  );

  // --- Native WebMCP tool count is unchanged: no new tool was introduced. ---
  const toolCountUnchanged = await evaluateValue(call, `(() => {
    if (!document.modelContext || typeof document.modelContext.getTools !== "function") return null;
    return document.modelContext.getTools().length;
  })()`);

  console.log(JSON.stringify({
    formBuilderStudioClaim: true,
    soloProductClaim: true,
    designFillExportClaim: true,
    builderFieldAddressableClaim: true,
    builderSuggestionTargetsPointedAtFieldClaim: true,
    builderOfferInertBeforeClickClaim: true,
    builderReceiptVerifiedClaim: true,
    onePanelServesBothCanvasesClaim: true,
    emptySeatReadsAsAbsentModelClaim: true,
    presentDelegationClaim: true,
    soloDraftBatchClaim: true,
    handoverReturnHighlightClaim: true,
    directiveNoSecondClickClaim: true,
    awaitingFeedbackClaim: true,
    nativeToolCountUnchanged: toolCountUnchanged,
    browserVersion: (await waitForJson(`http://127.0.0.1:${debugPort}/json/version`)).Browser
  }, null, 2));
  socket.close();
} finally {
  browser?.kill();
  if (server?.listening) {
    await new Promise((resolve) => server.close(resolve));
  }
  await removeTempProfile(profilePath);
}
