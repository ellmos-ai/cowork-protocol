// New Cowork Protocol challenge work. No code is copied from doc-bricks/FormularErstellen;
// only its public README.md and EXPORTFORMAT.md were read for the field-type and
// schema-envelope contract this module targets. See ../INTEGRATION.md.
//
// This module is the Builder core: it edits a `formularerstellen-form-v1` element
// list. It has no dependency on the Cowork protocol packages, so the app that
// imports only this file (plus form-engine.mjs and fodt-export.mjs) still designs,
// fills in and exports a form with no agent anywhere.

import { classifyType } from "./form-engine.mjs";

export class FormBuilderError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "FormBuilderError";
    this.code = code;
  }
}

// One palette entry per required Build-mode field type. `typeString` is the exact
// upstream FormularErstellen type name so `classifyType()` recognizes it the same
// way the real desktop app and the attributed engine already do.
// `displayName` is a UI-only label (GAP-08): the German `typeString` is the
// real formularerstellen-form-v1 schema value and stays exactly as-is for
// compatibility with the upstream desktop app and classifyType() - only the
// rendered kind badge and the Add-field palette use `displayName`.
export const FIELD_TYPE_PALETTE = Object.freeze([
  {
    paletteId: "heading",
    typeString: "Überschrift H2",
    displayName: "Heading",
    defaultLabel: "Section heading",
    category: "layout",
    hasOptions: false
  },
  {
    paletteId: "description",
    typeString: "Beschreibung",
    displayName: "Description",
    defaultLabel: "Add helpful context for this section.",
    category: "layout",
    hasOptions: false
  },
  {
    paletteId: "text-short",
    typeString: "Textfeld (Kurz)",
    displayName: "Short answer",
    defaultLabel: "Short answer",
    category: "input",
    hasOptions: false
  },
  {
    paletteId: "text-long",
    typeString: "Textfeld (Lang)",
    displayName: "Long answer",
    defaultLabel: "Long answer",
    category: "input",
    hasOptions: false
  },
  {
    paletteId: "date",
    typeString: "Datumsauswahl",
    displayName: "Date",
    defaultLabel: "Date",
    category: "input",
    hasOptions: false
  },
  {
    paletteId: "checkbox-single",
    typeString: "Checkbox (Single)",
    displayName: "Choose one",
    defaultLabel: "Choose one",
    category: "input",
    hasOptions: true
  },
  {
    paletteId: "checkbox-multi",
    typeString: "Checkbox (Multi)",
    displayName: "Choose any",
    defaultLabel: "Choose any",
    category: "input",
    hasOptions: true
  },
  {
    paletteId: "separator",
    typeString: "Trennlinie",
    displayName: "Divider",
    defaultLabel: "",
    category: "layout",
    hasOptions: false
  }
]);

const PALETTE_BY_ID = new Map(FIELD_TYPE_PALETTE.map((entry) => [entry.paletteId, entry]));
const HEADING_LEVEL_TYPES = { 1: "Überschrift H1", 2: "Überschrift H2" };

// classifyType() distinguishes heading-h1/heading-h2 (two classifications,
// one palette entry), so the kind-badge lookup is keyed by classification,
// not by paletteId.
const DISPLAY_NAME_BY_CLASSIFICATION = Object.freeze({
  "heading-h1": "Heading",
  "heading-h2": "Heading",
  description: "Description",
  "text-short": "Short answer",
  "text-long": "Long answer",
  date: "Date",
  "checkbox-single": "Choose one",
  "checkbox-multi": "Choose any",
  separator: "Divider"
});

/** The human-readable kind name for a field (GAP-08): never the raw German
 *  typeString the schema uses internally. Falls back to the classification
 *  itself for anything unrecognized rather than throwing, since this is a
 *  display concern, not a validation one. */
export function classificationDisplayName(classification) {
  return DISPLAY_NAME_BY_CLASSIFICATION[classification] ?? classification;
}

// Sanity: every palette entry must classify to a real, distinct classification so
// the Build palette and the Fill renderer always agree with form-engine.mjs.
for (const entry of FIELD_TYPE_PALETTE) {
  const classification = classifyType(entry.typeString);
  if (classification === "unknown") {
    throw new FormBuilderError(
      "PALETTE_TYPE_UNRECOGNIZED",
      `Palette entry "${entry.paletteId}" has a type string form-engine.mjs cannot classify`
    );
  }
}

export function paletteEntry(paletteId) {
  const entry = PALETTE_BY_ID.get(paletteId);
  if (!entry) {
    throw new FormBuilderError("UNKNOWN_PALETTE_ID", `Unknown field palette id: ${paletteId}`);
  }
  return entry;
}

export function classificationOf(element) {
  return classifyType(element?.type);
}

export function generateFieldId() {
  return globalThis.crypto.randomUUID().replace(/-/g, "");
}

/** Creates a brand-new field with a fresh, immutable id. Never mutates its input. */
export function createField(paletteId, overrides = {}) {
  const entry = paletteEntry(paletteId);
  const field = {
    id: generateFieldId(),
    type: entry.typeString,
    label: overrides.label ?? entry.defaultLabel,
    required: false
  };
  if (entry.hasOptions) {
    field.options = overrides.options ? [...overrides.options] : ["Option 1", "Option 2"];
  }
  return field;
}

/** Inserts `field` at `index` (defaults to the end); returns a new array. */
export function insertField(elements, field, index = elements.length) {
  if (elements.some((element) => element.id === field.id)) {
    throw new FormBuilderError("DUPLICATE_FIELD_ID", `Duplicate field id: ${field.id}`);
  }
  const clampedIndex = Math.max(0, Math.min(index, elements.length));
  const next = [...elements];
  next.splice(clampedIndex, 0, { ...field });
  return next;
}

function findFieldIndex(elements, id) {
  const index = elements.findIndex((element) => element.id === id);
  if (index === -1) {
    throw new FormBuilderError("FIELD_NOT_FOUND", `No field with id: ${id}`);
  }
  return index;
}

const IMMUTABLE_PATCH_KEYS = new Set(["id", "type"]);

/** Applies a patch (label/required/options/helpText) to one field; id and type never change. */
export function updateField(elements, id, patch) {
  const index = findFieldIndex(elements, id);
  const forbiddenKey = Object.keys(patch).find((key) => IMMUTABLE_PATCH_KEYS.has(key));
  if (forbiddenKey) {
    throw new FormBuilderError(
      "IMMUTABLE_FIELD_PROPERTY",
      `Field property cannot be changed after creation: ${forbiddenKey}`
    );
  }
  const next = [...elements];
  next[index] = { ...next[index], ...patch };
  return next;
}

/** Moves one field up or down by one position; returns a new array. */
export function moveField(elements, id, direction) {
  if (direction !== "up" && direction !== "down") {
    throw new FormBuilderError("INVALID_DIRECTION", `Direction must be "up" or "down": ${direction}`);
  }
  const index = findFieldIndex(elements, id);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= elements.length) {
    throw new FormBuilderError("MOVE_OUT_OF_BOUNDS", `Cannot move field ${direction} past the canvas boundary`);
  }
  const next = [...elements];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return next;
}

/** Removes one field; returns a new array. */
export function removeField(elements, id) {
  findFieldIndex(elements, id);
  return elements.filter((element) => element.id !== id);
}

/** Sets a heading field's level (1 or 2) by rewriting its `type` string in place of the field. */
export function setHeadingLevel(elements, id, level) {
  const typeString = HEADING_LEVEL_TYPES[level];
  if (!typeString) {
    throw new FormBuilderError("INVALID_HEADING_LEVEL", `Heading level must be 1 or 2: ${level}`);
  }
  const index = findFieldIndex(elements, id);
  if (classificationOf(elements[index]) !== "heading-h1" && classificationOf(elements[index]) !== "heading-h2") {
    throw new FormBuilderError("NOT_A_HEADING", `Field ${id} is not a heading`);
  }
  const next = [...elements];
  next[index] = { ...next[index], type: typeString };
  return next;
}

/** The inverse of form-engine.mjs's parseSchema(): wraps a title/elements pair in the
 *  formularerstellen-form-v1 envelope so it round-trips through the real desktop app. */
export function buildFormSchema(title, elements, { app = "FormBuilder Web", createdAt } = {}) {
  return {
    schema: "formularerstellen-form-v1",
    schema_version: 1,
    app,
    created_at: createdAt ?? new Date().toISOString(),
    form: {
      title,
      elements: elements.map((element) => ({ ...element }))
    }
  };
}

export function emptyBuilderState(title = "Untitled form") {
  return { title, elements: [] };
}
