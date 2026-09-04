// New Cowork Protocol challenge work: the headless adapter between the
// cowork-free builder-view.js controller and the builder-cowork.js bridge.
// It owns the Builder's attention target, its offers, grants, drafts and
// directives - but renders nothing of its own: the one Cowork panel in
// index.html is the only surface, and app.js drives this from there.
// See ../INTEGRATION.md.

import { classificationDisplayName, classificationOf, createField, FIELD_TYPE_PALETTE } from "./form-builder.mjs";
import {
  createBuilderModelSuggester,
  normalizeFieldOptions,
  paletteTakesOptions,
  parseFieldValueJson
} from "./builder-model-suggester.js";
import { addFieldSummary, BUILDER_CANVAS_TARGET_ID, builderFieldTargetId, createBuilderCoworkBridge } from "./builder-cowork.js";
import { classifyBuilderDirective } from "./builder-directive-classifier.js";
import { buildContextExpansion, CoworkProtocolError } from "../../../packages/core/src/index.js";
import { buildFormBuilderContextExpansion } from "../../../packages/formbuilder-connector/src/index.js";

/** One field from a model suggestion or an agent's JSON value. createField
 *  owns the shape; `required` is applied on top because a newly created field
 *  is never required by default. */
function fieldFrom({ paletteId, label, options, required }) {
  const field = createField(paletteId, options ? { label, options } : { label });
  return required === true ? { ...field, required: true } : field;
}

const SUGGESTABLE_FIELDS = [
  { paletteId: "text-short", label: "Email address" },
  { paletteId: "text-short", label: "Phone number" },
  { paletteId: "text-long", label: "Additional comments" },
  { paletteId: "date", label: "Preferred date" }
];

// GAP-01/GAP-04 demo content: what "the model drafts alone" actually drafts.
// A disclosed, fixed list - not language generation - matching Susan's own
// stated survey topic (family free time) rather than a generic placeholder.
const DRAFT_QUESTIONS = [
  "What does your family enjoy doing together?",
  "How much free time do you spend together on weekends?",
  "What new activities would your family like to try?",
  "Who usually plans your family's free time?",
  "What is a favorite shared family memory?",
  "What would make your family time even better?"
];

export function describeBuilderOffer(offer) {
  const args = offer.proposedArguments;
  if (offer.capabilityId === "form-add-field") {
    // GAP-08: the kind badge, not the raw schema typeString.
    return `Add "${args.field.label}" (${classificationDisplayName(classificationOf(args.field))})`;
  }
  if (offer.capabilityId === "form-update-field") {
    const [key, value] = Object.entries(args.patch)[0] ?? [];
    return `Set ${key} = ${JSON.stringify(value)} on the target field`;
  }
  return `Move field ${args.direction}`;
}

/**
 * Wires the Builder canvas to the Cowork bridge without rendering anything:
 * app.js reads offers, receipts, grants and focus from here and shows them in
 * the one Cowork panel.
 *
 * @param onFocusChange called with `{ fieldId, label } | null` whenever the
 *        pointed-at Builder field changes, so the panel's attention lens can
 *        follow the Studio canvas the same way it follows the demo form.
 * @param attentionOn asked before every pointer, focus or click target: with
 *        the panel's attention switched off, the Studio must go as quiet as
 *        the demo form does, highlight included.
 */
export function initBuilderCowork({
  root = document,
  controller,
  modelSeat = null,
  onFocusChange = () => {},
  attentionOn = () => true
}) {
  const bridge = createBuilderCoworkBridge();
  let focusedFieldId = null;
  let callsUsed = 0;
  // One seat for the whole Builder (see model-seat.js): Demo on -> the disclosed
  // fixed lists above; Demo off -> the page's connected model through
  // builder-model-suggester.js, or nothing at all. Never a silent mix of both.
  const paletteIds = FIELD_TYPE_PALETTE.map((entry) => entry.paletteId);
  const suggester =
    modelSeat === null
      ? null
      : createBuilderModelSuggester({ sendTurn: (turn) => modelSeat.sendTurn(turn), paletteIds });

  function seatState() {
    if (modelSeat === null) return { kind: "demo", demo: true, label: "Demo helper" };
    const seat = modelSeat.resolve();
    return { kind: seat.kind, demo: seat.kind === "demo", label: seat.label };
  }

  function requireSeat() {
    const seat = seatState();
    if (!seat.demo && seat.kind === "none") {
      throw new Error("NO_MODEL_CONNECTED: connect your model in the Model seat above, or switch Demo mode on.");
    }
    return seat;
  }

  function presenceFor(humanPresence) {
    return {
      humanPresence,
      agentPresence: "active",
      mode: humanPresence === "present" ? "cowork" : "agent-solo"
    };
  }

  // --- GAP-00: an attention lens for one addressable builder field, and for
  // the canvas itself when the pointer is on Studio chrome rather than a
  // field. The canvas needs to be a target of its own: on a fresh page the
  // Studio holds no rows at all, so a rows-only lens left the whole left-hand
  // canvas dead to the panel while the fixed sample form - populated from the
  // first paint - looked like the only surface the panel follows. ---
  const CANVAS_FOCUS = BUILDER_CANVAS_TARGET_ID;

  function setFocusedField(fieldId) {
    const changed = focusedFieldId !== fieldId;
    focusedFieldId = fieldId;
    for (const row of root.querySelectorAll("#builder-field-list .form-field")) {
      row.classList.toggle("is-focused", row.dataset.fieldId === fieldId);
    }
    if (changed) onFocusChange(readFocus());
  }

  function focusedElement() {
    if (focusedFieldId === null || focusedFieldId === CANVAS_FOCUS) return null;
    return controller.getElements().find((element) => element.id === focusedFieldId) ?? null;
  }

  function readFocus() {
    if (focusedFieldId === null) return null;
    // The canvas names itself by the form's own title, so the readout stays
    // truthful on an empty Studio and on the Export tab, where no field exists.
    if (focusedFieldId === CANVAS_FOCUS) return { fieldId: null, label: controller.getTitle() };
    const element = focusedElement();
    return element === null ? null : { fieldId: element.id, label: element.label };
  }

  // pointerover bubbles (unlike pointerenter), so one listener on the Studio
  // section covers every Build row AND every Fill field - including ones added
  // or removed later - plus the chrome between them. Scoping this to
  // #builder-field-list was the actual defect behind "the pointer is only
  // followed on the sample form".
  const focusFromEvent = (event) => {
    if (!attentionOn()) return;
    const target = event.target.closest("[data-field-id]");
    if (target) {
      setFocusedField(target.dataset.fieldId);
      return;
    }
    // Studio chrome: title, palette, empty canvas, Export tab. A click there
    // is deliberate and always retargets. Merely sweeping the pointer across
    // it must not, or the field a human is working on would be dropped on the
    // way to the panel that acts on it (GAP-02 directives read this focus).
    if (event.type === "click" || focusedFieldId === null) setFocusedField(CANVAS_FOCUS);
  };
  const studioSurface = root.querySelector(".builder-studio");
  for (const type of ["pointerover", "focusin", "click"]) {
    studioSurface.addEventListener(type, focusFromEvent);
  }

  function pendingOffers() {
    const currentPageVersion = controller.getPageVersion();
    return bridge
      .pendingOffers(new Date().toISOString())
      .filter((offer) => offer.pageVersion === currentPageVersion);
  }

  function applyOffer(offerId) {
    const result = bridge.authorizeAndApply({
      offerId,
      elements: controller.getElements(),
      currentPageVersion: controller.getPageVersion(),
      now: new Date().toISOString()
    });
    if (result.receipt.status === "verified") controller.applyElements(result.elements);
    return result.receipt;
  }

  function proposeField(field, summary) {
    bridge.proposeOffer({
      capabilityId: "form-add-field",
      targetId: BUILDER_CANVAS_TARGET_ID,
      proposedArguments: { field },
      summary,
      pageVersion: controller.getPageVersion(),
      now: new Date().toISOString()
    });
  }

  /** The Builder's answer to a conversation turn: one proposed field, offered
   *  into the panel's offer list and inert until a real click. `goal` carries
   *  the human's own words when they typed or spoke them, empty for the
   *  panel's demo button. */
  async function suggestField(goal = "") {
    const seat = requireSeat();
    if (seat.demo) {
      const existingLabels = new Set(controller.getElements().map((element) => element.label));
      const suggestion =
        SUGGESTABLE_FIELDS.find((candidate) => !existingLabels.has(candidate.label)) ?? SUGGESTABLE_FIELDS[0];
      const field = createField(suggestion.paletteId, { label: suggestion.label });
      const summary = addFieldSummary(field.label);
      proposeField(field, summary);
      return summary;
    }
    const suggestion = await suggester.suggestField({
      intent: "field",
      formTitle: controller.getTitle(),
      existingLabels: controller.getElements().map((element) => element.label),
      ...(goal ? { goal } : {}),
      presence: presenceFor("present")
    });
    const field = fieldFrom(suggestion);
    const summary = suggestion.summary || addFieldSummary(field.label);
    proposeField(field, summary);
    return summary;
  }

  // --- GAP-01/GAP-04: a presence-independent, canvas-scoped delegation that
  // can draft several new fields, one call at a time or as a batch. ---
  function startGrant({ goal, maxCalls, durationMs }) {
    const grant = bridge.startDelegation({
      origin: "human-click",
      goal,
      maxCalls,
      durationMs,
      pageVersion: controller.getPageVersion(),
      now: new Date().toISOString()
    });
    callsUsed = 0;
    return grant;
  }

  /** One drafted field under the active grant - no offer, no click. Identical
   *  whether the human stays and watches or has stepped away: the grant, not
   *  presence, is what authorizes it (GAP-01). */
  async function draftOne(humanPresence) {
    const grant = bridge.readActiveGrant();
    if (!grant) return false;
    const seat = requireSeat();
    let field;
    if (seat.demo) {
      field = createField("text-short", { label: DRAFT_QUESTIONS[callsUsed % DRAFT_QUESTIONS.length] });
    } else {
      const suggestion = await suggester.suggestField({
        intent: "question",
        formTitle: controller.getTitle(),
        existingLabels: controller.getElements().map((element) => element.label),
        goal: grant.goal,
        presence: presenceFor(humanPresence)
      });
      field = fieldFrom(suggestion);
    }
    const result = bridge.soloExecute({
      field,
      elements: controller.getElements(),
      humanPresence,
      currentPageVersion: controller.getPageVersion(),
      now: new Date().toISOString()
    });
    if (result.receipt.status !== "verified") return false;
    controller.applyElements(result.elements);
    callsUsed += 1;
    return true;
  }

  /** Drafts until the grant's budget is spent - what "the model works alone
   *  while you are away" means in practice. Returns how many landed. */
  async function draftBatch(humanPresence) {
    let drafted = 0;
    while (true) {
      const grant = bridge.readActiveGrant();
      if (!grant || callsUsed >= grant.maxCalls) break;
      if (!(await draftOne(humanPresence))) break;
      drafted += 1;
    }
    return drafted;
  }

  function highlightReturnedFields(focusSet) {
    for (const row of root.querySelectorAll("#builder-field-list .form-field")) {
      row.classList.remove("is-new-since-handover");
    }
    if (!focusSet) return;
    for (const targetId of focusSet.targetIds) {
      const fieldId = targetId.replace(/^form-field:/, "");
      root
        .querySelector(`#builder-field-list .form-field[data-field-id="${CSS.escape(fieldId)}"]`)
        ?.classList.add("is-new-since-handover");
    }
  }

  // --- GAP-03: a bounded return summary plus a multi-field highlight. ---
  function endGrant() {
    const { delta, focusSet } = bridge.endDelegation({
      pageVersion: controller.getPageVersion(),
      now: new Date().toISOString()
    });
    callsUsed = 0;
    highlightReturnedFields(focusSet);
    return delta;
  }

  // --- GAP-02: a human utterance about the pointed-at field authorizes
  // directly - the words are the click - once it is recognized and a
  // field-scoped grant is minted for exactly that instruction. Returns null
  // when nothing was recognized, so the caller can fall back to a normal
  // conversation turn. ---
  function directive(transcript) {
    const target = focusedElement();
    if (!target) return null;
    const elements = controller.getElements();
    const plan = classifyBuilderDirective(transcript, {
      fieldId: target.id,
      fieldIndex: elements.findIndex((element) => element.id === target.id),
      required: target.required === true
    });
    if (!plan) return null;
    if (bridge.readActiveGrant()) {
      throw new Error("A delegation is running. Come back first, then give a direct instruction.");
    }
    try {
      bridge.startDelegation({
        origin: "human-utterance",
        goal: transcript,
        maxCalls: plan.steps.length,
        durationMs: 15_000,
        pageVersion: controller.getPageVersion(),
        allowedCapabilityIds: [plan.capabilityId],
        allowedTargetIds: [builderFieldTargetId(target.id)],
        now: new Date().toISOString()
      });
      let currentElements = elements;
      let lastResult = null;
      for (const step of plan.steps) {
        lastResult = bridge.directiveFromUtterance({
          capabilityId: plan.capabilityId,
          targetId: builderFieldTargetId(target.id),
          proposedArguments: step.proposedArguments,
          summary: transcript,
          pageVersion: controller.getPageVersion(),
          elements: currentElements,
          now: new Date().toISOString()
        });
        if (lastResult.receipt.status !== "verified") break;
        currentElements = lastResult.elements;
      }
      controller.applyElements(currentElements);
      return lastResult.receipt;
    } finally {
      // The directive's grant is one-shot: consumed by its own steps, never
      // "returned from", so it is released here instead of via endGrant.
      bridge.releaseGrant();
    }
  }

  // --- The Studio through the page's WebMCP tools. The fixed sample form has
  // answered cowork_read_focus / cowork_request_context / cowork_offer_action
  // since day one; the Studio - the product surface - answered STALE_FOCUS to
  // all three even while the panel's own lens was pointing at it, so an agent
  // (or the extension reading through those tools) could follow the human on
  // the sample form only. These three are the Studio's side of the same
  // contract, on the same target ids the panel already shows. ---
  function readFocusPacket() {
    if (focusedFieldId === null) return null;
    const pageVersion = controller.getPageVersion();
    if (focusedFieldId === CANVAS_FOCUS) {
      return bridge.focusFor({ pageVersion, fieldCount: controller.getElements().length });
    }
    const element = focusedElement();
    if (element === null) return null;
    return bridge.focusForField({ pageVersion, fieldId: element.id, label: element.label });
  }

  function requireFocusPacket() {
    const focusPacket = readFocusPacket();
    if (focusPacket === null) {
      throw new CoworkProtocolError("STALE_FOCUS", "Point at the Studio canvas or one of its fields first");
    }
    return focusPacket;
  }

  function requestContext({ reason } = {}) {
    const focusPacket = requireFocusPacket();
    if (focusPacket.targetId === CANVAS_FOCUS) {
      const elements = controller.getElements();
      return buildContextExpansion({
        focusPacket,
        currentLevel: 2,
        requestedLevel: 3,
        reason,
        relatedContext: JSON.stringify({
          title: controller.getTitle(),
          fieldCount: elements.length,
          labels: elements.map((element) => element.label)
        })
      });
    }
    const element = focusedElement();
    return buildFormBuilderContextExpansion({
      focusPacket,
      fieldId: element.id,
      label: element.label,
      controlKind: classificationDisplayName(classificationOf(element)),
      required: element.required === true,
      helpText: "",
      options: element.options ?? [],
      reason
    });
  }

  /** An agent's cowork_offer_action aimed at the Studio. The tool carries one
   *  string, `value`. For form-add-field that is either the new field's label,
   *  optionally prefixed with a palette id ("date: Preferred date"), or a JSON
   *  object {"paletteId","label","options","required"} when the field needs
   *  answer choices - a label cannot carry them, and a model that tries ends
   *  up writing "How many kids? (1, 2, 3)" into the question itself. For
   *  form-update-field it is the new label or a JSON patch
   *  {"label","options","required"}; for form-move-field "up" or "down".
   *  The offer is inert until a real click, exactly like the panel's own. */
  function offerFromAgent({ capabilityId, targetId, value, summary }) {
    const focusPacket = requireFocusPacket();
    if (targetId !== focusPacket.targetId) {
      throw new CoworkProtocolError("STALE_FOCUS", "Offer target is not the current focus");
    }
    if (!focusPacket.capabilityIds.includes(capabilityId)) {
      throw new CoworkProtocolError("CAPABILITY_UNAVAILABLE", "Capability is not available for the focused target");
    }
    const text = typeof value === "string" ? value.trim() : "";
    if (text === "") throw new CoworkProtocolError("INVALID_ARGUMENTS", "The offer needs a value");
    const spec = parseFieldValueJson(text);
    let noticeText = "";
    let proposedArguments;
    if (capabilityId === "form-add-field") {
      if (spec) {
        const requested = typeof spec.paletteId === "string" ? spec.paletteId.trim() : "";
        const paletteId = paletteIds.includes(requested) ? requested : "text-short";
        const label = typeof spec.label === "string" ? spec.label.trim() : "";
        if (label === "") {
          throw new CoworkProtocolError("INVALID_ARGUMENTS", "The field JSON needs a label");
        }
        const normalized = normalizeFieldOptions(spec.options, { allowed: paletteTakesOptions(paletteId) });
        noticeText = normalized.notice;
        proposedArguments = {
          field: fieldFrom({ paletteId, label, options: normalized.options, required: spec.required === true })
        };
      } else {
        const prefixed = /^([a-z-]+):\s*(.+)$/.exec(text);
        const paletteId = prefixed && paletteIds.includes(prefixed[1]) ? prefixed[1] : "text-short";
        const label = prefixed && paletteIds.includes(prefixed[1]) ? prefixed[2] : text;
        proposedArguments = { field: createField(paletteId, { label }) };
      }
    } else if (capabilityId === "form-update-field") {
      if (spec) {
        // id and type are what a receipt is checked against, so a patch may
        // never carry them - the connector says so here rather than letting
        // form-builder raise it after the human has already clicked.
        const forbidden = ["id", "type"].find((key) => key in spec);
        if (forbidden) {
          throw new CoworkProtocolError(
            "INVALID_ARGUMENTS",
            `A field's ${forbidden} cannot change after it is created`
          );
        }
        const element = focusedElement();
        const normalized = normalizeFieldOptions(spec.options, { allowed: Array.isArray(element?.options) });
        noticeText = normalized.notice;
        const patch = {};
        if (typeof spec.label === "string" && spec.label.trim() !== "") patch.label = spec.label.trim();
        if (typeof spec.required === "boolean") patch.required = spec.required;
        if (normalized.options) patch.options = normalized.options;
        if (Object.keys(patch).length === 0) {
          throw new CoworkProtocolError(
            "INVALID_ARGUMENTS",
            noticeText === "" ? "The patch changes nothing" : `The patch changes nothing. ${noticeText}`
          );
        }
        proposedArguments = { fieldId: focusedFieldId, patch };
      } else {
        proposedArguments = { fieldId: focusedFieldId, patch: { label: text } };
      }
    } else if (capabilityId === "form-move-field") {
      const direction = text.toLowerCase();
      if (direction !== "up" && direction !== "down") {
        throw new CoworkProtocolError("INVALID_ARGUMENTS", "form-move-field value must be up or down");
      }
      proposedArguments = { fieldId: focusedFieldId, direction };
    } else {
      throw new CoworkProtocolError("INVALID_ARGUMENTS", `${capabilityId} is not an offerable change`);
    }
    return bridge.proposeOffer({
      capabilityId,
      targetId,
      proposedArguments,
      summary: noticeText === "" ? summary : `${summary} ${noticeText}`,
      pageVersion: controller.getPageVersion(),
      now: new Date().toISOString()
    });
  }

  controller.onPageVersionChange(() => {
    // Renaming the form changes what the canvas focus is called, so re-read it.
    if (focusedFieldId === CANVAS_FOCUS) onFocusChange(readFocus());
    else if (focusedFieldId !== null && !focusedElement()) setFocusedField(null);
  });

  return {
    bridge,
    readFocus,
    readFocusPacket,
    requestContext,
    offerFromAgent,
    clearFocus: () => setFocusedField(null),
    pendingOffers,
    describeOffer: describeBuilderOffer,
    applyOffer,
    readReceipts: () => bridge.readReceipts(),
    readAwaitingFeedback: () => bridge.readAwaitingFeedback(),
    recordFeedback: (verdict) =>
      bridge.recordFeedback({
        verdict,
        pageVersion: controller.getPageVersion(),
        now: new Date().toISOString()
      }),
    clearReturnHighlights: () => highlightReturnedFields(null),
    suggestField,
    startGrant,
    readActiveGrant: () => bridge.readActiveGrant(),
    readCallsUsed: () => callsUsed,
    draftOne,
    draftBatch,
    endGrant,
    directive
  };
}
