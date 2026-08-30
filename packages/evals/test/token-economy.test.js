import assert from "node:assert/strict";
import test from "node:test";

import { runTokenEconomyEval } from "../src/index.js";

test("the token-economy eval covers every declared budget and silence invariant", () => {
  const report = runTokenEconomyEval();

  assert.equal(report.metric, "adapter-characters");
  assert.equal(report.hostTokenClaim, false);
  assert.deepEqual(
    report.cases.map(({ id }) => id),
    [
      "focus-normal-350",
      "selection-160-verbatim",
      "selection-161-digest",
      "silence-no-packet",
      "unchanged-no-packet",
      "native-context-request-1200",
      "bridge-summary-350",
      "bridge-read-result-1200",
      "change-latest-350",
      "feedback-latest-350",
      "legacy-visual-160000"
    ]
  );
  assert.equal(report.summary.failed, 0);
  assert.equal(report.summary.passed, report.cases.length);

  const contextCase = report.cases.find(
    ({ id }) => id === "native-context-request-1200"
  );
  assert.equal(contextCase.observed.type, "context-expansion");
  assert.equal(contextCase.observed.from, 2);
  assert.equal(contextCase.observed.to, 3);
  assert.equal(contextCase.observed.oneShot, true);
  assert.equal(contextCase.observed.includedContextCharacters, 1200);
  assert.ok(contextCase.observed.avoidedSourceCharacters > 0);
});

test("the legacy visual fallback requests a bounded region without claiming image capture", () => {
  const report = runTokenEconomyEval();
  const visualCase = report.cases.find(({ id }) => id === "legacy-visual-160000");

  assert.equal(visualCase.observed.maximumWidth, 400);
  assert.equal(visualCase.observed.maximumHeight, 400);
  assert.equal(visualCase.observed.maximumPixelArea, 160000);
  assert.equal(visualCase.observed.imageCaptured, false);
});

test("the eval reports avoided source characters without converting them to tokens", () => {
  const report = runTokenEconomyEval();
  const digestCase = report.cases.find(({ id }) => id === "selection-161-digest");
  const bridgeCase = report.cases.find(({ id }) => id === "bridge-summary-350");
  const bridgeResultCase = report.cases.find(
    ({ id }) => id === "bridge-read-result-1200"
  );

  assert.equal(digestCase.observed.selectedTextIncludedCharacters, 0);
  assert.equal(digestCase.observed.avoidedSourceCharacters, 161);
  assert.equal(bridgeCase.observed.sourceDescriptionCharacters, 500);
  assert.equal(bridgeCase.observed.includedDescriptionCharacters, 160);
  assert.equal(bridgeCase.observed.avoidedSourceCharacters, 340);
  assert.equal(bridgeResultCase.observed.includedCharacters, 1200);
  assert.ok(bridgeResultCase.observed.avoidedSourceCharacters > 0);
});
