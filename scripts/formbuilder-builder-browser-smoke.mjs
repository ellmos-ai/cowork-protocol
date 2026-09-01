// Chrome acceptance for FormBuilder Studio (Build/Fill/Export): proves the
// standalone Builder core actually works end to end in a real browser, and
// that its one Cowork integration point (Model suggestions) is click-gated
// exactly like the rest of the protocol. See apps/formbuilder-showcase/INTEGRATION.md.
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

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
      "--window-size=1280,1400",
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
  await new Promise((resolve) => setTimeout(resolve, 800));

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

  // --- GAP-00: one addressable builder field, not just the whole canvas. ---
  await evaluateValue(call, `document.querySelector("#builder-field-type").value = "text-short"`);
  await dispatchTrustedClick(call, "#builder-add-field");
  const rows = await evaluateValue(call, `[...document.querySelectorAll(".builder-field-row")].map((row) => row.dataset.fieldId)`);
  requireCondition(rows.length === 2, `Expected two field rows, got ${rows.length}`);
  const [firstFieldId] = rows;

  const firstRowPoint = await evaluateValue(call, `(() => {
    const row = document.querySelector('.builder-field-row[data-field-id="${firstFieldId}"]');
    const rect = row.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  await call("Input.dispatchMouseEvent", { type: "mouseMoved", x: firstRowPoint.x, y: firstRowPoint.y });
  const focusLabel = await evaluateValue(call, `document.querySelector("#builder-focus-label").textContent`);
  requireCondition(
    focusLabel.startsWith("Pointing at:"),
    `Expected pointing at the first field to update the focus label, got: ${focusLabel}`
  );
  const firstRowIsFocused = await evaluateValue(
    call,
    `document.querySelector('.builder-field-row[data-field-id="${firstFieldId}"]').classList.contains("is-focused")`
  );
  requireCondition(firstRowIsFocused, "Expected the pointed-at row to carry the shared .is-focused style");

  // The offer must target the *pointed-at* field, not merely the last one
  // added: apply it and confirm the first field (not the second) changed.
  await dispatchTrustedClick(call, "#builder-suggest-rename");
  await dispatchTrustedClick(call, "#builder-offer-list .offer-chip");
  const firstFieldRequired = await evaluateValue(call, `(() => {
    const checkbox = document.querySelector('.builder-field-row[data-field-id="${firstFieldId}"] input[type=checkbox]');
    return checkbox ? checkbox.checked : null;
  })()`);
  requireCondition(
    firstFieldRequired === true,
    `Expected the rename/require suggestion to target the pointed-at first field, got required=${firstFieldRequired}`
  );

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

  // --- Cowork integration: a model suggestion is inert until a real click. ---
  await dispatchTrustedClick(call, "#builder-tab-build");
  await dispatchTrustedClick(call, "#builder-suggest-add");
  const offerChipsBeforeClick = await evaluateValue(call, `document.querySelectorAll("#builder-offer-list .offer-chip").length`);
  requireCondition(offerChipsBeforeClick === 1, `Expected exactly one pending offer chip, got ${offerChipsBeforeClick}`);
  const fieldCountBeforeClick = await evaluateValue(call, `document.querySelectorAll(".builder-field-row").length`);
  requireCondition(fieldCountBeforeClick === 2, "The canvas must be unchanged before the offer is clicked");

  await dispatchTrustedClick(call, "#builder-offer-list .offer-chip");
  const fieldCountAfterClick = await evaluateValue(call, `document.querySelectorAll(".builder-field-row").length`);
  requireCondition(fieldCountAfterClick === 3, `Expected the click to add exactly one field, got ${fieldCountAfterClick}`);
  const receiptCount = await evaluateValue(call, `document.querySelectorAll("#builder-receipt-list li").length`);
  requireCondition(receiptCount === 2, `Expected two verified receipts (the earlier rename plus this add), got ${receiptCount}`);
  const receiptText = await evaluateValue(call, `document.querySelector("#builder-receipt-list li").textContent`);
  requireCondition(receiptText.startsWith("Verified"), `Expected the latest receipt to be verified, got: ${receiptText}`);

  const offerChipsAfterClick = await evaluateValue(call, `document.querySelectorAll("#builder-offer-list .offer-chip").length`);
  requireCondition(offerChipsAfterClick === 0, "The applied offer must be resolved (removed), not still clickable");

  // --- GAP-01/GAP-04: a presence-independent, container-scoped delegation
  // that drafts several new fields in one grant - the old fixed two-call
  // AFK-only lease could not do this at all. ---
  const fieldsBeforeDelegation = await evaluateValue(call, `document.querySelectorAll(".builder-field-row").length`);
  await evaluateValue(call, `document.querySelector("#builder-delegate-max-calls").value = 3`);
  await dispatchTrustedClick(call, "#builder-start-delegation");
  const soloBatchHidden = await evaluateValue(call, `document.querySelector("#builder-solo-batch").hidden`);
  requireCondition(soloBatchHidden === false, "Expected the solo-draft controls to appear once delegated");

  await dispatchTrustedClick(call, "#builder-solo-batch");
  await new Promise((resolve) => setTimeout(resolve, 2200)); // 3 steps at ~350ms apart, plus margin
  const fieldsAfterBatch = await evaluateValue(call, `document.querySelectorAll(".builder-field-row").length`);
  requireCondition(
    fieldsAfterBatch === fieldsBeforeDelegation + 3,
    `Expected the solo batch to add exactly 3 fields under one grant, got ${fieldsBeforeDelegation} -> ${fieldsAfterBatch}`
  );

  // --- GAP-03: a bounded return narration plus a multi-field highlight. ---
  await dispatchTrustedClick(call, "#builder-end-delegation");
  const narrationText = await evaluateValue(call, `document.querySelector("#builder-return-narration").textContent`);
  requireCondition(
    narrationText.includes("3 fields added"),
    `Expected the return narration to name the 3 added fields, got: ${narrationText}`
  );
  const highlightedCount = await evaluateValue(call, `document.querySelectorAll(".is-new-since-handover").length`);
  requireCondition(highlightedCount === 3, `Expected exactly 3 fields highlighted as new, got ${highlightedCount}`);
  const returnFeedbackVisible = await evaluateValue(call, `document.querySelector("#builder-return-feedback").hidden === false`);
  requireCondition(returnFeedbackVisible, "Expected the return moment to wait for a feedback verdict (GAP-05)");

  await dispatchTrustedClick(call, '#builder-return-feedback button[data-verdict="accepted"]');
  const returnFeedbackResolved = await evaluateValue(call, `document.querySelector("#builder-return-feedback").hidden === true`);
  requireCondition(returnFeedbackResolved, "Expected a real feedback click to resolve the awaiting-feedback state");

  // --- GAP-02: a recognized human utterance on the pointed-at field
  // authorizes directly - no offer chip, no second click. ---
  const targetFieldId = await evaluateValue(call, `document.querySelector(".builder-field-row").dataset.fieldId`);
  const targetPoint = await evaluateValue(call, `(() => {
    const row = document.querySelector('.builder-field-row[data-field-id="${targetFieldId}"]');
    const rect = row.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  await call("Input.dispatchMouseEvent", { type: "mouseMoved", x: targetPoint.x, y: targetPoint.y });
  await evaluateValue(call, `document.querySelector("#builder-directive-input").value = "make it required"`);
  await dispatchTrustedClick(call, "#builder-directive-send");
  const directiveRequired = await evaluateValue(
    call,
    `document.querySelector('.builder-field-row[data-field-id="${targetFieldId}"] input[type=checkbox]').checked`
  );
  requireCondition(directiveRequired, "Expected the spoken directive to apply with no offer and no second click");
  const noOfferForDirective = await evaluateValue(call, `document.querySelectorAll("#builder-offer-list .offer-chip").length`);
  requireCondition(noOfferForDirective === 0, "A directive must not create a clickable offer chip - the words are the click");
  const awaitingFeedbackAfterDirective = await evaluateValue(call, `document.querySelector("#builder-return-feedback").hidden === false`);
  requireCondition(awaitingFeedbackAfterDirective, "Expected the directive to also move the session into awaiting-feedback (GAP-05)");
  await dispatchTrustedClick(call, '#builder-return-feedback button[data-verdict="accepted"]');

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
  await rm(profilePath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
