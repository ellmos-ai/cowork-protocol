import assert from "node:assert/strict";
import { test } from "node:test";

import { buildFocusPacket } from "../src/index.js";

test("selected text over 160 characters is replaced by a length and digest", () => {
  const packet = buildFocusPacket({
    sessionId: "session-1",
    source: "human-selection",
    capabilityLevel: "native",
    targetId: "field.email",
    pageVersion: 7,
    focusKind: "selection",
    label: "Email address",
    selectedText: "x".repeat(161),
    capabilityIds: ["form.set_label"]
  });

  assert.deepEqual(packet, {
    protocolVersion: "0.1",
    type: "focus",
    sessionId: "session-1",
    source: "human-selection",
    capabilityLevel: "native",
    targetId: "field.email",
    pageVersion: 7,
    focus: {
      kind: "selection",
      label: "Email address",
      selection: {
        kind: "digest",
        length: 161,
        sha256: "fdb7f3c40645e79ca4c5d1638753243ccb283f5dd126ceb21de5fa7d40953c65"
      }
    },
    capabilityIds: ["form.set_label"],
    metrics: {
      contextCharacters: 13,
      selectedTextCharacters: 161,
      selectedTextIncludedCharacters: 0
    }
  });
  assert.ok(packet.metrics.contextCharacters <= 350);
});

test("selected text at the 160 character boundary remains available verbatim", () => {
  const selectedText =
    "01234567890123456789012345678901234567890123456789012345678901234567890123456789" +
    "01234567890123456789012345678901234567890123456789012345678901234567890123456789";

  const packet = buildFocusPacket({
    sessionId: "session-2",
    source: "human-selection",
    capabilityLevel: "native",
    targetId: "field.notes",
    pageVersion: 1,
    focusKind: "selection",
    label: "Notes",
    selectedText,
    capabilityIds: []
  });

  assert.deepEqual(packet.focus.selection, {
    kind: "text",
    text: selectedText
  });
  assert.deepEqual(packet.metrics, {
    contextCharacters: 165,
    selectedTextCharacters: 160,
    selectedTextIncludedCharacters: 160
  });
});

test("focus packet user text is capped at 350 characters", () => {
  const packet = buildFocusPacket({
    sessionId: "session-3",
    source: "human-selection",
    capabilityLevel: "native",
    targetId: "field.description",
    pageVersion: 2,
    focusKind: "selection",
    label: "L".repeat(300),
    selectedText: "S".repeat(160),
    capabilityIds: ["form.set_description"]
  });

  assert.equal(packet.focus.label, `${"L".repeat(189)}…`);
  assert.deepEqual(packet.metrics, {
    contextCharacters: 350,
    selectedTextCharacters: 160,
    selectedTextIncludedCharacters: 160,
    labelCharacters: 300,
    labelIncludedCharacters: 190
  });
});
