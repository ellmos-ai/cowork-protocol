import { actionModeAllows } from "./session.js";

const MODE_LABELS = {
  cowork: "Cowork",
  "agent-solo": "Agent solo",
  "human-solo": "Human solo",
  idle: "Idle"
};

const CAPABILITY_LABELS = {
  native: "Native WebMCP",
  "webmcp-bridge": "WebMCP bridge",
  legacy: "Legacy bridge",
  unavailable: "WebMCP unavailable"
};

const MUTATING_FORM_CAPABILITIES = new Set(["form.set_value", "form.clear_value"]);

export function prepareVisibleActionOffer(offer) {
  if (!MUTATING_FORM_CAPABILITIES.has(offer.capabilityId)) {
    const error = new Error("Only mutating FormBuilder capabilities can create action offers");
    error.name = "CoworkProtocolError";
    error.code = "CAPABILITY_UNAVAILABLE";
    throw error;
  }
  const proposedValue =
    offer.capabilityId === "form.clear_value" ? "" : offer.proposedArguments?.value;
  if (typeof proposedValue !== "string") {
    const error = new Error("A visible FormBuilder offer requires a string value");
    error.name = "CoworkProtocolError";
    error.code = "INVALID_ARGUMENTS";
    throw error;
  }
  return {
    offerId: offer.offerId,
    label: offer.summary,
    capabilityId: offer.capabilityId,
    targetId: offer.targetId,
    proposedValue
  };
}

function humanPresentation(humanPresence) {
  if (humanPresence === "afk-long") {
    return { humanTone: "red", humanLabel: "Human away for longer" };
  }
  if (humanPresence === "afk-short") {
    return { humanTone: "yellow", humanLabel: "Human briefly away" };
  }
  return { humanTone: "green", humanLabel: "Human present" };
}

export function buildPanelViewModel({ session, focusPacket, offers, capabilityLevel }) {
  const human = humanPresentation(session.humanPresence);
  const contextCharacters = focusPacket?.metrics?.contextCharacters;

  return {
    modeLabel: MODE_LABELS[session.effectiveMode],
    ...human,
    agentLabel: session.agentPresence === "paused" ? "Agent paused" : "Agent active",
    capabilityLabel: CAPABILITY_LABELS[capabilityLevel],
    focusLabel: focusPacket?.focus?.label ?? "Point to or select a form field",
    contextLabel:
      contextCharacters === undefined
        ? "No context sent"
        : `${contextCharacters} context characters`,
    soloAllowed: actionModeAllows(session.actionMode, "solo"),
    actionChips: actionModeAllows(session.actionMode, "offer")
      ? offers
          .filter((offer) => MUTATING_FORM_CAPABILITIES.has(offer.capabilityId))
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
