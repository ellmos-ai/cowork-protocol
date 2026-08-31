// Derived from doc-bricks/FormularErstellen web_companion/form-engine.mjs
// baseline dc634004401b27fef78a7861b033e8909cf241f4, MIT License.
// Copyright (c) 2026 Lukas. See ../FORMBUILDER-NOTICE.md.

const SCHEMA_NAME = 'formularerstellen-form-v1';
const RESPONSE_SCHEMA_NAME = 'formularerstellen-response-v1';

const LEGACY_TYPE_MAP = {
  'Texteingabefeld-Kurz': 'text-short',
  'Texteingabefeld-Lang': 'text-long',
  'Texteingabefeld (Kurz)': 'text-short',
  'Texteingabefeld (Lang)': 'text-long',
};

const SUBSTRING_RULES = [
  { sub: 'Textfeld', match: (type) => type.includes('Kurz') ? 'text-short' : 'text-long' },
  { sub: 'Datum', match: () => 'date' },
  { sub: 'Checkbox', match: (type) => type.includes('Single') ? 'checkbox-single' : 'checkbox-multi' },
  { sub: 'Bild', match: () => 'image' },
  { sub: 'Trennlinie', match: () => 'separator' },
  { sub: 'Beschreibung', match: () => 'description' },
  { sub: 'Rahmen', match: (type) => type.includes('Start') ? 'frame-start' : 'frame-end' },
];

export function classifyType(typeString) {
  if (!typeString) return 'unknown';

  const legacy = LEGACY_TYPE_MAP[typeString];
  if (legacy) return legacy;

  if (typeString.includes('Überschrift') || typeString.includes('Ueberschrift')) {
    return typeString.includes('H1') ? 'heading-h1' : 'heading-h2';
  }

  for (const rule of SUBSTRING_RULES) {
    if (typeString.includes(rule.sub)) return rule.match(typeString);
  }

  return 'unknown';
}

const INPUT_TYPES = new Set([
  'text-short', 'text-long', 'date', 'checkbox-single', 'checkbox-multi',
]);

export function isInputType(classification) {
  return INPUT_TYPES.has(classification);
}

function ensureUniqueFieldIds(elements) {
  const seenIds = new Set();
  for (const element of elements) {
    const id = element?.id;
    if (!id) continue;
    if (seenIds.has(id)) throw new Error(`Duplicate field ID: ${id}`);
    seenIds.add(id);
  }
}

export function parseSchema(json) {
  if (!json || typeof json !== 'object') {
    throw new Error('Invalid schema: not an object');
  }

  if (json.schema === SCHEMA_NAME) {
    const version = json.schema_version;
    if (typeof version !== 'number' || version < 1) {
      throw new Error(`Invalid schema version: ${version}`);
    }
    const form = json.form;
    if (!form || typeof form !== 'object') {
      throw new Error('Missing or invalid "form" object');
    }
    if (!form.title || typeof form.title !== 'string') {
      throw new Error('Missing form title (form.title)');
    }
    if (!Array.isArray(form.elements)) {
      throw new Error('Missing element list (form.elements)');
    }
    ensureUniqueFieldIds(form.elements);
    return { title: form.title, elements: form.elements };
  }

  if (typeof json.title === 'string' && Array.isArray(json.elements)) {
    ensureUniqueFieldIds(json.elements);
    return { title: json.title, elements: json.elements };
  }

  throw new Error('Unknown format: neither formularerstellen-form-v1 nor a bare legacy schema was recognized');
}

export function fieldKey(element) {
  return element.id || element.label;
}

export function validateRequired(elements, values) {
  const missing = [];
  for (const element of elements) {
    if (!element.required) continue;
    const classification = classifyType(element.type);
    if (!isInputType(classification)) continue;

    const value = values[fieldKey(element)];
    if (value === undefined || value === null || value === '') {
      missing.push({ id: element.id, label: element.label || '' });
    } else if (Array.isArray(value) && value.length === 0) {
      missing.push({ id: element.id, label: element.label || '' });
    }
  }
  return missing;
}

export function buildResponse(title, elements, values) {
  const responses = [];
  for (const element of elements) {
    const classification = classifyType(element.type);
    if (!isInputType(classification)) continue;

    const value = values[fieldKey(element)];
    const entry = {
      label: element.label,
      type: element.type,
      value: value !== undefined ? value : null,
    };
    if (element.id) entry.field_id = element.id;
    responses.push(entry);
  }

  return {
    schema: RESPONSE_SCHEMA_NAME,
    schema_version: 1,
    source_form: title,
    filled_at: new Date().toISOString(),
    responses,
  };
}
