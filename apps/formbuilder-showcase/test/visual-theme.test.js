import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const cssPath = path.resolve(import.meta.dirname, "../styles.css");

function channel(value) {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const channels = hex.match(/[0-9a-f]{2}/gi).map((part) => channel(Number.parseInt(part, 16)));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function variable(css, name) {
  return css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"))?.[1];
}

test("the showcase uses the approved bright base with coral, teal and gold accents", async () => {
  const css = await readFile(cssPath, "utf8");

  assert.match(css, /color-scheme:\s*light/);
  assert.doesNotMatch(css, /color-scheme:\s*dark/);
  for (const name of [
    "canvas",
    "ink",
    "muted",
    "panel",
    "accent",
    "accent-ink",
    "blue",
    "gold",
    "gold-ink",
    "coral",
    "coral-ink",
    "teal"
  ]) {
    assert.match(variable(css, name) ?? "", /^#[0-9a-f]{6}$/i, `missing --${name}`);
  }
  assert.match(css, /background:[\s\S]*var\(--canvas\)/);
});

test("the bright theme's primary text and button pairs retain WCAG AA contrast", async () => {
  const css = await readFile(cssPath, "utf8");
  const pairs = [
    ["ink", "canvas"],
    ["muted", "canvas"],
    ["blue", "canvas"],
    ["accent-ink", "accent"],
    ["gold-ink", "gold"],
    ["coral-ink", "coral"]
  ];

  for (const [foreground, background] of pairs) {
    const ratio = contrast(variable(css, foreground), variable(css, background));
    assert.ok(ratio >= 4.5, `${foreground}/${background} contrast was ${ratio.toFixed(2)}`);
  }
});
