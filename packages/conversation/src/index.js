const TRANSCRIPT_LIMIT = 350;
const REPLY_LIMIT = 350;
const SPOKEN_REPLY_LIMIT = 350;
const OFFER_VALUE_LIMIT = 350;
const OFFER_SUMMARY_LIMIT = 200;
const MAX_OFFERS = 3;
const TURN_PACKET_LIMIT = 1200;

export class ConversationProtocolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ConversationProtocolError";
    this.code = code;
  }
}

function boundedText(value, limit) {
  const source = typeof value === "string" ? value : "";
  if (source.length <= limit) return source;
  let end = limit;
  const lastCodeUnit = source.charCodeAt(end - 1);
  if (lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff) end -= 1;
  return source.slice(0, end);
}

function requiredText(value, fieldName, limit) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ConversationProtocolError(
      "INVALID_REPLY",
      `${fieldName} must be a non-empty string`
    );
  }
  return boundedText(value.trim(), limit);
}

function compactFocus(focusPacket) {
  if (!focusPacket) return null;
  const focus = focusPacket.focus ?? {};
  return {
    targetId: requiredText(focusPacket.targetId, "focus targetId", 200),
    pageVersion: focusPacket.pageVersion,
    kind: boundedText(focus.kind, 40),
    label: boundedText(focus.label, 350),
    selectedText: boundedText(focus.selectedText, 160),
    capabilityIds: Array.isArray(focusPacket.capabilityIds)
      ? focusPacket.capabilityIds.slice(0, 12).map((id) => boundedText(id, 80))
      : []
  };
}

export function createConversationTurn({ transcript, focusPacket = null, presence }) {
  const trimmed = typeof transcript === "string" ? transcript.trim() : "";
  if (trimmed === "") return null;
  if (!presence || typeof presence !== "object") {
    throw new ConversationProtocolError("INVALID_PRESENCE", "Conversation presence is required");
  }

  const includedTranscript = boundedText(trimmed, TRANSCRIPT_LIMIT);
  const turn = {
    type: "conversation-turn",
    protocolVersion: "0.1",
    transcript: includedTranscript,
    focus: compactFocus(focusPacket),
    presence: {
      humanPresence: boundedText(presence.humanPresence, 40),
      agentPresence: boundedText(presence.agentPresence, 40),
      mode: boundedText(presence.mode, 40)
    },
    metrics: {
      sourceTranscriptCharacters: trimmed.length,
      includedTranscriptCharacters: includedTranscript.length,
      omittedTranscriptCharacters: trimmed.length - includedTranscript.length
    }
  };

  if (JSON.stringify(turn).length > TURN_PACKET_LIMIT) {
    throw new ConversationProtocolError(
      "CONTEXT_BUDGET_EXCEEDED",
      "Conversation turn exceeds the 1,200-character adapter budget"
    );
  }
  return turn;
}

function normalizeOffer(offer) {
  if (!offer || typeof offer !== "object" || Array.isArray(offer)) {
    throw new ConversationProtocolError("INVALID_REPLY", "Every offer must be an object");
  }
  if (typeof offer.value !== "string") {
    throw new ConversationProtocolError("INVALID_REPLY", "Offer value must be a string");
  }
  if (offer.value.length > OFFER_VALUE_LIMIT) {
    throw new ConversationProtocolError(
      "REPLY_VALUE_TOO_LONG",
      "Offer value exceeds the 350-character review boundary"
    );
  }
  return {
    capabilityId: requiredText(offer.capabilityId, "offer capabilityId", 120),
    targetId: requiredText(offer.targetId, "offer targetId", 200),
    value: offer.value,
    summary: requiredText(offer.summary, "offer summary", OFFER_SUMMARY_LIMIT)
  };
}

export function normalizeConversationReply(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ConversationProtocolError("INVALID_REPLY", "Model reply must be an object");
  }
  const offers = Array.isArray(input.offers) ? input.offers : [];
  return {
    message: requiredText(input.message, "reply message", REPLY_LIMIT),
    speak:
      typeof input.speak === "string" && input.speak.trim() !== ""
        ? boundedText(input.speak.trim(), SPOKEN_REPLY_LIMIT)
        : "",
    offers: offers.slice(0, MAX_OFFERS).map(normalizeOffer),
    omittedOffers: Math.max(0, offers.length - MAX_OFFERS)
  };
}

export function createConversationClient({ sendTurn }) {
  if (typeof sendTurn !== "function") {
    throw new TypeError("sendTurn must be a function");
  }
  return {
    async submit(input) {
      if (input?.presence?.agentPresence === "paused") {
        return { sent: false, status: "agent-paused" };
      }
      const turn = createConversationTurn(input ?? {});
      if (turn === null) return { sent: false, status: "silence" };
      const rawReply = await sendTurn(turn);
      return {
        sent: true,
        status: "replied",
        turn,
        reply: normalizeConversationReply(rawReply)
      };
    }
  };
}
