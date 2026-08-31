import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");

async function source(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), "utf8");
}

const surfaces = [
  "apps/formbuilder-showcase/index.html",
  "apps/browser-companion/sidepanel.html",
  "apps/desktop-companion/ui/index.html"
];

test("every Cowork surface uses the selected Dialogue and Relay identity", async () => {
  const mark = await source("packages/reference-ui/assets/cowork-dialogue-mark.svg");

  assert.match(mark, /Dialogue &amp; Relay Orbit Mark/);
  assert.match(mark, /#ff604a/i);
  assert.match(mark, /#16b5a8/i);
  assert.match(mark, /#e5be6b/i);

  for (const surface of surfaces) {
    const html = await source(surface);
    assert.match(html, /data-cowork-brand="dialogue-relay"/, surface);
    assert.match(html, /class="cowork-brand-mark"/, surface);
    assert.match(html, /cowork-dialogue-mark\.svg/, surface);
    assert.match(
      html,
      /class="protocol-rhythm"[\s\S]*Point[\s\S]*Offer[\s\S]*Click[\s\S]*Verify/,
      surface
    );
  }
});

test("FormBuilder reads as its own app while Cowork reads as an attached instrument", async () => {
  const html = await source("apps/formbuilder-showcase/index.html");
  const css = await source("apps/formbuilder-showcase/styles.css");

  assert.match(html, /data-product-brand="formbuilder-studio"/);
  assert.match(html, /class="formbuilder-brand"/);
  assert.match(html, /data-cowork-surface="embedded"/);
  assert.match(html, /aria-label="Detach Cowork panel"/);
  assert.match(html, /aria-label="Open Cowork Companion"/);
  assert.match(html, /styles\.css\?v=dialogue-relay-v2/);
  assert.match(html, /src\/app\.js\?v=dialogue-relay-v2/);
  assert.match(css, /--formbuilder-violet:\s*#[0-9a-f]{6}/i);
  assert.match(css, /--cowork-coral:\s*#ff604a/i);
  assert.match(css, /--cowork-teal:\s*#0a7a72/i);
  assert.match(css, /\.form-surface[\s\S]*var\(--formbuilder-violet\)/);
  assert.match(css, /\.cowork-panel[\s\S]*var\(--cowork-coral\)/);
});

test("surface controls pair compact icons with accessible names", async () => {
  for (const surface of surfaces) {
    const html = await source(surface);
    assert.match(html, /class="seat-icon human-seat"[^>]*aria-hidden="true"/, surface);
    assert.match(html, /class="seat-icon model-seat"[^>]*aria-hidden="true"/, surface);
  }
});
