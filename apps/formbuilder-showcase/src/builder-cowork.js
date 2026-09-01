// New Cowork Protocol challenge work: wires the Builder canvas (form-builder.mjs)
// into the SAME offer -> human click -> authorization -> verified receipt path
// the existing FormBuilder field capabilities already use, plus (GAP-01/02/03/04)
// a presence-independent delegation grant, a click-free human-utterance
// directive, and a bounded return-from-handover summary. No new WebMCP tool is
// introduced; capabilities and grants carry all of this through the existing
// generic cowork_offer_action / cowork_execute_solo-style tools. See
// ../INTEGRATION.md for the full contract this file implements.

import {
  authorizeActionOffer,
  buildFocusSet,
  createActionOffer,
  createActionReceipt,
  createDelegationGrant,
  createFeedbackEvent,
  createHandoverDeltaSummary,
  CoworkProtocolError
} from "../../../packages/core/src/index.js";
import {
  BUILDER_CANVAS_TARGET_ID,
  buildFormBuilderCanvasFocus,
  buildFormBuilderFieldFocus,
  builderFieldTargetId,
  planAuthorizedBuilderFieldMutation,
  planSoloBuilderFieldMutation
} from "../../../packages/formbuilder-connector/src/index.js";
import { insertField, moveField, updateField } from "./form-builder.mjs";

const OFFER_LIFETIME_MS = 60_000;
const MAX_PENDING_OFFERS = 3;
const MAX_RECEIPTS = 10;
const MAX_TARGETS_TOUCHED_TRACKED = 20; // generous local buffer; the delta itself caps at 12

export { BUILDER_CANVAS_TARGET_ID, builderFieldTargetId };

/** Applies one already-authorized plan (click, solo, or directive - the
 *  authorization mechanism differs, this part never does) and independently
 *  verifies the result against the actual field list, the same "trust but
 *  verify" shape `executeOffer` in app.js uses for the fixed demo form. */
function applyBuilderPlan(plan, elements) {
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
  const touchedTargetId =
    plan.operation === "add-field" ? plan.field.id : plan.fieldId ?? null;
  return { elements: verified ? nextElements : elements, verified, verificationSummary, touchedTargetId };
}

/**
 * A small, self-contained Cowork integration for one Builder canvas. It owns
 * offers/receipts for the three builder capabilities, at most one active
 * delegation grant, and the bounded record of what that grant touched. The
 * caller owns the actual field list (`getElements`/`applyElements`) and its
 * own page-version counter, exactly like the existing FormBuilder field
 * wiring in app.js owns the DOM control it mutates.
 */
export function createBuilderCoworkBridge({ sessionId = "formbuilder-showcase-builder" } = {}) {
  let offers = [];
  let receipts = [];
  let offerCounter = 0;
  let grantCounter = 0;
  let activeGrant = null;
  let callsUsedInGrant = 0;
  let targetsTouchedInGrant = [];
  // Tracks the page version this grant's *own* successive solo calls expect
  // next, separately from the grant's frozen `pageVersion` field. A solo
  // batch's own verified calls advance the real page version each time,
  // which is not staleness - it is this grant doing its job; a call from
  // anything else changing the page unrelated to this grant still fails
  // closed, because the caller-supplied live page version would then diverge
  // from this tracked value.
  let grantPageVersion = null;
  let awaitingFeedback = null; // GAP-05: { offerId } once a directive is verified, until a feedback verdict is recorded

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
    const applied = applyBuilderPlan(plan, elements);

    const receipt = createActionReceipt({
      offerId: offer.offerId,
      verified: applied.verified,
      observedChangeIds: [],
      verificationSummary: applied.verificationSummary,
      undoAvailable: plan.undoAvailable,
      pageVersion: offer.pageVersion
    });
    offers = offers.filter((candidate) => candidate.offerId !== offer.offerId);
    receipts = [...receipts, receipt].slice(-MAX_RECEIPTS);
    return { elements: applied.elements, receipt };
  }

  // --- GAP-01/GAP-04: a presence-independent, container-scoped delegation
  // grant. Presence says who is there; this grant - not presence - says who
  // may act, and for how long, on how many calls, over which capabilities.

  function hasActiveGrant(now = new Date().toISOString()) {
    return activeGrant !== null && Date.parse(activeGrant.expiresAt) > Date.parse(now);
  }

  function readActiveGrant() {
    return activeGrant;
  }

  /**
   * Creates a delegation grant scoped to the whole canvas (form-add-field) -
   * the shape Susan's "draft me a survey" needs (GAP-04). `origin` must be a
   * real human signal: "human-click" for a Delegate-button press, or
   * "human-utterance" for a spoken/typed delegation (GAP-01/GAP-02 share this
   * one grant primitive). `maxCalls`/`durationMs` are read from the human's
   * own Handover-dialog input, not fixed constants (GAP-04).
   */
  function startDelegation({
    origin,
    goal,
    maxCalls,
    durationMs,
    pageVersion,
    allowedCapabilityIds = ["form-add-field"],
    allowedTargetIds = [BUILDER_CANVAS_TARGET_ID],
    now = new Date().toISOString()
  }) {
    grantCounter += 1;
    activeGrant = createDelegationGrant({
      grantId: `builder-grant-${Date.now()}-${grantCounter}`,
      origin,
      goal,
      allowedCapabilityIds,
      allowedTargetIds,
      maxCalls,
      pageVersion,
      expiresAt: new Date(Date.parse(now) + durationMs).toISOString()
    });
    callsUsedInGrant = 0;
    targetsTouchedInGrant = [];
    grantPageVersion = pageVersion;
    return activeGrant;
  }

  /**
   * One solo call under the active grant: plans, applies and verifies a
   * form-add-field mutation with no offer and no click, exactly as GAP-04
   * describes for a model drafting alone (before or during an away window).
   * Fails closed the same way authorizeSoloAction always has once the grant
   * is spent, expired, or absent.
   */
  function soloExecute({ field, index, elements, humanPresence, agentPresence = "active", currentPageVersion, now = new Date().toISOString() }) {
    if (!activeGrant) {
      throw new CoworkProtocolError("LEASE_EXPIRED", "No delegation grant is active");
    }
    // Compare against this grant's own tracked expectation, not its frozen
    // creation-time pageVersion: this grant's own prior verified call already
    // advanced the real page version, and that is not staleness (see the
    // grantPageVersion declaration above for why).
    const effectivePageVersion = currentPageVersion ?? grantPageVersion;
    const leaseForThisCall = { ...activeGrant, pageVersion: grantPageVersion };
    const plan = planSoloBuilderFieldMutation({
      lease: leaseForThisCall,
      now,
      humanPresence,
      agentPresence,
      capabilityId: "form-add-field",
      targetId: BUILDER_CANVAS_TARGET_ID,
      pageVersion: effectivePageVersion,
      callsUsed: callsUsedInGrant,
      proposedArguments: { field, ...(index === undefined ? {} : { index }) },
      currentElements: elements
    });
    callsUsedInGrant += 1;
    const applied = applyBuilderPlan(plan, elements);
    const receipt = createActionReceipt({
      offerId: `${activeGrant.grantId}:call-${callsUsedInGrant}`,
      verified: applied.verified,
      observedChangeIds: [],
      verificationSummary: applied.verificationSummary,
      undoAvailable: plan.undoAvailable,
      pageVersion: effectivePageVersion
    });
    if (applied.verified) {
      grantPageVersion = effectivePageVersion + 1;
      if (applied.touchedTargetId) {
        targetsTouchedInGrant = [...targetsTouchedInGrant, builderFieldTargetId(applied.touchedTargetId)].slice(
          -MAX_TARGETS_TOUCHED_TRACKED
        );
      }
    }
    receipts = [...receipts, receipt].slice(-MAX_RECEIPTS);
    return { elements: applied.elements, receipt, remainingCalls: plan.authorization.remainingCalls };
  }

  /** Runs up to `count` solo calls (or until the grant's budget runs out),
   *  one field per call, using `nextField(index)` to decide each field. This
   *  is what lets "draft six good questions" actually add six fields instead
   *  of stopping after the old fixed two-call lease. */
  function runSoloBatch({ count, nextField, elements, humanPresence, currentPageVersion, now = new Date().toISOString() }) {
    let currentElements = elements;
    const results = [];
    for (let index = 0; index < count; index += 1) {
      if (!activeGrant || callsUsedInGrant >= activeGrant.maxCalls) break;
      const field = nextField(index, currentElements);
      if (!field) break;
      const result = soloExecute({ field, elements: currentElements, humanPresence, currentPageVersion, now });
      currentElements = result.elements;
      results.push(result);
      if (!result.receipt || result.receipt.status !== "verified") break;
    }
    return { elements: currentElements, results };
  }

  /**
   * GAP-03: ends the active grant and returns a bounded summary of what
   * happened under it - a session delta, not a page dump, capped exactly
   * like every other Cowork lens - plus a focus set the UI can use to
   * highlight every touched field at once. Presence's own "I'm back" signal
   * (session.js's HUMAN_RETURNED) stays the human-facing return event; this
   * is the bounded data that return event can now carry.
   */
  function endDelegation({ pageVersion, now = new Date().toISOString() }) {
    if (!activeGrant) {
      throw new CoworkProtocolError("LEASE_EXPIRED", "No delegation grant is active");
    }
    const grant = activeGrant;
    const targetIds = targetsTouchedInGrant;
    const verifiedCount = receipts.filter(
      (receipt) => receipt.offerId.startsWith(`${grant.grantId}:`) && receipt.status === "verified"
    ).length;
    const failedCount = receipts.filter(
      (receipt) => receipt.offerId.startsWith(`${grant.grantId}:`) && receipt.status === "failed"
    ).length;
    const delta = createHandoverDeltaSummary({
      leaseId: grant.grantId,
      targetIds,
      summary:
        targetIds.length > 0
          ? `${grant.goal} — ${targetIds.length} field${targetIds.length === 1 ? "" : "s"} added.`
          : `${grant.goal} — nothing was added.`,
      verifiedCount,
      failedCount
    });
    const focusSet =
      targetIds.length > 0
        ? buildFocusSet({
            sessionId,
            pageVersion,
            targetIds: targetIds.slice(0, 12),
            label: "New since you were away",
            capabilityIds: ["form-update-field", "form-move-field"]
          })
        : null;
    activeGrant = null;
    callsUsedInGrant = 0;
    targetsTouchedInGrant = [];
    grantPageVersion = null;
    // GAP-05: a batch return also waits for a verdict, referenced by the
    // grant/lease id since there is no single offer for a whole batch.
    awaitingFeedback = targetIds.length > 0 ? { offerId: grant.grantId } : null;
    return { delta, focusSet };
  }

  // --- GAP-02: a human utterance, made while a delegation grant is active,
  // authorizes one action directly - the words are the click. Reuses the
  // exact same offer/plan/apply/verify shape as authorizeAndApply; only the
  // authorization step differs (authorizeActionOffer's human-utterance +
  // grant path instead of a rendered offer's human-click path).

  function directiveFromUtterance({ capabilityId, targetId, proposedArguments, summary, pageVersion, elements, now = new Date().toISOString() }) {
    if (!activeGrant) {
      throw new CoworkProtocolError("HUMAN_CONFIRMATION_REQUIRED", "A directive needs an active delegation grant");
    }
    offerCounter += 1;
    const offer = createActionOffer({
      offerId: `builder-directive-${Date.now()}-${offerCounter}`,
      capabilityId,
      targetId,
      pageVersion,
      proposedArguments,
      summary,
      effect: "mutate",
      undoAvailable: true,
      expiresAt: new Date(Date.parse(now) + OFFER_LIFETIME_MS).toISOString()
    });
    const authorization = authorizeActionOffer({
      offer,
      event: {
        origin: "human-utterance",
        offerId: offer.offerId,
        targetId: offer.targetId,
        pageVersion,
        arguments: proposedArguments
      },
      now,
      grant: activeGrant
    });
    const plan = planAuthorizedBuilderFieldMutation({ offer, authorization, currentElements: elements });
    const applied = applyBuilderPlan(plan, elements);
    const receipt = createActionReceipt({
      offerId: offer.offerId,
      verified: applied.verified,
      observedChangeIds: [],
      verificationSummary: applied.verificationSummary,
      undoAvailable: plan.undoAvailable,
      pageVersion
    });
    receipts = [...receipts, receipt].slice(-MAX_RECEIPTS);
    // GAP-05: the model now waits for a verdict instead of proceeding.
    awaitingFeedback = applied.verified ? { offerId: offer.offerId } : null;
    return { elements: applied.elements, receipt, authorization };
  }

  function readAwaitingFeedback() {
    return awaitingFeedback;
  }

  /** GAP-05: the one way out of `awaiting-feedback` - a real human click on
   *  Good/Adjust/Different. Reuses the existing verdict vocabulary
   *  (accepted|rejected|revise, packages/core/src/index.js). */
  function recordFeedback({ verdict, adjustment = "", pageVersion, now = new Date().toISOString() }) {
    if (!awaitingFeedback) {
      throw new CoworkProtocolError("INVALID_ARGUMENTS", "No directive is awaiting feedback");
    }
    const feedback = createFeedbackEvent({
      origin: "human-click",
      relatedOfferId: awaitingFeedback.offerId,
      relatedChangeIds: [],
      verdict,
      adjustment,
      pageVersion,
      createdAt: now
    });
    awaitingFeedback = null;
    return feedback;
  }

  return {
    focusFor,
    focusForField,
    pendingOffers,
    proposeOffer,
    authorizeAndApply,
    hasActiveGrant,
    readActiveGrant,
    startDelegation,
    soloExecute,
    runSoloBatch,
    endDelegation,
    directiveFromUtterance,
    readAwaitingFeedback,
    recordFeedback,
    readReceipts: () => [...receipts]
  };
}
