// New Cowork Protocol challenge work: wires the Builder canvas (form-builder.mjs)
// into the SAME offer -> human click -> authorization -> verified receipt path
// the existing FormBuilder field capabilities already use. No new WebMCP tool
// is introduced; this only adds three new capability ids (form-add-field,
// form-update-field, form-move-field) that the existing generic
// cowork_offer_action / cowork_execute_solo-style tools can carry. See
// ../INTEGRATION.md for the full contract this file implements.

import {
  authorizeActionOffer,
  createActionOffer,
  createActionReceipt,
  CoworkProtocolError
} from "../../../packages/core/src/index.js";
import {
  BUILDER_CANVAS_TARGET_ID,
  buildFormBuilderCanvasFocus,
  buildFormBuilderFieldFocus,
  builderFieldTargetId,
  planAuthorizedBuilderFieldMutation
} from "../../../packages/formbuilder-connector/src/index.js";
import { insertField, moveField, updateField } from "./form-builder.mjs";

const OFFER_LIFETIME_MS = 60_000;
const MAX_PENDING_OFFERS = 3;
const MAX_RECEIPTS = 10;

export { BUILDER_CANVAS_TARGET_ID, builderFieldTargetId };

/**
 * A small, self-contained Cowork integration for one Builder canvas. It owns
 * only offers and receipts for the three builder capabilities; the caller
 * owns the actual field list (`getElements`/`setElements`) and its own
 * page-version counter, exactly like the existing FormBuilder field wiring in
 * app.js owns the DOM control it mutates.
 */
export function createBuilderCoworkBridge({ sessionId = "formbuilder-showcase-builder" } = {}) {
  let offers = [];
  let receipts = [];
  let offerCounter = 0;

  function focusFor({ pageVersion, fieldCount }) {
    return buildFormBuilderCanvasFocus({ sessionId, pageVersion, fieldCount });
  }

  /** Focus on one addressable field ("question three"), not the whole canvas.
   *  See GAP-00: before this, every builder offer targeted the canvas, so a
   *  model could point at the form but never at one field. */
  function focusForField({ pageVersion, fieldId, label, focusKind }) {
    return buildFormBuilderFieldFocus({ sessionId, pageVersion, fieldId, label, focusKind });
  }

  function expireOffers(nowIso) {
    const nowMs = Date.parse(nowIso);
    offers = offers.filter((offer) => Date.parse(offer.expiresAt) > nowMs);
  }

  function pendingOffers(nowIso) {
    expireOffers(nowIso);
    return [...offers];
  }

  /** `targetId` must be the exact focus target the offer is about:
   *  BUILDER_CANVAS_TARGET_ID for form-add-field, or
   *  builderFieldTargetId(fieldId) for form-update-field/form-move-field. The
   *  bridge does not guess it from the capability id - the caller already
   *  knows which field (or the canvas) it is proposing a change for. */
  function proposeOffer({ capabilityId, targetId, proposedArguments, summary, pageVersion, now = new Date().toISOString() }) {
    expireOffers(now);
    if (offers.length >= MAX_PENDING_OFFERS) {
      throw new CoworkProtocolError(
        "CONTEXT_BUDGET_EXCEEDED",
        "Resolve an existing builder offer before adding another"
      );
    }
    offerCounter += 1;
    const offer = createActionOffer({
      offerId: `builder-offer-${Date.now()}-${offerCounter}`,
      capabilityId,
      targetId,
      pageVersion,
      proposedArguments,
      summary,
      effect: "mutate",
      undoAvailable: true,
      expiresAt: new Date(Date.parse(now) + OFFER_LIFETIME_MS).toISOString()
    });
    offers = [...offers, offer];
    return offer;
  }

  /**
   * Applies one builder offer. Must be called only from a trusted human click
   * handler (`event.isTrusted === true`), exactly like `executeOffer` in
   * app.js requires for the existing field-value offers. Returns the next
   * elements array (unchanged if verification failed) and the receipt.
   */
  function authorizeAndApply({ offerId, elements, currentPageVersion, now = new Date().toISOString() }) {
    const offer = offers.find((candidate) => candidate.offerId === offerId);
    if (!offer) {
      throw new CoworkProtocolError("STALE_FOCUS", "The offered builder change no longer exists");
    }
    const authorization = authorizeActionOffer({
      offer,
      event: {
        origin: "human-click",
        offerId: offer.offerId,
        targetId: offer.targetId,
        // The click reports the canvas's page version *right now*; if the
        // canvas changed since the offer was shown, this will not equal
        // offer.pageVersion and authorizeActionOffer fails closed below.
        pageVersion: currentPageVersion ?? offer.pageVersion,
        arguments: offer.proposedArguments
      },
      now
    });
    const plan = planAuthorizedBuilderFieldMutation({ offer, authorization, currentElements: elements });

    let nextElements = elements;
    let verified = false;
    let verificationSummary = "Builder change could not be verified";
    try {
      if (plan.operation === "add-field") {
        nextElements = insertField(elements, plan.field, plan.index);
        verified = nextElements.some((element) => element.id === plan.field.id);
        verificationSummary = verified
          ? `Field "${plan.field.label}" added to the canvas`
          : verificationSummary;
      } else if (plan.operation === "update-field") {
        nextElements = updateField(elements, plan.fieldId, plan.patch);
        const updated = nextElements.find((element) => element.id === plan.fieldId);
        verified = Object.entries(plan.patch).every(
          ([key, value]) => JSON.stringify(updated?.[key]) === JSON.stringify(value)
        );
        verificationSummary = verified ? "Field updated" : verificationSummary;
      } else {
        const beforeIndex = elements.findIndex((element) => element.id === plan.fieldId);
        nextElements = moveField(elements, plan.fieldId, plan.direction);
        const afterIndex = nextElements.findIndex((element) => element.id === plan.fieldId);
        verified =
          plan.direction === "up" ? afterIndex === beforeIndex - 1 : afterIndex === beforeIndex + 1;
        verificationSummary = verified ? `Field moved ${plan.direction}` : verificationSummary;
      }
    } catch (error) {
      nextElements = elements;
      verificationSummary = error.message;
    }

    const receipt = createActionReceipt({
      offerId: offer.offerId,
      verified,
      observedChangeIds: [],
      verificationSummary,
      undoAvailable: plan.undoAvailable,
      pageVersion: offer.pageVersion
    });
    offers = offers.filter((candidate) => candidate.offerId !== offer.offerId);
    receipts = [...receipts, receipt].slice(-MAX_RECEIPTS);
    return { elements: verified ? nextElements : elements, receipt };
  }

  return {
    focusFor,
    focusForField,
    pendingOffers,
    proposeOffer,
    authorizeAndApply,
    readReceipts: () => [...receipts]
  };
}
