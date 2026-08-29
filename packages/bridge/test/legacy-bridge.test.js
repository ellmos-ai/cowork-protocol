import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLegacyDomFocus,
  requestLegacyContext
} from "../src/index.js";

test("an unstable legacy DOM target remains explain-only", () => {
  const focus = buildLegacyDomFocus({
    sessionId: "legacy-session",
    pageVersion: 4,
    lens: "pointer",
    target: {
      tagName: "button",
      role: "button",
      label: "Continue",
      selectedText: ""
    }
  });

  assert.equal(focus.capabilityLevel, "legacy-dom");
  assert.match(focus.targetId, /^legacy-ephemeral:/);
  assert.deepEqual(focus.capabilityIds, ["legacy.explain_target"]);
  assert.equal(focus.metrics.contextCharacters, "Continue".length);
});

test("a stable legacy target can offer but never directly mutate", () => {
  const focus = buildLegacyDomFocus({
    sessionId: "legacy-session",
    pageVersion: 4,
    lens: "selection",
    target: {
      stableId: "checkout-note",
      tagName: "textarea",
      role: "textbox",
      label: "Order note",
      selectedText: "gift wrap"
    }
  });

  assert.equal(focus.targetId, "legacy-dom:checkout-note");
  assert.deepEqual(focus.capabilityIds, [
    "legacy.explain_target",
    "legacy.offer_value"
  ]);
});

test("legacy context expands one bounded semantic level at a time", () => {
  const related = requestLegacyContext({
    currentLevel: 0,
    requestedLevel: 1,
    nearbySemanticText: "N".repeat(500),
    accessibilityRegionText: "A".repeat(1500)
  });
  assert.equal(related.level, 1);
  assert.equal(related.nearbySemanticText.length, 350);
  assert.equal(related.accessibilityRegionText, undefined);

  const region = requestLegacyContext({
    currentLevel: 1,
    requestedLevel: 2,
    nearbySemanticText: "N".repeat(500),
    accessibilityRegionText: "A".repeat(1500)
  });
  assert.equal(region.level, 2);
  assert.equal(region.accessibilityRegionText.length, 1200);
});

test("legacy context rejects level jumps and requests only a pointer-sized visual lens", () => {
  assert.throws(
    () => requestLegacyContext({ currentLevel: 0, requestedLevel: 2 }),
    (error) => error.code === "CONTEXT_BUDGET_EXCEEDED"
  );

  const visual = requestLegacyContext({
    currentLevel: 2,
    requestedLevel: 3,
    pointer: { x: 880, y: 420 }
  });
  assert.deepEqual(visual.visualRequest, {
    kind: "pointer-region",
    center: { x: 880, y: 420 },
    maximumWidth: 400,
    maximumHeight: 400,
    maximumPixelArea: 160000
  });
  assert.equal("image" in visual, false);
});
