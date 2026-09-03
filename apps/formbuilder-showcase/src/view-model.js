import { CoworkProtocolError } from "../../../packages/core/src/index.js";
import { actionModeAllows } from "./session.js";
import {
  buildCollaborationPresentation,
  buildReferenceSurfacePresentation
} from "../../../packages/reference-ui/src/index.js";

const CAPABILITY_LABELS = {
  native: "Native WebMCP",
  "webmcp-bridge": "WebMCP bridge",
  legacy: "Legacy bridge",
  unavailable: "WebMCP off in this browser"
};

const MUTATING_FORM_CAPABILITIES = new Set(["form.set_value", "form.clear_value"]);
const MAX_VISIBLE_OFFER_VALUE_CODE_POINTS = 350;

function exceedsCodePointLimit(value, limit) {
  let codePoints = 0;
  for (const _character of value) {
    codePoints += 1;
    if (codePoints > limit) return true;
  }
  return false;
}

export function prepareVisibleActionOffer(offer) {
  if (!MUTATING_FORM_CAPABILITIES.has(offer.capabilityId)) {
    throw new CoworkProtocolError(
      "CAPABILITY_UNAVAILABLE",
      "Only mutating FormBuilder capabilities can create action offers"
    );
  }
  const proposedValue = offer.proposedArguments?.value;
  if (typeof proposedValue !== "string") {
    throw new CoworkProtocolError(
      "INVALID_ARGUMENTS",
      "A visible FormBuilder offer requires a string value"
    );
  }
  if (exceedsCodePointLimit(proposedValue, MAX_VISIBLE_OFFER_VALUE_CODE_POINTS)) {
    throw new CoworkProtocolError(
      "INVALID_ARGUMENTS",
      "A visible FormBuilder offer value cannot exceed 350 Unicode code points"
    );
  }
  if (offer.capabilityId === "form.clear_value" && proposedValue !== "") {
    throw new CoworkProtocolError(
      "INVALID_ARGUMENTS",
      "form.clear_value requires an empty proposed value"
    );
  }
  return {
    offerId: offer.offerId,
    label: offer.summary,
    capabilityId: offer.capabilityId,
    targetId: offer.targetId,
    proposedValue
  };
}

function isCurrentOffer(offer, nowTimestamp, pageVersion) {
  if (!offer || typeof offer !== "object") return false;
  const expiresAt = Date.parse(offer.expiresAt);
  return (
    MUTATING_FORM_CAPABILITIES.has(offer.capabilityId) &&
    offer.pageVersion === pageVersion &&
    Number.isFinite(nowTimestamp) &&
    Number.isFinite(expiresAt) &&
    expiresAt > nowTimestamp
  );
}

function isRenderableActionOffer(offer) {
  try {
    prepareVisibleActionOffer(offer);
    return true;
  } catch {
    return false;
  }
}

export function currentActionOffers({ offers, now, pageVersion }) {
  const nowTimestamp = Date.parse(now);
  return offers.filter(
    (offer) =>
      isCurrentOffer(offer, nowTimestamp, pageVersion) &&
      isRenderableActionOffer(offer)
  );
}

export function nextActionOfferExpiry(offers) {
  const expiries = offers
    .map((offer) => Date.parse(offer?.expiresAt))
    .filter(Number.isFinite);
  return expiries.length > 0 ? Math.min(...expiries) : null;
}

export function buildPanelViewModel({
  session,
  focusPacket,
  offers,
  capabilityLevel,
  now,
  pageVersion
}) {
  const referenceSurface = buildReferenceSurfacePresentation(session);
  const collaboration = buildCollaborationPresentation({
    humanPresence: session.humanPresence,
    agentEngagement:
      session.agentPresence === "paused" || session.actionMode === "paused"
        ? "paused"
        : session.actionMode === "explain"
          ? "observing"
          : "collaborating",
    effectiveMode: session.effectiveMode
  });
  const contextCharacters = focusPacket?.metrics?.contextCharacters;

  return {
    modeLabel: referenceSurface.modeLabel,
    humanTone: referenceSurface.humanTone,
    humanLabel: referenceSurface.humanLabel,
    agentLabel: referenceSurface.agentLabel,
    collaboration,
    capabilityLabel: CAPABILITY_LABELS[capabilityLevel],
    focusLabel: focusPacket?.focus?.label ?? "Point to or select a form field",
    contextLabel:
      contextCharacters === undefined
        ? "No context sent"
        : `${contextCharacters} context characters`,
    soloAllowed: actionModeAllows(session.actionMode, "solo"),
    actionChips: actionModeAllows(session.actionMode, "offer")
      ? currentActionOffers({ offers, now, pageVersion })
          .slice(0, 3)
          .map(prepareVisibleActionOffer)
      : []
  };
}

const FEEDBACK_LABELS = {
  accepted: "Good",
  revise: "Adjust",
  rejected: "Different"
};

export function buildReceiptViewModels({ receipts, feedbackEvents }) {
  const feedbackByOfferId = new Map(
    feedbackEvents.map((event) => [event.relatedOfferId, event])
  );

  return receipts.slice(-4).reverse().map((receipt) => {
    const feedbackEvent = feedbackByOfferId.get(receipt.offerId);
    return {
      offerId: receipt.offerId,
      status: receipt.status,
      statusLabel: receipt.status === "verified" ? "Verified" : "Failed",
      verificationSummary: receipt.verificationSummary,
      feedback: feedbackEvent
        ? {
            verdict: feedbackEvent.verdict,
            verdictLabel: FEEDBACK_LABELS[feedbackEvent.verdict],
            adjustment: feedbackEvent.adjustment
          }
        : null
    };
  });
}
