import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateCockpitBrowserObservation
} from "../../../scripts/browser-companion-cockpit-smoke-lib.mjs";

const smokePath = new URL("../../../scripts/browser-companion-cockpit-smoke.mjs", import.meta.url);
const packagePath = new URL("../../../package.json", import.meta.url);

function validState(overrides = {}) {
  return {
    viewport: { width: 390, height: 844 },
    documentHorizontalOverflow: 0,
    horizontallyClippedControls: [],
    unnamedControls: [],
    visibleControlCount: 8,
    humanState: "here-advising",
    modelState: "here-executing",
    relayState: "live",
    route: "bridge",
    executionMode: "structured",
    computerUseIndicatorVisible: false,
    modeLabel: "Sparring · model executes",
    humanLabel: "You are advising",
    modelLabel: "Model is executing",
    humanBadge: "◉",
    modelBadge: "✓",
    ...overrides
  };
}

test("cockpit browser evidence requires four truthful visual states in a narrow viewport", () => {
  const report = validateCockpitBrowserObservation({
    browser: "Chrome/152",
    screenshots: ["sparring-model.png", "model-solo.png", "sparring-human.png", "human-solo.png"],
    focusLabel: "Selected: Registration title",
    contextLevel: "1",
    keyboardOrder: [
      "human-control",
      "model-control",
      "focus-action",
      "context-gauge",
      "offer-action",
      "voice-action",
      "handoff-action",
      "context-action",
      "toggle"
    ],
    responsiveSamples: [
      { viewport: { width: 320, height: 640 }, documentHorizontalOverflow: 0, horizontallyClippedControls: [] },
      { viewport: { width: 390, height: 844 }, documentHorizontalOverflow: 0, horizontallyClippedControls: [] },
      { viewport: { width: 480, height: 900 }, documentHorizontalOverflow: 0, horizontallyClippedControls: [] }
    ],
    states: [
      validState(),
      validState({ humanState: "away", relayState: "to-model", modeLabel: "Model works alone", humanLabel: "You are away", humanBadge: "↗" }),
      validState({ humanState: "here-executing", modelState: "here-advising", relayState: "watching", modeLabel: "Sparring · you execute", humanLabel: "You are executing", humanBadge: "●", modelLabel: "Model is advising", modelBadge: "◉" }),
      validState({ humanState: "here-executing", modelState: "standby", relayState: "dormant", modeLabel: "You work alone", humanLabel: "You are executing", humanBadge: "●", modelLabel: "Model on standby", modelBadge: "Ⅱ" })
    ]
  });

  assert.equal(report.cockpitVisualClaim, true);
  assert.equal(report.narrowViewportClaim, true);
  assert.equal(report.colorOnlyStatusClaim, false);
  assert.equal(report.states.length, 4);
});

test("cockpit browser evidence fails closed on overflow, clipping or missing labels", () => {
  for (const broken of [
    validState({ documentHorizontalOverflow: 2 }),
    validState({ horizontallyClippedControls: ["model-control"] }),
    validState({ unnamedControls: ["BUTTON"] }),
    validState({ computerUseIndicatorVisible: true })
  ]) {
    assert.throws(
      () => validateCockpitBrowserObservation({
        browser: "Chrome/152",
        screenshots: ["a.png", "b.png", "c.png", "d.png"],
        states: [validState(), validState({ humanState: "away", relayState: "to-model", modeLabel: "Model works alone" }), validState({ humanState: "here-executing", modelState: "here-advising", relayState: "watching", modeLabel: "Sparring · you execute" }), broken]
      }),
      /cockpit/i
    );
  }
});

test("the dedicated smoke renders the shipped Side Panel through a stubbed runtime", async () => {
  const smoke = await readFile(smokePath, "utf8");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));

  assert.match(smoke, /dist-browser-companion\/sidepanel\.html/);
  assert.match(smoke, /Page\.addScriptToEvaluateOnNewDocument/);
  assert.match(smoke, /Emulation\.setDeviceMetricsOverride/);
  assert.match(smoke, /Page\.captureScreenshot/);
  assert.equal(
    packageJson.scripts["smoke:companion-cockpit"],
    "node scripts/browser-companion-cockpit-smoke.mjs"
  );
});
