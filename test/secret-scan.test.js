import assert from "node:assert/strict";
import { test } from "node:test";

import { findPotentialSecrets } from "../scripts/check-secrets.mjs";

test("the secret scanner positive control detects a synthetic API key without exposing it", () => {
  const syntheticPrefix = ["sk", "proj"].join("-");
  const syntheticSecret = `${syntheticPrefix}-${"A".repeat(24)}`;

  assert.deepEqual(findPotentialSecrets(`TOKEN=${syntheticSecret}\n`, "positive-control.txt"), [
    {
      path: "positive-control.txt",
      line: 1,
      kind: "OpenAI-style API key"
    }
  ]);
});
