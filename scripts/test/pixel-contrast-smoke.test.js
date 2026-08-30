import assert from "node:assert/strict";
import test from "node:test";

import {
  EXPECTED_PIXEL_CONTRAST_STATES,
  contrastRatio,
  parseCssColor,
  validatePixelContrastObservation
} from "../pixel-contrast-smoke-lib.mjs";

function validEntry(label = "body-copy") {
  return {
    label,
    foreground: "rgb(27, 33, 49)",
    backgroundColors: ["rgb(255, 253, 248)"],
    fontSize: "16px",
    fontWeight: "400"
  };
}

function validObservation() {
  return {
    auditMethod: "chrome-css-background-ranges",
    states: EXPECTED_PIXEL_CONTRAST_STATES.map((name) => ({
      name,
      markerPassed: true,
      visibleTextItems: 30,
      entries: Array.from({ length: 30 }, (_, index) =>
        validEntry(`${name}-text-${index + 1}`)
      ),
      unsupported: []
    }))
  };
}

test("CSS colors and alpha text are resolved before contrast is calculated", () => {
  assert.deepEqual(parseCssColor("rgb(27 33 49 / 75%)"), {
    red: 27,
    green: 33,
    blue: 49,
    alpha: 0.75
  });
  assert.equal(contrastRatio("rgba(0, 0, 0, 0.5)", "rgb(255, 255, 255)"), 3.976653024912438);
});

test("pixel contrast evidence requires every declared rendered state", () => {
  const observation = validObservation();
  const summary = validatePixelContrastObservation(observation);

  assert.deepEqual(summary, {
    pixelContrastClaim: true,
    auditMethod: "chrome-css-background-ranges",
    states: EXPECTED_PIXEL_CONTRAST_STATES.length,
    auditedTextItems: EXPECTED_PIXEL_CONTRAST_STATES.length * 30,
    unsupportedTextItems: 0,
    failingTextItems: 0,
    minimumContrast: 15.787276317932044
  });
});

test("pixel contrast evidence rejects a missing or unverified rendered state", () => {
  const observation = validObservation();
  observation.states = observation.states.filter((state) => state.name !== "agent-solo");
  observation.states[0].markerPassed = false;

  assert.throws(
    () => validatePixelContrastObservation(observation),
    /exactly the required rendered state matrix/
  );
});

test("pixel contrast evidence rejects unresolved backgrounds", () => {
  const observation = validObservation();
  observation.states[0].unsupported.push({ label: "gradient-copy", reason: "no background range" });

  assert.throws(
    () => validatePixelContrastObservation(observation),
    /Every visible text item must have a Chrome-resolved background range/
  );
});

test("pixel contrast evidence rejects unrounded WCAG AA failures", () => {
  const observation = validObservation();
  observation.states[0].entries[0] = {
    ...validEntry("almost-but-not-enough"),
    foreground: "rgb(119, 119, 119)",
    backgroundColors: ["rgb(255, 255, 255)"]
  };

  assert.throws(
    () => validatePixelContrastObservation(observation),
    /Every visible text\/background range must meet 4.5:1/
  );
});
