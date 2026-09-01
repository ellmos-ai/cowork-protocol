// New Cowork Protocol challenge work: the DOM glue between the cowork-free
// builder-view.js controller and the builder-cowork.js bridge. This is the
// only file that renders builder offer chips and receipts; app.js just calls
// initBuilderCoworkUi() once both pieces exist. See ../INTEGRATION.md.

import { createField } from "./form-builder.mjs";
import { BUILDER_CANVAS_TARGET_ID, builderFieldTargetId, createBuilderCoworkBridge } from "./builder-cowork.js";

const SUGGESTABLE_FIELDS = [
  { paletteId: "text-short", label: "Email address" },
  { paletteId: "text-short", label: "Phone number" },
  { paletteId: "text-long", label: "Additional comments" },
  { paletteId: "date", label: "Preferred date" }
];

function describeBuilderOffer(offer) {
  const args = offer.proposedArguments;
  if (offer.capabilityId === "form-add-field") {
    return `Add "${args.field.label}" (${args.field.type})`;
  }
  if (offer.capabilityId === "form-update-field") {
    const [key, value] = Object.entries(args.patch)[0] ?? [];
    return `Set ${key} = ${JSON.stringify(value)} on the target field`;
  }
  return `Move field ${args.direction}`;
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
  $("#builder-field-list").addEventListener("pointerover", (event) => {
    const row = delegatedRowTarget(event);
    if (row) setFocusedField(row.dataset.fieldId);
  });
  $("#builder-field-list").addEventListener("focusin", (event) => {
    const row = delegatedRowTarget(event);
    if (row) setFocusedField(row.dataset.fieldId);
  });
  $("#builder-field-list").addEventListener("click", (event) => {
    const row = delegatedRowTarget(event);
    if (row) setFocusedField(row.dataset.fieldId);
  });

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
      $("#builder-status").textContent = `${error.code ?? "ERROR"}: ${error.message}`;
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
      $("#builder-status").textContent = `${error.code ?? "ERROR"}: ${error.message}`;
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

  controller.onPageVersionChange(() => {
    if (focusedFieldId && !focusedElement()) setFocusedField(null);
    renderOffers();
  });
  renderOffers();
  renderReceipts();

  return { bridge };
}
