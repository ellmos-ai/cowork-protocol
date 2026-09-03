// New Cowork Protocol challenge work: the headless adapter between the
// cowork-free builder-view.js controller and the builder-cowork.js bridge.
// It owns the Builder's attention target, its offers, grants, drafts and
// directives - but renders nothing of its own: the one Cowork panel in
// index.html is the only surface, and app.js drives this from there.
// See ../INTEGRATION.md.

import { classificationDisplayName, classificationOf, createField, FIELD_TYPE_PALETTE } from "./form-builder.mjs";
import { createBuilderModelSuggester } from "./builder-model-suggester.js";
import { BUILDER_CANVAS_TARGET_ID, builderFieldTargetId, createBuilderCoworkBridge } from "./builder-cowork.js";
import { classifyBuilderDirective } from "./builder-directive-classifier.js";

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
 */
export function initBuilderCowork({ root = document, controller, modelSeat = null, onFocusChange = () => {} }) {
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

  // --- GAP-00: an attention lens for one addressable builder field, not just
  // the whole canvas. One delegated listener covers every row, including
  // ones added or removed after this runs. ---
  function setFocusedField(fieldId) {
    const changed = focusedFieldId !== fieldId;
    focusedFieldId = fieldId;
    for (const row of root.querySelectorAll("#builder-field-list .form-field")) {
      row.classList.toggle("is-focused", row.dataset.fieldId === fieldId);
    }
    if (changed) onFocusChange(readFocus());
  }

  function focusedElement() {
    if (!focusedFieldId) return null;
    return controller.getElements().find((element) => element.id === focusedFieldId) ?? null;
  }

  function readFocus() {
    const element = focusedElement();
    return element === null ? null : { fieldId: element.id, label: element.label };
  }

  // pointerover bubbles (unlike pointerenter), so one listener on the list
  // container covers every row, including ones added or removed later.
  const focusFromEvent = (event) => {
    const row = event.target.closest(".form-field[data-field-id]");
    if (row) setFocusedField(row.dataset.fieldId);
  };
  for (const type of ["pointerover", "focusin", "click"]) {
    root.querySelector("#builder-field-list").addEventListener(type, focusFromEvent);
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
      const summary = `Add a "${field.label}" field`;
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
    const field = createField(suggestion.paletteId, { label: suggestion.label });
    const summary = suggestion.summary || `Add a "${field.label}" field`;
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
      field = createField(suggestion.paletteId, { label: suggestion.label });
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

  controller.onPageVersionChange(() => {
    if (focusedFieldId && !focusedElement()) setFocusedField(null);
  });

  return {
    bridge,
    readFocus,
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
