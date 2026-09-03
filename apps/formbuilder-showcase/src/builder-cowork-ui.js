// New Cowork Protocol challenge work: the DOM glue between the cowork-free
// builder-view.js controller and the builder-cowork.js bridge. This is the
// only file that renders builder offer chips and receipts; app.js just calls
// initBuilderCoworkUi() once both pieces exist. See ../INTEGRATION.md.

import { classificationDisplayName, classificationOf, createField } from "./form-builder.mjs";
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

function describeBuilderOffer(offer) {
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

function describeError(error) {
  return `${error.code ?? "ERROR"}: ${error.message}`;
}

export function initBuilderCoworkUi({ root = document, controller }) {
  const $ = (selector) => root.querySelector(selector);
  const bridge = createBuilderCoworkBridge();
  let focusedFieldId = null;

  // --- GAP-00: an attention lens for one addressable builder field, not just
  // the whole canvas. One delegated listener covers every row, including
  // ones added or removed after this runs. ---
  function setFocusedField(fieldId) {
    focusedFieldId = fieldId;
    for (const row of root.querySelectorAll("#builder-field-list .form-field")) {
      row.classList.toggle("is-focused", row.dataset.fieldId === fieldId);
    }
    const target = fieldId
      ? root.querySelector(`#builder-field-list .form-field[data-field-id="${CSS.escape(fieldId)}"]`)
      : null;
    $("#builder-focus-label").textContent = target
      ? `Pointing at: ${target.dataset.label}`
      : "Point to or select a builder field";
  }

  function focusedElement() {
    if (!focusedFieldId) return null;
    return controller.getElements().find((element) => element.id === focusedFieldId) ?? null;
  }

  function delegatedRowTarget(event) {
    return event.target.closest(".form-field[data-field-id]");
  }
  // pointerover bubbles (unlike pointerenter), so one listener on the list
  // container covers every row, including ones added or removed later.
  const focusFromEvent = (event) => {
    const row = delegatedRowTarget(event);
    if (row) setFocusedField(row.dataset.fieldId);
  };
  for (const type of ["pointerover", "focusin", "click"]) {
    $("#builder-field-list").addEventListener(type, focusFromEvent);
  }

  function renderOffers() {
    const now = new Date().toISOString();
    const currentPageVersion = controller.getPageVersion();
    const offers = bridge.pendingOffers(now).filter((offer) => offer.pageVersion === currentPageVersion);
    const list = $("#builder-offer-list");
    list.textContent = "";
    if (offers.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "Model proposals will appear here as clickable offers.";
      list.append(empty);
      return;
    }
    for (const offer of offers) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "offer-chip";
      const copy = document.createElement("span");
      const strong = document.createElement("strong");
      strong.textContent = offer.summary;
      const detail = document.createElement("span");
      detail.textContent = describeBuilderOffer(offer);
      copy.append(strong, detail);
      button.append(copy);
      button.addEventListener("click", (event) => applyOffer(event, offer.offerId));
      list.append(button);
    }
  }

  function renderReceipts() {
    const list = $("#builder-receipt-list");
    list.textContent = "";
    for (const receipt of bridge.readReceipts().slice(-4).reverse()) {
      const item = document.createElement("li");
      item.className = receipt.status === "failed" ? "receipt-failed" : "";
      const status = document.createElement("strong");
      status.textContent = receipt.status === "verified" ? "Verified: " : "Failed: ";
      item.append(status, receipt.verificationSummary);
      list.append(item);
    }
  }

  function applyOffer(event, offerId) {
    if (!event.isTrusted) {
      $("#builder-status").textContent = "HUMAN_CONFIRMATION_REQUIRED: synthetic clicks are rejected.";
      return;
    }
    try {
      const result = bridge.authorizeAndApply({
        offerId,
        elements: controller.getElements(),
        currentPageVersion: controller.getPageVersion(),
        now: new Date().toISOString()
      });
      if (result.receipt.status === "verified") {
        controller.applyElements(result.elements);
      }
      $("#builder-status").textContent =
        result.receipt.status === "verified"
          ? "Model suggestion verified after your click."
          : `VERIFICATION_FAILED: ${result.receipt.verificationSummary}`;
    } catch (error) {
      $("#builder-status").textContent = describeError(error);
    } finally {
      renderOffers();
      renderReceipts();
    }
  }

  function proposeAndRender({ capabilityId, targetId, proposedArguments, summary }) {
    try {
      bridge.proposeOffer({
        capabilityId,
        targetId,
        proposedArguments,
        summary,
        pageVersion: controller.getPageVersion(),
        now: new Date().toISOString()
      });
      $("#builder-status").textContent = "Model proposal added. Only your real click can authorize it.";
    } catch (error) {
      $("#builder-status").textContent = describeError(error);
    }
    renderOffers();
  }

  /** The field the model would act on: whatever is currently pointed at
   *  (GAP-00), falling back to the last field so the demo buttons still work
   *  before anyone has pointed at anything. */
  function targetFieldOrLast() {
    return focusedElement() ?? controller.getElements().at(-1) ?? null;
  }

  $("#builder-suggest-add").addEventListener("click", () => {
    const existingLabels = new Set(controller.getElements().map((element) => element.label));
    const suggestion =
      SUGGESTABLE_FIELDS.find((candidate) => !existingLabels.has(candidate.label)) ?? SUGGESTABLE_FIELDS[0];
    const field = createField(suggestion.paletteId, { label: suggestion.label });
    proposeAndRender({
      capabilityId: "form-add-field",
      targetId: BUILDER_CANVAS_TARGET_ID,
      proposedArguments: { field },
      summary: `Add a "${field.label}" field`
    });
  });

  $("#builder-suggest-rename").addEventListener("click", () => {
    const target = targetFieldOrLast();
    if (!target) return;
    proposeAndRender({
      capabilityId: "form-update-field",
      targetId: builderFieldTargetId(target.id),
      proposedArguments: { fieldId: target.id, patch: { required: !target.required } },
      summary: `Mark "${target.label}" as ${target.required ? "optional" : "required"}`
    });
  });

  $("#builder-suggest-move").addEventListener("click", () => {
    const elements = controller.getElements();
    const target = targetFieldOrLast();
    if (!target || elements.length < 2) return;
    proposeAndRender({
      capabilityId: "form-move-field",
      targetId: builderFieldTargetId(target.id),
      proposedArguments: { fieldId: target.id, direction: "up" },
      summary: `Move "${target.label}" earlier in the form`
    });
  });

  // --- GAP-01/GAP-04: a presence-independent, container-scoped delegation
  // that can draft several new fields, one call at a time or as a batch. ---
  let soloCallsUsed = 0;

  function renderDelegationState() {
    const grant = bridge.readActiveGrant();
    const active = grant !== null;
    $("#builder-start-delegation").hidden = active;
    $("#builder-solo-step").hidden = !active;
    $("#builder-solo-batch").hidden = !active;
    $("#builder-end-delegation").hidden = !active;
    // Single-active-grant design: a directive needs its own field-scoped
    // grant, so it is disabled while a canvas delegation is running.
    $("#builder-directive-input").disabled = active;
    $("#builder-directive-send").disabled = active;
    $("#builder-delegate-status").textContent = active
      ? `Delegated: "${grant.goal}" — ${soloCallsUsed}/${grant.maxCalls} action(s) used.`
      : "No delegation is active.";
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

  function renderAwaitingFeedback() {
    $("#builder-return-feedback").hidden = bridge.readAwaitingFeedback() === null;
  }

  $("#builder-start-delegation").addEventListener("click", (event) => {
    // Minting a grant is the highest-value consent in the Builder: only a
    // real click may do it, exactly like applying an offer.
    if (!event.isTrusted) {
      $("#builder-delegate-status").textContent = "HUMAN_CONFIRMATION_REQUIRED: synthetic clicks are rejected.";
      return;
    }
    const goal = $("#builder-delegate-goal").value.trim() || "Draft good follow-up questions";
    const maxCalls = Math.max(1, Math.min(12, Number($("#builder-delegate-max-calls").value) || 6));
    const durationSeconds = Math.max(10, Math.min(600, Number($("#builder-delegate-duration").value) || 120));
    try {
      bridge.startDelegation({
        origin: "human-click",
        goal,
        maxCalls,
        durationMs: durationSeconds * 1000,
        pageVersion: controller.getPageVersion(),
        now: new Date().toISOString()
      });
      soloCallsUsed = 0;
      $("#builder-return-narration").hidden = true;
    } catch (error) {
      $("#builder-delegate-status").textContent = describeError(error);
    }
    renderDelegationState();
  });

  function soloDraftOne(humanPresence) {
    if (!bridge.readActiveGrant()) return false;
    const field = createField("text-short", { label: DRAFT_QUESTIONS[soloCallsUsed % DRAFT_QUESTIONS.length] });
    try {
      const result = bridge.soloExecute({
        field,
        elements: controller.getElements(),
        humanPresence,
        currentPageVersion: controller.getPageVersion(),
        now: new Date().toISOString()
      });
      if (result.receipt.status === "verified") {
        controller.applyElements(result.elements);
        soloCallsUsed += 1;
      }
      renderReceipts();
      renderDelegationState();
      return result.receipt.status === "verified";
    } catch (error) {
      $("#builder-delegate-status").textContent = describeError(error);
      return false;
    }
  }

  $("#builder-solo-step").addEventListener("click", () => {
    // GAP-01: this authorizes exactly the same way whether the human is
    // sitting right here watching or has stepped away - presence is not
    // consulted by the grant this calls into.
    soloDraftOne("present");
  });

  $("#builder-solo-batch").addEventListener("click", async () => {
    const button = $("#builder-solo-batch");
    button.disabled = true;
    try {
      while (true) {
        const grant = bridge.readActiveGrant();
        if (!grant || soloCallsUsed >= grant.maxCalls) break;
        const ok = soloDraftOne("afk-short");
        if (!ok) break;
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
    } finally {
      button.disabled = false;
    }
  });

  $("#builder-end-delegation").addEventListener("click", () => {
    try {
      const { delta, focusSet } = bridge.endDelegation({
        pageVersion: controller.getPageVersion(),
        now: new Date().toISOString()
      });
      soloCallsUsed = 0;
      const narration = $("#builder-return-narration");
      narration.hidden = false;
      narration.textContent = `Welcome back — ${delta.summary}`;
      highlightReturnedFields(focusSet);
      renderAwaitingFeedback();
    } catch (error) {
      $("#builder-delegate-status").textContent = describeError(error);
    }
    renderDelegationState();
  });

  for (const button of root.querySelectorAll("#builder-return-feedback button[data-verdict]")) {
    button.addEventListener("click", (event) => {
      if (!event.isTrusted) return;
      try {
        bridge.recordFeedback({
          verdict: button.dataset.verdict,
          pageVersion: controller.getPageVersion(),
          now: new Date().toISOString()
        });
        renderAwaitingFeedback();
        $("#builder-delegate-status").textContent = "Feedback recorded.";
      } catch (error) {
        $("#builder-delegate-status").textContent = describeError(error);
      }
    });
  }

  // --- GAP-02: a human utterance about the pointed-at field authorizes
  // directly - the words are the click - once it is recognized and a
  // field-scoped grant is minted for exactly that instruction. ---
  $("#builder-directive-send").addEventListener("click", (event) => {
    // The Send click is the only trust anchor behind "human-utterance".
    if (!event.isTrusted) {
      $("#builder-directive-status").textContent = "HUMAN_CONFIRMATION_REQUIRED: synthetic clicks are rejected.";
      return;
    }
    const target = focusedElement();
    if (!target) {
      $("#builder-directive-status").textContent = "Point to a field first.";
      return;
    }
    if (bridge.readActiveGrant()) {
      $("#builder-directive-status").textContent = "End the current delegation before sending a directive.";
      return;
    }
    const transcript = $("#builder-directive-input").value;
    const elements = controller.getElements();
    const fieldIndex = elements.findIndex((element) => element.id === target.id);
    const plan = classifyBuilderDirective(transcript, {
      fieldId: target.id,
      fieldIndex,
      required: target.required === true
    });
    if (!plan) {
      $("#builder-directive-status").textContent =
        "Not recognized. Try: make it required / move it up / make this the first question.";
      return;
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
      $("#builder-directive-input").value = "";
      $("#builder-directive-status").textContent =
        lastResult?.receipt.status === "verified"
          ? `Done: ${lastResult.receipt.verificationSummary}. Waiting for your feedback.`
          : `VERIFICATION_FAILED: ${lastResult?.receipt.verificationSummary}`;
      renderAwaitingFeedback();
    } catch (error) {
      $("#builder-directive-status").textContent = describeError(error);
    } finally {
      // The directive's grant is one-shot: consumed by its own steps, never
      // "returned from", so it is released here instead of via endDelegation
      // - otherwise the UI stays in delegation mode with a spent grant.
      bridge.releaseGrant();
      renderReceipts();
    }
    renderDelegationState();
  });

  controller.onPageVersionChange(() => {
    if (focusedFieldId && !focusedElement()) setFocusedField(null);
    renderOffers();
  });
  renderOffers();
  renderReceipts();
  renderDelegationState();

  return { bridge };
}
