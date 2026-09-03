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

const TRANSCRIPT_LIMIT = 350;
const LABEL_LIMIT = 120;
const ERROR_EXCERPT_LIMIT = 120;
const ADD_FIELD_CAPABILITY_ID = "form-add-field";
const CANVAS_TARGET_ID = "form-canvas";
const OFFER_VALUE_PATTERN = /^\s*([a-z0-9-]+)\s*:\s*(.+?)\s*$/i;

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
    `Suggest exactly one new form field, as one offer: capabilityId "${ADD_FIELD_CAPABILITY_ID}", ` +
      `targetId "${CANVAS_TARGET_ID}", value "<paletteId>: <label>", plus summary. ` +
      `Types: ${paletteIds.join("|")}.`
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
      const match = OFFER_VALUE_PATTERN.exec(rawValue);
      if (!match) {
        throw invalidSuggestion(`Offer value is not "<paletteId>: <label>". Offer value: ${excerpt}`);
      }

      // Exact match, case-insensitive - never a nearest guess. The canonical id
      // is returned so the caller can hand it straight to createField().
      const paletteId = paletteIds.find((id) => id.toLowerCase() === match[1].toLowerCase());
      if (!paletteId) {
        throw invalidSuggestion(
          `Unknown field type "${shorten(match[1], 40)}" - allowed: ${paletteIds.join("|")}. ` +
            `Offer value: ${excerpt}`
        );
      }

      const label = match[2].trim();
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

      const summary = typeof offer.summary === "string" ? offer.summary.trim() : "";
      if (summary === "") {
        throw invalidSuggestion(`The offer is missing its summary. Offer value: ${excerpt}`);
      }

      return { paletteId, label, summary, message, rawValue };
    }
  };
}
