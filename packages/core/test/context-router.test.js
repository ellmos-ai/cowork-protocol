import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildContextExpansion,
  buildFocusPacket,
  routeContextSignal
} from "../src/index.js";

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

test("a one-shot context expansion stays bounded and attached to the current focus", () => {
  const focusPacket = buildFocusPacket({
    sessionId: "context-session-1",
    source: "human-pointer",
    capabilityLevel: "native",
    targetId: "form-field:email",
    pageVersion: 4,
    focusKind: "pointer",
    label: "Email",
    selectedText: "",
    capabilityIds: ["form.explain_field"]
  });
  const sourceContext = `${"x".repeat(1199)}😀more`;

  const expansion = buildContextExpansion({
    focusPacket,
    currentLevel: 2,
    requestedLevel: 3,
    reason: "Need the related validation rule",
    relatedContext: sourceContext
  });

  assert.equal(expansion.type, "context-expansion");
  assert.equal(expansion.targetId, "form-field:email");
  assert.equal(expansion.pageVersion, 4);
  assert.equal(expansion.level, 3);
  assert.equal(expansion.oneShot, true);
  assert.equal(expansion.relatedContext.length, 1200);
  assert.equal(expansion.relatedContext.endsWith("\ud83d"), false);
  assert.equal(expansion.metrics.sourceContextCharacters, sourceContext.length);
  assert.equal(expansion.metrics.includedContextCharacters, 1200);
});

test("context expansion requires a current focus and a bounded reason", () => {
  assert.throws(
    () =>
      buildContextExpansion({
        focusPacket: null,
        currentLevel: 2,
        requestedLevel: 3,
        reason: "Need the related validation rule",
        relatedContext: "Required email field"
      }),
    { name: "CoworkProtocolError", code: "STALE_FOCUS" }
  );

  const focusPacket = buildFocusPacket({
    sessionId: "context-session-2",
    source: "human-pointer",
    capabilityLevel: "native",
    targetId: "form-field:email",
    pageVersion: 5,
    focusKind: "pointer",
    label: "Email",
    selectedText: "",
    capabilityIds: ["form.explain_field"]
  });
  assert.throws(
    () =>
      buildContextExpansion({
        focusPacket,
        currentLevel: 2,
        requestedLevel: 3,
        reason: "r".repeat(201),
        relatedContext: "Required email field"
      }),
    { name: "CoworkProtocolError", code: "CONTEXT_BUDGET_EXCEEDED" }
  );
  assert.throws(
    () =>
      buildContextExpansion({
        focusPacket,
        currentLevel: 2,
        requestedLevel: 2,
        reason: "Repeat the same context level",
        relatedContext: "Required email field"
      }),
    { name: "CoworkProtocolError", code: "CONTEXT_BUDGET_EXCEEDED" }
  );
});
