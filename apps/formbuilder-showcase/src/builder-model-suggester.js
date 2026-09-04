// New Cowork Protocol challenge work: the Builder's field suggestions and its
// delegation drafts, produced by the user's OWN model over the same bounded
// conversation turn the rest of the page already speaks.
//
// Demo mode keeps its scripted lists in builder-cowork-ui.js. This module has
// no scripted list, no default palette id and no invented label: outside demo
// mode a missing, malformed or duplicate model answer RAISES with a code and a
// plain-language cause, so the showcase can never display a suggestion that
// merely looks like the model worked.

import { createConversationTurn } from "../../../packages/conversation/src/index.js";
import { FIELD_TYPE_PALETTE } from "./form-builder.mjs";

const TRANSCRIPT_LIMIT = 350;
const LABEL_LIMIT = 120;
const ERROR_EXCERPT_LIMIT = 120;
const ADD_FIELD_CAPABILITY_ID = "form-add-field";
const CANVAS_TARGET_ID = "form-canvas";
const OFFER_VALUE_PATTERN = /^\s*([a-z0-9-]+)\s*:\s*(.+?)\s*$/i;

/** Answer choices a human can still read on one line, and enough of them to be
 *  a choice at all. A list outside these bounds is dropped, never trimmed into
 *  shape: a silently shortened set of answers is a different question. */
export const FIELD_OPTION_LIMITS = Object.freeze({ min: 2, max: 12, length: 60 });

const OPTION_PALETTE_IDS = new Set(
  FIELD_TYPE_PALETTE.filter((entry) => entry.hasOptions).map((entry) => entry.paletteId)
);

/** True for the field types that actually render answer choices. */
export function paletteTakesOptions(paletteId) {
  return OPTION_PALETTE_IDS.has(paletteId);
}

/**
 * The richer form of an offer value: a JSON object carrying the field's type,
 * label and answer choices at once. Returns null for the plain
 * "<paletteId>: <label>" text every earlier agent already sends, so both
 * shapes keep working and the caller decides how strict to be.
 */
export function parseFieldValueJson(rawValue) {
  const text = typeof rawValue === "string" ? rawValue.trim() : "";
  if (!text.startsWith("{")) return null;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
}

/**
 * Answer choices, kept honest. Returns the list the Builder can actually
 * render, or none at all together with a plain-language reason - never a
 * repaired guess and never an invented choice. An absent or empty list is not
 * a fault: it simply means the model proposed no choices, which is the normal
 * answer for a field type that has none.
 *
 * @param allowed Whether this target renders answer choices at all.
 */
export function normalizeFieldOptions(rawOptions, { allowed }) {
  if (rawOptions === undefined || rawOptions === null) return { options: null, notice: "" };
  if (!Array.isArray(rawOptions)) {
    return { options: null, notice: "Answer options were dropped: they were not a list." };
  }
  const cleaned = rawOptions
    .filter((option) => typeof option === "string")
    .map((option) => option.replace(/\s+/g, " ").trim())
    .filter((option) => option !== "");
  if (cleaned.length === 0) return { options: null, notice: "" };
  if (!allowed) {
    return { options: null, notice: "Answer options were dropped: this field type has none." };
  }
  const seen = new Set();
  const unique = cleaned.filter((option) => {
    const key = option.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const tooLong = unique.find((option) => option.length > FIELD_OPTION_LIMITS.length);
  if (tooLong) {
    return {
      options: null,
      notice: `Answer options were dropped: "${shorten(tooLong, 40)}" is longer than ${FIELD_OPTION_LIMITS.length} characters.`
    };
  }
  if (unique.length < FIELD_OPTION_LIMITS.min || unique.length > FIELD_OPTION_LIMITS.max) {
    return {
      options: null,
      notice: `Answer options were dropped: ${unique.length} of them, and a choice needs ${FIELD_OPTION_LIMITS.min}-${FIELD_OPTION_LIMITS.max}.`
    };
  }
  return { options: unique, notice: "" };
}

export class BuilderModelSuggestionError extends Error {
  constructor(code, message, { cause } = {}) {
    super(message, { cause });
    this.name = "BuilderModelSuggestionError";
    this.code = code;
  }
}

function invalidSuggestion(reason) {
  return new BuilderModelSuggestionError("INVALID_MODEL_SUGGESTION", reason);
}

/** Collapses whitespace and caps `text` at `limit`, marking any cut with "…". */
function shorten(text, limit) {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  return limit < 1 ? "" : `${clean.slice(0, limit - 1)}…`;
}

/** The instruction turn, built to fit the 350-character conversation budget
 *  BEFORE it reaches createConversationTurn: the fixed protocol instruction and
 *  the allowed type list are never cut, only the caller's own title, goal and
 *  label list are shortened to whatever room is left. */
function buildSuggestionTranscript({ intent, formTitle, existingLabels, goal, paletteIds }) {
  const parts = [
    `New field offer: capabilityId "${ADD_FIELD_CAPABILITY_ID}", targetId "${CANVAS_TARGET_ID}", ` +
      `value=JSON text '{"paletteId":..,"label":..,"options":[..]}'. paletteId: ${paletteIds.join("|")}.`
  ];
  let used = parts[0].length;
  const roomFor = (length) => TRANSCRIPT_LIMIT - used - 1 - length;

  const pushWhole = (segment) => {
    if (roomFor(segment.length) < 0) return;
    parts.push(segment);
    used += segment.length + 1;
  };
  const pushShortened = (prefix, value, suffix) => {
    const budget = roomFor(prefix.length + suffix.length);
    if (budget < 4) return;
    const text = shorten(value, budget);
    if (text !== "") pushWhole(`${prefix}${text}${suffix}`);
  };

  // Order is priority order: what is left of the budget goes to the earlier
  // segments. The goal steers the answer, so it outranks the form title.
  // ponytail: with intent "question" the fixed instruction eats ~290 of the 350
  // characters, so a long label list is the first thing dropped. Callers who
  // need duplicate avoidance in a long drafting run should pass only the most
  // recent labels; a duplicate is still caught on the way back, as a raise.
  if (intent === "question") pushWhole("Label = one survey question; prefer text-short.");
  if (goal) pushShortened("Goal: ", goal, ".");
  // Measured against qwen3.8:27b-mlx on 2026-09-04: spelling this rule out
  // costs 43 characters, and when those came out of the goal the model stopped
  // reading the human's own answer choices and invented its own ("0, 1, 2, 3+")
  // instead. So it is said only once the goal is through intact - the JSON key
  // carries the rule on its own when there is no room to spell it out.
  pushWhole("Choices go in options, never in the label.");
  pushShortened('Form: "', formTitle, '".');
  const labels = existingLabels.filter((label) => typeof label === "string" && label.trim() !== "");
  if (labels.length > 0) pushShortened("Already used: ", labels.join("; "), ".");

  // Structural guarantee rather than an incidental one - a caller could hand in
  // a palette long enough to fill the budget by itself.
  return shorten(parts.join(" "), TRANSCRIPT_LIMIT);
}

/**
 * @param sendTurn  The page's transport. Takes one bounded conversation turn and
 *                  resolves to an already normalized reply
 *                  ({ message, speak, offers, omittedOffers }).
 * @param paletteIds The field type ids the Builder can actually create.
 */
export function createBuilderModelSuggester({ sendTurn, paletteIds }) {
  if (typeof sendTurn !== "function") {
    throw new TypeError("sendTurn must be a function");
  }
  if (!Array.isArray(paletteIds) || paletteIds.length === 0) {
    throw new TypeError("paletteIds must be a non-empty array of field type ids");
  }

  return {
    async suggestField({ intent = "field", formTitle = "", existingLabels = [], goal = "", presence }) {
      const transcript = buildSuggestionTranscript({
        intent,
        formTitle,
        existingLabels,
        goal,
        paletteIds
      });
      const turn = createConversationTurn({ transcript, focusPacket: null, presence });

      let reply;
      try {
        reply = await sendTurn(turn);
      } catch (error) {
        throw new BuilderModelSuggestionError(
          "MODEL_UNAVAILABLE",
          `${error?.code ?? "ERROR"}: ${error?.message ?? String(error)}`,
          { cause: error }
        );
      }

      const message = typeof reply?.message === "string" ? reply.message : "";
      const offers = Array.isArray(reply?.offers) ? reply.offers : [];
      const offer = offers.find((candidate) => candidate?.capabilityId === ADD_FIELD_CAPABILITY_ID);
      if (!offer) {
        throw invalidSuggestion(
          `The model returned no "${ADD_FIELD_CAPABILITY_ID}" offer. ` +
            `Reply message: ${shorten(message, ERROR_EXCERPT_LIMIT) || "(empty)"}`
        );
      }

      const rawValue = typeof offer.value === "string" ? offer.value : "";
      const excerpt = shorten(rawValue, ERROR_EXCERPT_LIMIT) || "(empty)";

      // Two shapes, one meaning: the JSON object that can also carry answer
      // choices, and the plain "<paletteId>: <label>" text that cannot. Both
      // are read strictly - a JSON value that is missing its type is an error,
      // never a value quietly re-read as a label.
      const spec = parseFieldValueJson(rawValue);
      let requestedType;
      let label;
      let rawOptions;
      let required = false;
      if (spec) {
        requestedType = typeof spec.paletteId === "string" ? spec.paletteId.trim() : "";
        label = typeof spec.label === "string" ? spec.label.trim() : "";
        rawOptions = spec.options;
        required = spec.required === true;
        if (requestedType === "") {
          throw invalidSuggestion(`Offer value JSON has no paletteId. Offer value: ${excerpt}`);
        }
      } else {
        const match = OFFER_VALUE_PATTERN.exec(rawValue);
        if (!match) {
          throw invalidSuggestion(
            `Offer value is neither "<paletteId>: <label>" nor a JSON field object. Offer value: ${excerpt}`
          );
        }
        requestedType = match[1];
        label = match[2].trim();
      }

      // Exact match, case-insensitive - never a nearest guess. The canonical id
      // is returned so the caller can hand it straight to createField().
      const paletteId = paletteIds.find((id) => id.toLowerCase() === requestedType.toLowerCase());
      if (!paletteId) {
        throw invalidSuggestion(
          `Unknown field type "${shorten(requestedType, 40)}" - allowed: ${paletteIds.join("|")}. ` +
            `Offer value: ${excerpt}`
        );
      }

      if (label.length === 0 || label.length > LABEL_LIMIT) {
        throw invalidSuggestion(
          `Field label must be 1-${LABEL_LIMIT} characters, got ${label.length}. Offer value: ${excerpt}`
        );
      }
      const duplicate = existingLabels.some(
        (existing) => typeof existing === "string" && existing.trim().toLowerCase() === label.toLowerCase()
      );
      if (duplicate) {
        throw invalidSuggestion(`The form already has a field labelled "${label}". Offer value: ${excerpt}`);
      }

      const offered = typeof offer.summary === "string" ? offer.summary.trim() : "";
      if (offered === "") {
        throw invalidSuggestion(`The offer is missing its summary. Offer value: ${excerpt}`);
      }

      // Fail-closed, and said out loud: a field whose answer choices did not
      // survive is still a usable field, but the human reads why it arrived
      // without them rather than discovering it after the click.
      const { options, notice } = normalizeFieldOptions(rawOptions, {
        allowed: paletteTakesOptions(paletteId)
      });
      const summary = notice === "" ? offered : `${offered} ${notice}`;

      return { paletteId, label, options, required, summary, message, rawValue };
    }
  };
}
