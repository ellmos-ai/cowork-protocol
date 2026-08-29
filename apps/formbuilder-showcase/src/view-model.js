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
    actionChips: offers.slice(0, 3).map((offer) => ({
      offerId: offer.offerId,
      label: offer.summary
    }))
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
