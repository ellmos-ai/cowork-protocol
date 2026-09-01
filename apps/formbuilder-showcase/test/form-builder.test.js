import assert from "node:assert/strict";
import { test } from "node:test";

import { classifyType, parseSchema } from "../src/form-engine.mjs";
import {
  buildFormSchema,
  classificationDisplayName,
  createField,
  emptyBuilderState,
  FIELD_TYPE_PALETTE,
  FormBuilderError,
  insertField,
  moveField,
  removeField,
  setHeadingLevel,
  updateField
} from "../src/form-builder.mjs";

test("every palette entry classifies to a real, distinct form-engine.mjs type", () => {
  const classifications = FIELD_TYPE_PALETTE.map((entry) => classifyType(entry.typeString));
  assert.equal(classifications.filter((value) => value === "unknown").length, 0);
  assert.equal(new Set(classifications).size, FIELD_TYPE_PALETTE.length);
});

// --- GAP-08: the UI shows a display name, never the raw schema typeString. ---

test("every palette entry has a non-empty displayName distinct from the raw typeString", () => {
  for (const entry of FIELD_TYPE_PALETTE) {
    assert.equal(typeof entry.displayName, "string");
    assert.ok(entry.displayName.length > 0, `${entry.paletteId} needs a displayName`);
    assert.notEqual(entry.displayName, entry.typeString);
  }
});

test("classificationDisplayName covers every classification a field can have, including both heading levels", () => {
  const classifications = [
    "heading-h1",
    "heading-h2",
    "description",
    "text-short",
    "text-long",
    "date",
    "checkbox-single",
    "checkbox-multi",
    "separator"
  ];
  for (const classification of classifications) {
    const displayName = classificationDisplayName(classification);
    assert.equal(typeof displayName, "string");
    assert.ok(displayName.length > 0);
    // Never a raw German schema string leaking through as a "display name".
    assert.doesNotMatch(displayName, /Textfeld|Checkbox|Datumsauswahl|Trennlinie|Beschreibung|Überschrift/);
  }
  // Both heading levels share one human-readable kind name.
  assert.equal(classificationDisplayName("heading-h1"), classificationDisplayName("heading-h2"));
});

test("classificationDisplayName falls back to the classification itself for anything unrecognized", () => {
  assert.equal(classificationDisplayName("unknown"), "unknown");
});

test("createField mints a fresh, unique, immutable id per call", () => {
  const first = createField("text-short");
  const second = createField("text-short");
  assert.notEqual(first.id, second.id);
  assert.equal(first.type, "Textfeld (Kurz)");
  assert.equal(first.required, false);
  const ids = new Set(Array.from({ length: 200 }, () => createField("text-short").id));
  assert.equal(ids.size, 200);
});

test("createField seeds default options only for choice fields", () => {
  assert.equal(createField("text-short").options, undefined);
  assert.deepEqual(createField("checkbox-multi").options, ["Option 1", "Option 2"]);
  assert.deepEqual(
    createField("checkbox-single", { options: ["Yes", "No"] }).options,
    ["Yes", "No"]
  );
});

test("insertField appends by default and never mutates the input array", () => {
  const original = [createField("text-short", { label: "A" })];
  const field = createField("text-short", { label: "B" });
  const next = insertField(original, field);
  assert.equal(original.length, 1);
  assert.equal(next.length, 2);
  assert.equal(next[1].label, "B");
});

test("insertField places a field at an explicit index", () => {
  const a = createField("text-short", { label: "A" });
  const c = createField("text-short", { label: "C" });
  const b = createField("text-short", { label: "B" });
  const next = insertField(insertField([], a), c);
  const withB = insertField(next, b, 1);
  assert.deepEqual(withB.map((field) => field.label), ["A", "B", "C"]);
});

test("insertField clamps an out-of-range index instead of throwing", () => {
  const a = createField("text-short", { label: "A" });
  const b = createField("text-short", { label: "B" });
  const next = insertField(insertField([], a), b, 99);
  assert.deepEqual(next.map((field) => field.label), ["A", "B"]);
});

test("insertField rejects a duplicate field id", () => {
  const field = createField("text-short");
  assert.throws(() => insertField([field], field), { name: "FormBuilderError", code: "DUPLICATE_FIELD_ID" });
});

test("updateField patches label, required and options without touching id or type", () => {
  const field = createField("checkbox-multi", { label: "Interests" });
  const next = updateField([field], field.id, { label: "Topics", required: true, options: ["A", "B", "C"] });
  const updated = next[0];
  assert.equal(updated.id, field.id);
  assert.equal(updated.type, field.type);
  assert.equal(updated.label, "Topics");
  assert.equal(updated.required, true);
  assert.deepEqual(updated.options, ["A", "B", "C"]);
});

test("updateField patches an optional helpText string", () => {
  const field = createField("text-short", { label: "Full name" });
  assert.equal(field.helpText, undefined);
  const next = updateField([field], field.id, { helpText: "Used on your event badge." });
  assert.equal(next[0].helpText, "Used on your event badge.");
});

test("updateField rejects an attempt to change id or type", () => {
  const field = createField("text-short");
  assert.throws(() => updateField([field], field.id, { type: "Datumsauswahl" }), {
    name: "FormBuilderError",
    code: "IMMUTABLE_FIELD_PROPERTY"
  });
  assert.throws(() => updateField([field], field.id, { id: "forged" }), {
    name: "FormBuilderError",
    code: "IMMUTABLE_FIELD_PROPERTY"
  });
});

test("updateField rejects an unknown field id", () => {
  assert.throws(() => updateField([], "missing", { label: "x" }), {
    name: "FormBuilderError",
    code: "FIELD_NOT_FOUND"
  });
});

test("moveField swaps adjacent fields up and down", () => {
  const a = createField("text-short", { label: "A" });
  const b = createField("text-short", { label: "B" });
  const c = createField("text-short", { label: "C" });
  const start = [a, b, c];
  assert.deepEqual(moveField(start, c.id, "up").map((f) => f.label), ["A", "C", "B"]);
  assert.deepEqual(moveField(start, a.id, "down").map((f) => f.label), ["B", "A", "C"]);
});

test("moveField fails closed at the canvas boundary", () => {
  const a = createField("text-short", { label: "A" });
  const b = createField("text-short", { label: "B" });
  const start = [a, b];
  assert.throws(() => moveField(start, a.id, "up"), { name: "FormBuilderError", code: "MOVE_OUT_OF_BOUNDS" });
  assert.throws(() => moveField(start, b.id, "down"), { name: "FormBuilderError", code: "MOVE_OUT_OF_BOUNDS" });
  // A rejected move must not have mutated the input.
  assert.deepEqual(start.map((f) => f.label), ["A", "B"]);
});

test("removeField drops exactly the named field and rejects an unknown id", () => {
  const a = createField("text-short", { label: "A" });
  const b = createField("text-short", { label: "B" });
  assert.deepEqual(removeField([a, b], a.id).map((f) => f.label), ["B"]);
  assert.throws(() => removeField([a, b], "missing"), { name: "FormBuilderError", code: "FIELD_NOT_FOUND" });
});

test("setHeadingLevel rewrites a heading's type and rejects non-headings", () => {
  const heading = createField("heading");
  assert.equal(classifyType(heading.type), "heading-h2");
  const asH1 = setHeadingLevel([heading], heading.id, 1);
  assert.equal(classifyType(asH1[0].type), "heading-h1");
  const text = createField("text-short");
  assert.throws(() => setHeadingLevel([text], text.id, 1), { name: "FormBuilderError", code: "NOT_A_HEADING" });
});

test("buildFormSchema is the exact inverse of parseSchema for title and elements", () => {
  const elements = [
    createField("heading", { label: "About you" }),
    createField("text-short", { label: "Full name" }),
    createField("checkbox-multi", { label: "Interests", options: ["Reading", "Sports"] })
  ];
  const schema = buildFormSchema("Round trip form", elements);
  assert.equal(schema.schema, "formularerstellen-form-v1");
  assert.equal(schema.schema_version, 1);
  assert.equal(schema.app, "FormBuilder Web");
  assert.equal(typeof schema.created_at, "string");
  const parsed = parseSchema(schema);
  assert.deepEqual(parsed, { title: "Round trip form", elements });
});

test("buildFormSchema copies elements so later edits cannot leak into an exported schema", () => {
  const elements = [createField("text-short", { label: "A" })];
  const schema = buildFormSchema("Frozen export", elements);
  elements[0].label = "Mutated after export";
  assert.equal(schema.form.elements[0].label, "A");
});

test("emptyBuilderState starts with a title and no fields", () => {
  assert.deepEqual(emptyBuilderState(), { title: "Untitled form", elements: [] });
  assert.deepEqual(emptyBuilderState("My form"), { title: "My form", elements: [] });
});

// --- A4: the Builder core is fully usable with zero Cowork Protocol imports. ---
test("solo mode: design, fill in and export a form with no agent, no WebMCP, no protocol package", async () => {
  const moduleUrl = new URL("../src/form-builder.mjs", import.meta.url);
  const source = await import("node:fs/promises").then((fs) => fs.readFile(moduleUrl, "utf8"));
  assert.doesNotMatch(
    source,
    /packages\/(core|native-webmcp|session-authority|bridge|conversation|model-transport|companion-link|context-manager|model-gateway|integration-contract|reference-ui|open-compute-adapter)/,
    "form-builder.mjs must not import any Cowork Protocol package"
  );

  // Design: build a small form purely from the palette.
  let elements = [];
  elements = insertField(elements, createField("heading", { label: "Feedback" }));
  const nameField = createField("text-short", { label: "Your name" });
  elements = insertField(elements, nameField);
  elements = updateField(elements, nameField.id, { required: true });
  elements = insertField(elements, createField("checkbox-single", { label: "Rating", options: ["Good", "Bad"] }));

  // Export the design, then treat that export as the only source of truth for filling in.
  const { parseSchema, validateRequired, buildResponse } = await import("../src/form-engine.mjs");
  const schema = buildFormSchema("Solo mode form", elements);
  const parsed = parseSchema(schema);

  const missingBeforeFilling = validateRequired(parsed.elements, {});
  assert.equal(missingBeforeFilling.length, 1);

  const values = { [nameField.id]: "Ada", Rating: "Good" };
  assert.equal(validateRequired(parsed.elements, values).length, 0);
  const response = buildResponse(parsed.title, parsed.elements, values);
  assert.equal(response.schema, "formularerstellen-response-v1");
  assert.equal(response.responses.find((entry) => entry.field_id === nameField.id).value, "Ada");
});

test("FormBuilderError carries a stable name and code for callers that branch on it", () => {
  const error = new FormBuilderError("SOME_CODE", "message");
  assert.equal(error.name, "FormBuilderError");
  assert.equal(error.code, "SOME_CODE");
  assert.ok(error instanceof Error);
});
