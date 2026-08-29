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
      "context-one-step",
      "bridge-summary-350"
    ]
  );
  assert.equal(report.summary.failed, 0);
  assert.equal(report.summary.passed, report.cases.length);
});

test("the eval reports avoided source characters without converting them to tokens", () => {
  const report = runTokenEconomyEval();
  const digestCase = report.cases.find(({ id }) => id === "selection-161-digest");
  const bridgeCase = report.cases.find(({ id }) => id === "bridge-summary-350");

  assert.equal(digestCase.observed.selectedTextIncludedCharacters, 0);
  assert.equal(digestCase.observed.avoidedSourceCharacters, 161);
  assert.equal(bridgeCase.observed.sourceDescriptionCharacters, 500);
  assert.equal(bridgeCase.observed.includedDescriptionCharacters, 160);
  assert.equal(bridgeCase.observed.avoidedSourceCharacters, 340);
});
