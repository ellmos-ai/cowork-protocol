import assert from "node:assert/strict";
import { test } from "node:test";

import { routeContextSignal } from "../src/index.js";

test("silence and unchanged state emit no model packet", () => {
  assert.equal(
    routeContextSignal({
      signal: "silence",
      changed: false,
      currentLevel: 1,
      requestedLevel: 1
    }),
    null
  );
  assert.equal(
    routeContextSignal({
      signal: "focus",
      changed: false,
      currentLevel: 2,
      requestedLevel: 2
    }),
    null
  );
});

test("a justified context request can expand by exactly one level", () => {
  assert.deepEqual(
    routeContextSignal({
      signal: "focus",
      changed: true,
      currentLevel: 2,
      requestedLevel: 3,
      reason: "Need the related validation rule"
    }),
    {
      emit: true,
      level: 3,
      oneShot: true,
      reason: "Need the related validation rule"
    }
  );

  assert.throws(
    () =>
      routeContextSignal({
        signal: "focus",
        changed: true,
        currentLevel: 2,
        requestedLevel: 4,
        reason: "Show everything"
      }),
    {
      name: "CoworkProtocolError",
      code: "CONTEXT_BUDGET_EXCEEDED"
    }
  );
  assert.throws(
    () =>
      routeContextSignal({
        signal: "focus",
        changed: true,
        currentLevel: 5,
        requestedLevel: 6,
        reason: "Beyond viewport"
      }),
    { name: "CoworkProtocolError", code: "CONTEXT_BUDGET_EXCEEDED" }
  );
  assert.throws(
    () =>
      routeContextSignal({
        signal: "focus",
        changed: true,
        currentLevel: 1,
        requestedLevel: -1,
        reason: "Invalid level"
      }),
    { name: "CoworkProtocolError", code: "CONTEXT_BUDGET_EXCEEDED" }
  );
});
