import assert from "node:assert/strict";
import { test } from "node:test";

import { buildFormBuilderFocus } from "../src/index.js";

test("a stable FormBuilder field becomes a native focus with only field capabilities", () => {
  const packet = buildFormBuilderFocus({
    sessionId: "form-session-1",
    pageVersion: 3,
    fieldId: "e4b2a8d1f0c34e89",
    label: "Full Name",
    controlKind: "text",
    selectedText: "Lu"
  });

  assert.equal(packet.capabilityLevel, "native");
  assert.equal(packet.targetId, "form-field:e4b2a8d1f0c34e89");
  assert.deepEqual(packet.capabilityIds, [
    "form.explain_field",
    "form.set_value",
    "form.clear_value"
  ]);
  assert.deepEqual(packet.focus, {
    kind: "selection",
    label: "Full Name",
    selection: { kind: "text", text: "Lu" }
  });
  assert.equal(packet.metrics.contextCharacters, 11);
});

test("native FormBuilder focus rejects legacy fields without a stable id", () => {
  assert.throws(
    () =>
      buildFormBuilderFocus({
        sessionId: "form-session-2",
        pageVersion: 1,
        label: "Name",
        controlKind: "text",
        selectedText: ""
      }),
    {
      name: "CoworkProtocolError",
      code: "CONNECTOR_DEGRADED"
    }
  );
});

test("pointer and pinned lenses keep their attention source distinct", () => {
  const pointer = buildFormBuilderFocus({
    sessionId: "form-session-3",
    pageVersion: 2,
    fieldId: "email",
    label: "Email",
    controlKind: "text",
    selectedText: "",
    focusKind: "pointer"
  });
  assert.equal(pointer.source, "human-pointer");
  assert.equal(pointer.focus.kind, "pointer");

  const pinned = buildFormBuilderFocus({
    sessionId: "form-session-3",
    pageVersion: 2,
    fieldId: "email",
    label: "Email",
    controlKind: "text",
    selectedText: "",
    focusKind: "pinned"
  });
  assert.equal(pinned.source, "human-pinned");
  assert.equal(pinned.focus.kind, "pinned");
});
