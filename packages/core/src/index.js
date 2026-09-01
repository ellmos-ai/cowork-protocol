const SELECTED_TEXT_LIMIT = 160;
const FOCUS_TEXT_LIMIT = 350;
const EVENT_TEXT_LIMIT = 350;
const OFFER_SUMMARY_LIMIT = 200;
const CONTEXT_REASON_LIMIT = 200;
const CONTEXT_EXPANSION_LIMIT = 1200;
const EVENT_REFERENCE_LIMIT = 8;
const EVENT_REFERENCE_TEXT_LIMIT = 120;
const HUMAN_PRESENCE_VALUES = new Set(["present", "afk-short", "afk-long"]);
const AGENT_PRESENCE_VALUES = new Set(["active", "paused"]);
const CHANGE_SOURCE_VALUES = new Set(["human", "agent", "app", "bridge"]);
const CAUSALITY_CONFIDENCE_VALUES = new Set(["low", "medium", "high"]);
const FEEDBACK_VERDICT_VALUES = new Set(["accepted", "rejected", "revise"]);
// A delegation grant's origin must be a real human signal: a click, or a real
// spoken/typed utterance (never an agent simulating either). See GAP-01/GAP-02.
const GRANT_ORIGIN_VALUES = new Set(["human-click", "human-utterance"]);
const GRANT_GOAL_LIMIT = 200;
const HANDOVER_DELTA_TARGET_LIMIT = 12;
const HANDOVER_DELTA_SUMMARY_LIMIT = 350;
const SHA256_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

function rotateRight(value, amount) {
  return (value >>> amount) | (value << (32 - amount));
}

function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const bitLength = bytes.length * 8;
  const paddedView = new DataView(padded.buffer);
  paddedView.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  paddedView.setUint32(paddedLength - 4, bitLength >>> 0, false);

  const hash = new Uint32Array([
    0x6a09e667,
    0xbb67ae85,
    0x3c6ef372,
    0xa54ff53a,
    0x510e527f,
    0x9b05688c,
    0x1f83d9ab,
    0x5be0cd19
  ]);
  const words = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = paddedView.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < 64; index += 1) {
      const previous15 = words[index - 15];
      const previous2 = words[index - 2];
      const sigma0 =
        rotateRight(previous15, 7) ^ rotateRight(previous15, 18) ^ (previous15 >>> 3);
      const sigma1 =
        rotateRight(previous2, 17) ^ rotateRight(previous2, 19) ^ (previous2 >>> 10);
      words[index] =
        (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temporary1 = (h + sum1 + choice + SHA256_CONSTANTS[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }

    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }

  return [...hash].map((value) => value.toString(16).padStart(8, "0")).join("");
}

function isLosslessJsonValue(value, ancestors = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) && !Object.is(value, -0);
  }
  if (typeof value !== "object" || ancestors.has(value)) return false;

  ancestors.add(value);
  let valid;
  if (Array.isArray(value)) {
    const keys = Object.keys(value);
    valid =
      keys.length === value.length &&
      keys.every(
        (key, index) =>
          key === String(index) && isLosslessJsonValue(value[index], ancestors)
      );
  } else {
    const prototype = Object.getPrototypeOf(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    valid =
      (prototype === Object.prototype || prototype === null) &&
      Object.getOwnPropertySymbols(value).length === 0 &&
      Object.values(descriptors).every(
        (descriptor) =>
          descriptor.enumerable === true &&
          Object.hasOwn(descriptor, "value") &&
          isLosslessJsonValue(descriptor.value, ancestors)
      );
  }
  ancestors.delete(value);
  return valid;
}

export function digestArguments(arguments_) {
  let serialized;
  try {
    if (!isLosslessJsonValue(arguments_)) {
      throw new Error("not a lossless JSON value");
    }
    serialized = JSON.stringify(arguments_);
  } catch {
    throw new CoworkProtocolError(
      "INVALID_ARGUMENTS",
      "Action arguments must be losslessly JSON-serializable"
    );
  }
  return sha256Hex(serialized);
}

export class CoworkProtocolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CoworkProtocolError";
    this.code = code;
  }
}

function truncateWithEllipsis(text, limit) {
  if (text.length <= limit) {
    return text;
  }
  if (limit === 0) {
    return "";
  }
  let prefix = text.slice(0, limit - 1);
  const lastCodeUnit = prefix.charCodeAt(prefix.length - 1);
  if (lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff) {
    prefix = prefix.slice(0, -1);
  }
  return `${prefix}…`;
}

function assertBoundedReferences(references) {
  if (
    references.length > EVENT_REFERENCE_LIMIT ||
    references.some(
      (reference) =>
        typeof reference !== "string" ||
        reference.length === 0 ||
        reference.length > EVENT_REFERENCE_TEXT_LIMIT
    )
  ) {
    throw new CoworkProtocolError(
      "CONTEXT_BUDGET_EXCEEDED",
      `Event references are limited to ${EVENT_REFERENCE_LIMIT} values of ${EVENT_REFERENCE_TEXT_LIMIT} characters`
    );
  }
}

function normalizeSelection(selectedText) {
  if (selectedText.length <= SELECTED_TEXT_LIMIT) {
    return {
      selection: { kind: "text", text: selectedText },
      includedCharacters: selectedText.length
    };
  }

  return {
    selection: {
      kind: "digest",
      length: selectedText.length,
      sha256: sha256Hex(selectedText)
    },
    includedCharacters: 0
  };
}

export function buildFocusPacket(input) {
  const normalized = normalizeSelection(input.selectedText);
  const labelLimit = FOCUS_TEXT_LIMIT - normalized.includedCharacters;
  const label = truncateWithEllipsis(input.label, labelLimit);
  const metrics = {
    contextCharacters: label.length + normalized.includedCharacters,
    selectedTextCharacters: input.selectedText.length,
    selectedTextIncludedCharacters: normalized.includedCharacters
  };

  if (label.length !== input.label.length) {
    metrics.labelCharacters = input.label.length;
    metrics.labelIncludedCharacters = label.length;
  }

  return {
    protocolVersion: "0.1",
    type: "focus",
    sessionId: input.sessionId,
    source: input.source,
    capabilityLevel: input.capabilityLevel,
    targetId: input.targetId,
    pageVersion: input.pageVersion,
    focus: {
      kind: input.focusKind,
      label,
      selection: normalized.selection
    },
    capabilityIds: input.capabilityIds,
    metrics
  };
}

export function resolvePresenceMode({ humanPresence, agentPresence, leaseValid }) {
  if (!HUMAN_PRESENCE_VALUES.has(humanPresence)) {
    throw new CoworkProtocolError(
      "INVALID_HUMAN_PRESENCE",
      `Unknown human presence: ${humanPresence}`
    );
  }
  if (!AGENT_PRESENCE_VALUES.has(agentPresence)) {
    throw new CoworkProtocolError(
      "INVALID_AGENT_PRESENCE",
      `Unknown agent presence: ${agentPresence}`
    );
  }

  if (humanPresence === "present") {
    return agentPresence === "paused" ? "human-solo" : "cowork";
  }

  if (agentPresence === "active" && leaseValid) {
    return "agent-solo";
  }

  return "idle";
}

export function createPresenceEvent(input) {
  return {
    protocolVersion: "0.1",
    type: "presence",
    humanPresence: input.humanPresence,
    agentPresence: input.agentPresence,
    effectiveMode: resolvePresenceMode(input),
    reason: input.reason,
    changedBy: input.changedBy
  };
}

/**
 * A delegation grant is presence-independent: it authorizes scoped solo work
 * (packages/core's `authorizeSoloAction`) and, when supplied to
 * `authorizeActionOffer`, a single directive spoken or typed while the human
 * stays present (GAP-02). It always originates from a real human signal
 * (click or utterance, never an agent) and is versioned, scoped and expiring
 * exactly like an action offer. Presence itself (`humanPresence`) says who is
 * there; it is no longer a precondition for whether a grant may be used -
 * only the grant's own origin, scope and expiry decide that (GAP-01).
 */
export function createDelegationGrant(input) {
  if (!GRANT_ORIGIN_VALUES.has(input?.origin)) {
    throw new CoworkProtocolError(
      "HUMAN_CONFIRMATION_REQUIRED",
      "A delegation grant must originate from a real human click or utterance"
    );
  }
  if (typeof input.goal !== "string" || input.goal.trim() === "") {
    throw new CoworkProtocolError(
      "LEASE_SCOPE_VIOLATION",
      "A delegation grant needs a concrete, human-authored goal"
    );
  }
  if (
    !Array.isArray(input.allowedCapabilityIds) ||
    input.allowedCapabilityIds.length === 0 ||
    !Array.isArray(input.allowedTargetIds) ||
    input.allowedTargetIds.length === 0 ||
    !Number.isInteger(input.maxCalls) ||
    input.maxCalls <= 0 ||
    !Number.isInteger(input.pageVersion) ||
    typeof input.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(input.expiresAt))
  ) {
    throw new CoworkProtocolError(
      "LEASE_SCOPE_VIOLATION",
      "Delegation grant scope must contain capability/target arrays, a positive call budget, a page version and a valid expiry"
    );
  }

  const trimmedGoal = input.goal.trim();
  const goal = truncateWithEllipsis(trimmedGoal, GRANT_GOAL_LIMIT);
  return {
    protocolVersion: "0.1",
    type: "delegation-grant",
    grantId: input.grantId,
    // A delegation grant IS the lease `authorizeSoloAction` consumes; `leaseId`
    // is kept as an alias of `grantId` so that existing lease-shaped code
    // (authorizeSoloAction's own `lease.leaseId` read, session state, UI)
    // needs no parallel field.
    leaseId: input.grantId,
    origin: input.origin,
    goal,
    allowedCapabilityIds: [...input.allowedCapabilityIds],
    allowedTargetIds: [...input.allowedTargetIds],
    maxCalls: input.maxCalls,
    maxContextLevel: input.maxContextLevel ?? null,
    pageVersion: input.pageVersion,
    expiresAt: input.expiresAt,
    metrics: {
      goalCharacters: trimmedGoal.length,
      goalIncludedCharacters: goal.length
    }
  };
}

function assertGrantCoversOffer(grant, offer, now) {
  if (
    !grant ||
    typeof grant !== "object" ||
    !GRANT_ORIGIN_VALUES.has(grant.origin) ||
    !Array.isArray(grant.allowedCapabilityIds) ||
    !Array.isArray(grant.allowedTargetIds)
  ) {
    throw new CoworkProtocolError(
      "HUMAN_CONFIRMATION_REQUIRED",
      "A human utterance can authorize an action only under a real delegation grant"
    );
  }
  const grantExpiry = Date.parse(grant.expiresAt);
  if (!Number.isFinite(grantExpiry) || Date.parse(now) >= grantExpiry) {
    throw new CoworkProtocolError("LEASE_EXPIRED", "Delegation grant expired");
  }
  if (!grant.allowedCapabilityIds.includes(offer.capabilityId)) {
    throw new CoworkProtocolError(
      "LEASE_SCOPE_VIOLATION",
      `Capability outside the delegation grant: ${offer.capabilityId}`
    );
  }
  if (!grant.allowedTargetIds.includes(offer.targetId)) {
    throw new CoworkProtocolError(
      "LEASE_SCOPE_VIOLATION",
      `Target outside the delegation grant: ${offer.targetId}`
    );
  }
}

export function authorizeSoloAction(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new CoworkProtocolError(
      "LEASE_SCOPE_VIOLATION",
      "A structured solo lease request is required"
    );
  }
  const { lease } = request;

  if (!HUMAN_PRESENCE_VALUES.has(request.humanPresence)) {
    throw new CoworkProtocolError(
      "INVALID_HUMAN_PRESENCE",
      `Unknown human presence: ${request.humanPresence}`
    );
  }
  if (!AGENT_PRESENCE_VALUES.has(request.agentPresence)) {
    throw new CoworkProtocolError(
      "INVALID_AGENT_PRESENCE",
      `Unknown agent presence: ${request.agentPresence}`
    );
  }
  if (
    !lease ||
    typeof lease !== "object" ||
    Array.isArray(lease) ||
    !Array.isArray(lease.allowedCapabilityIds) ||
    !Array.isArray(lease.allowedTargetIds)
  ) {
    throw new CoworkProtocolError(
      "LEASE_SCOPE_VIOLATION",
      "Solo lease scope must contain capability and target arrays"
    );
  }
  // The lease must itself be a real delegation grant (GAP-01): its origin
  // must be a genuine human click or utterance. This does not simulate
  // consent - it re-verifies, at the point of use, that consent was real at
  // the point of grant. Presence is deliberately not checked here: presence
  // says who is there, not who may act (see the function doc comment above).
  if (!GRANT_ORIGIN_VALUES.has(lease.origin)) {
    throw new CoworkProtocolError(
      "HUMAN_CONFIRMATION_REQUIRED",
      "A solo lease must be a real delegation grant with a human origin"
    );
  }
  const now = Date.parse(request.now);
  const expiresAt = Date.parse(lease.expiresAt);
  if (!Number.isFinite(now) || !Number.isFinite(expiresAt)) {
    throw new CoworkProtocolError("LEASE_EXPIRED", "Solo lease time is invalid");
  }

  if (request.agentPresence === "paused") {
    throw new CoworkProtocolError("SESSION_PAUSED", "Agent is paused");
  }
  if (now >= expiresAt) {
    throw new CoworkProtocolError("LEASE_EXPIRED", "Solo lease expired");
  }
  if (
    !Number.isInteger(request.callsUsed) ||
    request.callsUsed < 0 ||
    !Number.isInteger(lease.maxCalls) ||
    lease.maxCalls <= 0
  ) {
    throw new CoworkProtocolError(
      "LEASE_SCOPE_VIOLATION",
      "Solo lease call counters must be non-negative integers with a positive limit"
    );
  }
  if (request.callsUsed >= lease.maxCalls) {
    throw new CoworkProtocolError("LEASE_EXPIRED", "Solo lease call limit reached");
  }
  if (request.pageVersion !== lease.pageVersion) {
    throw new CoworkProtocolError(
      "STALE_PAGE_VERSION",
      "Page version changed after lease authorization"
    );
  }
  if (!lease.allowedCapabilityIds.includes(request.capabilityId)) {
    throw new CoworkProtocolError(
      "LEASE_SCOPE_VIOLATION",
      `Capability outside lease: ${request.capabilityId}`
    );
  }
  if (!lease.allowedTargetIds.includes(request.targetId)) {
    throw new CoworkProtocolError(
      "LEASE_SCOPE_VIOLATION",
      `Target outside lease: ${request.targetId}`
    );
  }

  return {
    authorized: true,
    authorizationSource: "solo-lease",
    leaseId: lease.leaseId,
    remainingCalls: lease.maxCalls - request.callsUsed - 1
  };
}

export function createActionOffer(input) {
  const summary = truncateWithEllipsis(input.summary, OFFER_SUMMARY_LIMIT);
  return {
    protocolVersion: "0.1",
    type: "action-offer",
    source: "agent",
    offerId: input.offerId,
    capabilityId: input.capabilityId,
    targetId: input.targetId,
    pageVersion: input.pageVersion,
    proposedArguments: input.proposedArguments,
    summary,
    effect: input.effect,
    requiresHumanConfirmation: true,
    undoAvailable: input.undoAvailable,
    expiresAt: input.expiresAt,
    metrics: {
      summaryCharacters: input.summary.length,
      summaryIncludedCharacters: summary.length
    }
  };
}

export function createActionReceipt(input) {
  return {
    protocolVersion: "0.1",
    type: "action-receipt",
    offerId: input.offerId,
    status: input.verified ? "verified" : "failed",
    observedChangeIds: input.observedChangeIds,
    verificationSummary: input.verificationSummary,
    undoAvailable: input.undoAvailable,
    errorCode: input.verified ? null : "VERIFICATION_FAILED",
    ...(input.pageVersion === undefined ? {} : { pageVersion: input.pageVersion })
  };
}

export function createChangeEvent(input) {
  if (!CHANGE_SOURCE_VALUES.has(input.source)) {
    throw new CoworkProtocolError(
      "INVALID_CHANGE_SOURCE",
      `Unknown change source: ${input.source}`
    );
  }
  if (!CAUSALITY_CONFIDENCE_VALUES.has(input.causalityConfidence)) {
    throw new CoworkProtocolError(
      "INVALID_CAUSALITY_CONFIDENCE",
      `Unknown causality confidence: ${input.causalityConfidence}`
    );
  }
  if (
    typeof input.changeId !== "string" ||
    input.changeId.length === 0 ||
    !Array.isArray(input.targetIds) ||
    input.targetIds.length === 0 ||
    !Array.isArray(input.causeRefs) ||
    typeof input.shortSummary !== "string" ||
    !Number.isInteger(input.pageVersion)
  ) {
    throw new CoworkProtocolError("INVALID_CHANGE_EVENT", "Change event is incomplete");
  }
  assertBoundedReferences(input.targetIds);
  assertBoundedReferences(input.causeRefs);

  const shortSummary = truncateWithEllipsis(input.shortSummary, EVENT_TEXT_LIMIT);
  return {
    protocolVersion: "0.1",
    type: "change",
    changeId: input.changeId,
    source: input.source,
    targetIds: [...input.targetIds],
    pageVersion: input.pageVersion,
    beforeDigest: input.beforeDigest,
    afterDigest: input.afterDigest,
    shortSummary,
    causeRefs: [...input.causeRefs],
    causalityConfidence: input.causalityConfidence,
    reversible: input.reversible,
    undoCapabilityId: input.undoCapabilityId ?? null,
    metrics: {
      summaryCharacters: input.shortSummary.length,
      summaryIncludedCharacters: shortSummary.length
    }
  };
}

export function createFeedbackEvent(input) {
  if (input.origin !== "human-click") {
    throw new CoworkProtocolError(
      "HUMAN_CONFIRMATION_REQUIRED",
      "Only a visible human click can create feedback"
    );
  }
  if (!FEEDBACK_VERDICT_VALUES.has(input.verdict)) {
    throw new CoworkProtocolError(
      "INVALID_FEEDBACK_VERDICT",
      `Unknown feedback verdict: ${input.verdict}`
    );
  }
  const adjustmentInput = input.adjustment ?? "";
  if (
    typeof input.relatedOfferId !== "string" ||
    input.relatedOfferId.length === 0 ||
    !Array.isArray(input.relatedChangeIds) ||
    typeof adjustmentInput !== "string" ||
    !Number.isInteger(input.pageVersion)
  ) {
    throw new CoworkProtocolError("INVALID_FEEDBACK_EVENT", "Feedback event is incomplete");
  }
  assertBoundedReferences(input.relatedChangeIds);
  assertBoundedReferences([input.relatedOfferId]);

  const adjustment = truncateWithEllipsis(adjustmentInput, EVENT_TEXT_LIMIT);
  return {
    protocolVersion: "0.1",
    type: "feedback",
    source: "human",
    origin: "human-click",
    relatedOfferId: input.relatedOfferId,
    relatedChangeIds: [...input.relatedChangeIds],
    verdict: input.verdict,
    adjustment,
    pageVersion: input.pageVersion,
    createdAt: input.createdAt,
    metrics: {
      adjustmentCharacters: adjustmentInput.length,
      adjustmentIncludedCharacters: adjustment.length
    }
  };
}

export function authorizeActionOffer({ offer, event, now }) {
  if (event.origin !== "human-click") {
    throw new CoworkProtocolError(
      "HUMAN_CONFIRMATION_REQUIRED",
      "Only a visible human click can authorize this offer"
    );
  }
  const authorizationTime = Date.parse(now);
  const offerExpiry = Date.parse(offer.expiresAt);
  if (!Number.isFinite(authorizationTime) || !Number.isFinite(offerExpiry)) {
    throw new CoworkProtocolError("STALE_FOCUS", "Action offer time is invalid");
  }
  if (authorizationTime >= offerExpiry) {
    throw new CoworkProtocolError("STALE_FOCUS", "Action offer expired");
  }
  if (event.offerId !== offer.offerId || event.targetId !== offer.targetId) {
    throw new CoworkProtocolError("STALE_FOCUS", "Action offer no longer matches focus");
  }
  if (event.pageVersion !== offer.pageVersion) {
    throw new CoworkProtocolError(
      "STALE_PAGE_VERSION",
      "Page version changed after action was offered"
    );
  }
  const proposedArgumentsDigest = digestArguments(offer.proposedArguments);
  const authorizedArgumentsDigest = digestArguments(event.arguments);
  if (authorizedArgumentsDigest !== proposedArgumentsDigest) {
    throw new CoworkProtocolError(
      "STALE_FOCUS",
      "Action arguments changed after the human-visible offer"
    );
  }

  return {
    protocolVersion: "0.1",
    type: "action-authorization",
    offerId: offer.offerId,
    authorizationSource: "human-click",
    authorizedArgumentsDigest,
    pageVersion: offer.pageVersion,
    expiresAt: offer.expiresAt
  };
}

export function routeContextSignal(input) {
  if (input.signal === "silence" || input.changed === false) {
    return null;
  }
  if (
    !Number.isInteger(input.currentLevel) ||
    !Number.isInteger(input.requestedLevel) ||
    input.currentLevel < 0 ||
    input.currentLevel > 5 ||
    input.requestedLevel < 0 ||
    input.requestedLevel > 5 ||
    input.requestedLevel > input.currentLevel + 1
  ) {
    throw new CoworkProtocolError(
      "CONTEXT_BUDGET_EXCEEDED",
      "Context can expand by only one level per request"
    );
  }

  return {
    emit: true,
    level: input.requestedLevel,
    oneShot: input.requestedLevel > input.currentLevel,
    reason: input.reason
  };
}

export function buildContextExpansion(input) {
  const focusPacket = input.focusPacket;
  if (
    focusPacket?.type !== "focus" ||
    typeof focusPacket.targetId !== "string" ||
    !Number.isInteger(focusPacket.pageVersion)
  ) {
    throw new CoworkProtocolError(
      "STALE_FOCUS",
      "A current focus packet is required before requesting related context"
    );
  }
  if (
    typeof input.reason !== "string" ||
    input.reason.length === 0 ||
    input.reason.length > CONTEXT_REASON_LIMIT
  ) {
    throw new CoworkProtocolError(
      "CONTEXT_BUDGET_EXCEEDED",
      `Context request reasons are limited to ${CONTEXT_REASON_LIMIT} characters`
    );
  }
  if (typeof input.relatedContext !== "string") {
    throw new CoworkProtocolError(
      "INVALID_ARGUMENTS",
      "Related context must be text"
    );
  }

  const routed = routeContextSignal({
    signal: "focus",
    changed: true,
    currentLevel: input.currentLevel,
    requestedLevel: input.requestedLevel,
    reason: input.reason
  });
  if (routed.oneShot !== true) {
    throw new CoworkProtocolError(
      "CONTEXT_BUDGET_EXCEEDED",
      "A context expansion must request exactly one higher level"
    );
  }
  const relatedContext = truncateWithEllipsis(
    input.relatedContext,
    CONTEXT_EXPANSION_LIMIT
  );

  return {
    protocolVersion: focusPacket.protocolVersion,
    type: "context-expansion",
    sessionId: focusPacket.sessionId,
    source: "agent-context-request",
    capabilityLevel: focusPacket.capabilityLevel,
    targetId: focusPacket.targetId,
    pageVersion: focusPacket.pageVersion,
    focus: focusPacket.focus,
    capabilityIds: focusPacket.capabilityIds,
    currentLevel: input.currentLevel,
    level: routed.level,
    oneShot: routed.oneShot,
    reason: routed.reason,
    relatedContext,
    metrics: {
      sourceContextCharacters: input.relatedContext.length,
      includedContextCharacters: relatedContext.length
    }
  };
}
