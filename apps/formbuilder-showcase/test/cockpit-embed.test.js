import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const htmlPath = new URL("../index.html", import.meta.url);
const cssPath = new URL("../styles.css", import.meta.url);
const appPath = new URL("../src/app.js", import.meta.url);
const viewModelPath = new URL("../src/view-model.js", import.meta.url);

test("FormBuilder embeds the same clickable human/model/relay cockpit", async () => {
  const html = await readFile(htmlPath, "utf8");

  assert.match(html, /class="embedded-collaboration-deck"/);
  assert.match(html, /id="human-seat"[^>]*aria-label="Change your status"/);
  assert.match(html, /id="embedded-relay-core"[^>]*role="status"/);
  assert.match(html, /id="model-seat"[^>]*aria-label="Change what the model does"/);
  assert.match(html, /class="seat-icon human-seat"[^>]*aria-hidden="true"/);
  assert.match(html, /class="seat-icon model-seat"[^>]*aria-hidden="true"/);
});

test("the embedded cockpit uses the shared semantic presentation and real controls", async () => {
  const app = await readFile(appPath, "utf8");
  const viewModel = await readFile(viewModelPath, "utf8");

  assert.match(viewModel, /buildWorkModePresentation/);
  assert.match(app, /coworkPanel\.dataset\.humanState/);
  assert.match(app, /coworkPanel\.dataset\.modelState/);
  assert.match(app, /coworkPanel\.dataset\.relayState/);
  assert.match(app, /function cycleActorStatus/);
  assert.match(app, /cycleActorStatus\("model"\)/);
  assert.match(app, /cycleActorStatus\("human"\)/);
  assert.match(app, /#human-seat[^\n]*addEventListener/);
  assert.match(app, /#model-seat[^\n]*addEventListener/);
});

test("the embedded cockpit carries pose, aura and reduced-motion state selectors", async () => {
  const css = await readFile(cssPath, "utf8");

  assert.match(css, /\.embedded-collaboration-deck/);
  assert.match(css, /\[data-human-state="standby"\]/);
  assert.match(css, /\[data-human-state="away"\]/);
  assert.match(css, /\[data-model-state="here-advising"\]/);
  assert.match(css, /\[data-model-state="standby"\]/);
  assert.match(css, /\[data-model-state="away"\]/);
  assert.match(css, /\[data-relay-state="live"\]/);
  assert.match(css, /\[data-relay-state="to-model"\]/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("the panel's status strip and mode choices come from the shared vocabulary", async () => {
  const html = await readFile(htmlPath, "utf8");
  const app = await readFile(appPath, "utf8");

  // The four clarify steps and the six work-mode choices are rendered from
  // packages/reference-ui, so the surface holds no second copy of the wording.
  assert.match(html, /class="protocol-rhythm" id="status-steps"/);
  assert.match(html, /<select id="work-mode"><\/select>/);
  assert.doesNotMatch(html, /id="action-mode"/);
  assert.doesNotMatch(html, /Action rights/);
  assert.doesNotMatch(
    html,
    /id="allow-parallel"/,
    "doubling follows from disjoint areas, not from a switch"
  );
  // Staying or leaving changes who is present, never what the model may do:
  // both handover buttons mint the same one grant.
  assert.match(html, /id="hand-over"[^>]*type="button"/);
  assert.match(app, /function mintDemoLease/);
  assert.match(app, /function handOverWhileWatching/);
  assert.match(app, /STATUS_STEPS\.map/);
  assert.match(app, /workModeChoices\(/);
  assert.match(app, /statusForWorkModeChoice/);
});

test("with no model on it the page bridge shows the seat and nothing else", async () => {
  const html = await readFile(htmlPath, "utf8");
  const css = await readFile(cssPath, "utf8");
  const app = await readFile(appPath, "utf8");

  assert.match(html, /id="bridge-state"[\s\S]*role="status"/);
  assert.match(html, /id="bridge-message"/);
  assert.match(css, /\[data-bridge="resting"\] > :not\(\.panel-topline\)/);
  // The seat survives the fold: it is where a model arrives.
  assert.match(css, /:not\(\.panel-section\.model-seat\)/);
  assert.match(css, /\[data-bridge="arriving"\][\s\S]*bridge-cross/);
  // A connected Companion must not be folded by the bridge rule, or the
  // offer list and its receipts lose the click they still own.
  assert.doesNotMatch(css, /\[data-bridge\]:not\(\[data-bridge="crossing"\]\) >/);

  assert.match(app, /coworkPanel\.dataset\.bridge/);
  assert.match(app, /resolveBridgeState/);
  assert.match(app, /BRIDGE_COPY/);
  assert.match(app, /BRIDGE_ICON/);
  // Every one of the nine tools reports the crossing, wrapped in one place.
  assert.match(app, /reportAgentActivity\(coworkToolHandlers\)/);
  assert.doesNotMatch(app, /No model is crossing the bridge/);
});
