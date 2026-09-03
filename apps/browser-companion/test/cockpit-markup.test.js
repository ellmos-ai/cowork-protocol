import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const htmlPath = new URL("../sidepanel.html", import.meta.url);
const cssPath = new URL("../sidepanel.css", import.meta.url);
const smokePath = new URL("../../../scripts/browser-companion-smoke.mjs", import.meta.url);

test("the side panel exposes actors, relay, route, focus and command dock as one cockpit", async () => {
  const html = await readFile(htmlPath, "utf8");
  assert.match(html, /data-cowork-surface="cockpit"/);
  assert.match(html, /id="human-control"[\s\S]*aria-label="Change your status"/);
  assert.match(html, /id="model-control"[\s\S]*aria-label="Change what the model does"/);
  assert.match(html, /id="relay-core"[\s\S]*role="status"/);
  assert.match(html, /data-route="native"/);
  assert.match(html, /data-route="webmcp"/);
  assert.match(html, /data-route="bridge"/);
  assert.match(html, /id="focus-instrument"/);
  assert.match(html, /id="context-gauge"/);
  assert.match(html, /data-execution-mode="structured"/);
  assert.match(html, /id="computer-use-indicator"/);
  assert.match(html, />Computer use</);
  assert.match(html, /Higher token use/);
  assert.match(html, /class="command-dock"/);
  // The clarify strip is filled from packages/reference-ui, not written here.
  assert.match(html, /class="protocol-rhythm" id="status-steps"/);
  assert.doesNotMatch(html, /Point<\/span>/);
});

test("cockpit state is not encoded by color alone and motion can be removed", async () => {
  const css = await readFile(cssPath, "utf8");
  assert.match(css, /\[data-human-state="here-advising"\]/);
  assert.match(css, /\[data-human-state="standby"\]/);
  assert.match(css, /\[data-human-state="away"\]/);
  assert.match(css, /\[data-model-state="here-executing"\]/);
  assert.match(css, /\[data-model-state="here-advising"\]/);
  assert.match(css, /\[data-model-state="standby"\]/);
  assert.match(css, /\[data-model-state="away"\]/);
  assert.match(css, /\[data-relay-state="to-model"\]/);
  assert.match(css, /\[data-execution-mode="structured"\][\s\S]*\.computer-use-indicator/);
  assert.match(css, /\[data-execution-mode="computer-use"\][\s\S]*\.model-pointer/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /:focus-visible/);
});

test("the side panel reads its status words from the shared vocabulary", async () => {
  const script = await readFile(new URL("../sidepanel.js", import.meta.url), "utf8");
  assert.match(script, /STATUS_STEPS/);
  assert.match(script, /status-steps/);
  assert.match(script, /packages\/reference-ui\/src\/index\.js/);
  assert.match(script, /presentation\.modeDetail/);
  // Question two of the status bar is answered per partner, from the shared
  // vocabulary rather than from a string this panel writes.
  assert.match(script, /presentation\.humanArea/);
  assert.match(script, /presentation\.areaLabel/);
});

test("the visual acceptance captures a real narrow side-panel viewport", async () => {
  const smoke = await readFile(smokePath, "utf8");
  assert.match(
    smoke,
    /Emulation\.setDeviceMetricsOverride[\s\S]*width:\s*390[\s\S]*height:\s*844/
  );
});
