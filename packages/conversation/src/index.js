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

function hasExactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

function invalidConversationTurn() {
  throw new ConversationProtocolError(
    "INVALID_CONVERSATION_TURN",
    "Host transport accepts only an exact bounded Cowork conversation turn"
  );
}

export function normalizeConversationTurn(input) {
  if (
    !hasExactKeys(input, [
      "type",
      "protocolVersion",
      "transcript",
      "focus",
      "presence",
      "metrics"
    ]) ||
    input.type !== "conversation-turn" ||
    input.protocolVersion !== "0.1" ||
    typeof input.transcript !== "string" ||
    input.transcript.trim() !== input.transcript ||
    input.transcript.length === 0 ||
    input.transcript.length > TRANSCRIPT_LIMIT ||
    !hasExactKeys(input.presence, ["humanPresence", "agentPresence", "mode"]) ||
    ![input.presence.humanPresence, input.presence.agentPresence, input.presence.mode]
      .every((value) => typeof value === "string" && value.length > 0 && value.length <= 40) ||
    !hasExactKeys(input.metrics, [
      "sourceTranscriptCharacters",
      "includedTranscriptCharacters",
      "omittedTranscriptCharacters"
    ]) ||
    ![
      input.metrics.sourceTranscriptCharacters,
      input.metrics.includedTranscriptCharacters,
      input.metrics.omittedTranscriptCharacters
    ].every((value) => Number.isInteger(value) && value >= 0) ||
    input.metrics.includedTranscriptCharacters !== input.transcript.length ||
    input.metrics.sourceTranscriptCharacters - input.metrics.includedTranscriptCharacters !==
      input.metrics.omittedTranscriptCharacters
  ) {
    invalidConversationTurn();
  }

  if (input.focus !== null) {
    if (
      !hasExactKeys(input.focus, [
        "targetId",
        "pageVersion",
        "kind",
        "label",
        "selectedText",
        "capabilityIds"
      ]) ||
      typeof input.focus.targetId !== "string" ||
      input.focus.targetId.trim() === "" ||
      input.focus.targetId.length > 200 ||
      !Number.isInteger(input.focus.pageVersion) ||
      input.focus.pageVersion < 0 ||
      typeof input.focus.kind !== "string" ||
      input.focus.kind.length > 40 ||
      typeof input.focus.label !== "string" ||
      input.focus.label.length > 350 ||
      typeof input.focus.selectedText !== "string" ||
      input.focus.selectedText.length > 160 ||
      !Array.isArray(input.focus.capabilityIds) ||
      input.focus.capabilityIds.length > 12 ||
      !input.focus.capabilityIds.every(
        (value) => typeof value === "string" && value.length > 0 && value.length <= 80
      )
    ) {
      invalidConversationTurn();
    }
  }

  const serialized = JSON.stringify(input);
  if (serialized.length > TURN_PACKET_LIMIT) invalidConversationTurn();
  return JSON.parse(serialized);
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

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createConversationInbox({
  createTurnId = (sequence) => `conversation-turn-${Date.now()}-${sequence}`
} = {}) {
  if (typeof createTurnId !== "function") {
    throw new TypeError("createTurnId must be a function");
  }
  let totalCount = 0;
  let pending = null;
  const seenTurnIds = new Set();

  return {
    publish(turn) {
      if (
        !turn ||
        turn.type !== "conversation-turn" ||
        turn.protocolVersion !== "0.1" ||
        JSON.stringify(turn).length > TURN_PACKET_LIMIT
      ) {
        throw new ConversationProtocolError(
          "INVALID_CONVERSATION_TURN",
          "Inbox accepts only a bounded Cowork conversation turn"
        );
      }
      const nextSequence = totalCount + 1;
      const turnId = requiredText(createTurnId(nextSequence), "turnId", 200);
      if (seenTurnIds.has(turnId)) {
        throw new ConversationProtocolError(
          "DUPLICATE_CONVERSATION_TURN",
          "Conversation turn ids must remain unique for the inbox lifetime"
        );
      }
      seenTurnIds.add(turnId);
      totalCount = nextSequence;
      pending = {
        turnId,
        turn: cloneJson(turn)
      };
      return { turnId };
    },
    read() {
      return {
        type: "conversation-inbox",
        protocolVersion: "0.1",
        latest: pending === null ? null : cloneJson(pending),
        totalCount,
        omittedCount: pending === null ? 0 : Math.max(0, totalCount - 1)
      };
    },
    respond(input) {
      if (
        pending === null ||
        typeof input?.turnId !== "string" ||
        input.turnId !== pending.turnId
      ) {
        throw new ConversationProtocolError(
          "STALE_CONVERSATION_TURN",
          "Reply does not match the latest pending human turn"
        );
      }
      const reply = normalizeConversationReply(input);
      const turnId = pending.turnId;
      pending = null;
      return {
        type: "conversation-reply",
        protocolVersion: "0.1",
        turnId,
        reply,
        requiresHumanConfirmation: reply.offers.length > 0
      };
    }
  };
}
