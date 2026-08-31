import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const htmlPath = new URL("../ui/index.html", import.meta.url);
const cssPath = new URL("../ui/styles.css", import.meta.url);
const appPath = new URL("../ui/app.js", import.meta.url);

test("the movable Companion exposes the shared actor and relay cockpit", async () => {
  const html = await readFile(htmlPath, "utf8");

  assert.match(html, /class="companion-cockpit"/);
  assert.match(html, /id="human-control"[\s\S]*aria-label="Change your presence"/);
  assert.match(html, /id="relay-core"[\s\S]*role="status"/);
  assert.match(html, /id="model-control"[\s\S]*aria-label="Change model engagement"/);
  assert.match(html, /class="human-figure"/);
  assert.match(html, /class="model-figure"/);
  assert.match(html, /id="model-identity"/);
  assert.match(html, /id="execution-control"[\s\S]*aria-pressed="false"/);
  assert.match(html, /id="computer-use-indicator"[\s\S]*aria-hidden="true"/);
});

test("the Companion offers a persistent accessible cockpit background picker", async () => {
  const [html, app] = await Promise.all([
    readFile(htmlPath, "utf8"),
    readFile(appPath, "utf8")
  ]);

  assert.match(html, /id="appearance-toggle"[\s\S]*aria-controls="appearance-panel"/);
  assert.match(html, /id="appearance-panel"[\s\S]*hidden/);
  assert.match(html, /data-cockpit-color="#[0-9a-fA-F]{6}"/);
  assert.match(html, /id="custom-cockpit-color"[\s\S]*type="color"/);
  assert.match(app, /cowork\.companion\.cockpit-background\.v1/);
  assert.match(app, /localStorage\.getItem/);
  assert.match(app, /localStorage\.setItem/);
  assert.match(app, /--cockpit-background/);
});

test("the Companion derives its actor language from the shared presentation", async () => {
  const app = await readFile(appPath, "utf8");

  assert.match(app, /buildCollaborationPresentation/);
  assert.match(app, /cockpit\.dataset\.humanState/);
  assert.match(app, /cockpit\.dataset\.modelState/);
  assert.match(app, /cockpit\.dataset\.relayState/);
  assert.match(app, /function cycleHumanPresence/);
  assert.match(app, /function cycleModelEngagement/);
  assert.match(app, /#human-control/);
  assert.match(app, /#model-control/);
  assert.match(app, /cockpit\.dataset\.executionMode/);
  assert.match(app, /#execution-control/);
});

test("actor states use pose, symbols and reduced-motion fallbacks in addition to aura", async () => {
  const css = await readFile(cssPath, "utf8");

  assert.match(css, /\[data-human-state="afk-short"\]/);
  assert.match(css, /\[data-human-state="afk-long"\]/);
  assert.match(css, /\[data-model-state="observing"\]/);
  assert.match(css, /\[data-model-state="paused"\]/);
  assert.match(css, /\[data-relay-state="live"\]/);
  assert.match(css, /\[data-relay-state="to-model"\]/);
  assert.match(css, /\[data-relay-state="watching"\]/);
  assert.match(css, /\[data-execution-mode="computer-use"\][\s\S]*\.model-pointer/);
  assert.match(css, /\[data-execution-mode="structured"\][\s\S]*\.computer-use-indicator/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
