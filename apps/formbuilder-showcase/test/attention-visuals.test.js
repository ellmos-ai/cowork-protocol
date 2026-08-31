import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const htmlPath = new URL("../index.html", import.meta.url);
const appPath = new URL("../src/app.js", import.meta.url);
const cssPath = new URL("../styles.css", import.meta.url);

test("Follow me is the default adaptive attention label with explicit alternatives", async () => {
  const html = await readFile(htmlPath, "utf8");

  assert.match(html, /option value="pointer">Follow me/);
  assert.match(html, /option value="pinned">Click focus/);
  assert.match(html, /option value="selection">Text marker only/);
  assert.match(html, /option value="off">Off/);
});

test("Follow me accepts pointer, keyboard focus, click and text selection", async () => {
  const app = await readFile(appPath, "utf8");

  assert.match(app, /session\.attentionMode === "pointer"[\s\S]*setFocus\(field\)/);
  assert.match(app, /\["pointer", "selection"\]\.includes\(session\.attentionMode\)/);
  assert.match(app, /\["pointer", "pinned"\]\.includes\(session\.attentionMode\)/);
  assert.match(
    app,
    /\["pointer", "selection"\]\.includes\(attentionMode\)[\s\S]*selectedTextFor\(control\)[\s\S]*:\s*""/
  );
});

test("the model target has labeled focus and working visuals without motion dependence", async () => {
  const [app, css] = await Promise.all([
    readFile(appPath, "utf8"),
    readFile(cssPath, "utf8")
  ]);

  assert.match(app, /is-model-working/);
  assert.match(css, /\.form-field\.is-focused::before[\s\S]*Model focus/);
  assert.match(css, /\.form-field\.is-model-working::before[\s\S]*Model working/);
  assert.match(css, /@keyframes model-working-glimmer/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*is-model-working/);
});
