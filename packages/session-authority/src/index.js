const PROTOCOL_VERSION = "0.1";
const DEFAULT_MAX_EVENTS = 64;
const MAX_EVENT_JSON_CHARACTERS = 12_000;
const MAX_BRIEFING_CHARACTERS = 1_200;
const MAX_ID_CHARACTERS = 200;
const MAX_CAUSE_REFS = 8;

export class CoworkSessionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CoworkSessionError";
    this.code = code;
  }
}

function requiredText(value, label, limit = MAX_ID_CHARACTERS) {
  if (typeof value !== "string" || value.trim() === "" || value.length > limit) {
    throw new CoworkSessionError(
      "INVALID_SESSION_MESSAGE",
      `${label} must contain between 1 and ${limit} characters`
    );
  }
  return value;
}

function cloneJson(value, label = "value") {
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new CoworkSessionError(
      "INVALID_SESSION_MESSAGE",
      `${label} must be JSON-serializable`
    );
  }
  if (serialized === undefined) {
    throw new CoworkSessionError(
      "INVALID_SESSION_MESSAGE",
      `${label} must be JSON-serializable`
    );
  }
  return JSON.parse(serialized);
}

function assertState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CoworkSessionError(
      "INVALID_SESSION_STATE",
      "Cowork session state must be a JSON object"
    );
  }
  return cloneJson(value, "session state");
}

function boundedText(value, limit) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 1))}…`;
}

function stateChanges(previous, next) {
  const changes = [];
  const keys = [...new Set([...Object.keys(previous), ...Object.keys(next)])].sort();
  for (const key of keys) {
    if (!Object.hasOwn(next, key)) {
      changes.push({ key, operation: "delete" });
      continue;
    }
    if (!Object.hasOwn(previous, key) || JSON.stringify(previous[key]) !== JSON.stringify(next[key])) {
      changes.push({ key, operation: "set", value: cloneJson(next[key], `state.${key}`) });
    }
  }
  return changes;
}

function validateCauseRefs(causeRefs) {
  if (
    !Array.isArray(causeRefs) ||
    causeRefs.length > MAX_CAUSE_REFS ||
    causeRefs.some(
      (reference) =>
        typeof reference !== "string" ||
        reference.length === 0 ||
        reference.length > MAX_ID_CHARACTERS
    )
  ) {
    throw new CoworkSessionError(
      "INVALID_SESSION_MESSAGE",
      `causeRefs are limited to ${MAX_CAUSE_REFS} non-empty identifiers`
    );
  }
  return [...causeRefs];
}

export function createCoworkSessionAuthority({
  sessionId,
  initialState,
  primarySurface,
  initialRevision = 0,
  maxEvents = DEFAULT_MAX_EVENTS,
  createEventId = (revision) => `${sessionId}:event:${revision}`
}) {
  requiredText(sessionId, "sessionId");
  if (!Number.isInteger(initialRevision) || initialRevision < 0) {
    throw new CoworkSessionError(
      "INVALID_SESSION_STATE",
      "initialRevision must be a non-negative integer"
    );
  }
  if (!Number.isInteger(maxEvents) || maxEvents < 1 || maxEvents > 256) {
    throw new CoworkSessionError(
      "INVALID_SESSION_STATE",
      "maxEvents must be an integer between 1 and 256"
    );
  }

  const surface = {
    primarySurfaceId: requiredText(primarySurface?.surfaceId, "primary surfaceId"),
    kind: requiredText(primarySurface?.kind, "primary surface kind", 40),
    reason: boundedText(primarySurface?.reason ?? "Session started", 160)
  };
  let state = assertState({ ...initialState, surface });
  let revision = initialRevision;
  let events = [];
  const subscribers = new Set();

  function notify(event) {
    const snapshot = readSnapshot();
    for (const subscriber of subscribers) {
      subscriber({ event: cloneJson(event), snapshot });
    }
  }

  function appendEvent({ kind, sourceSurfaceId, changes = [], payload = null, causeRefs = [], at }) {
    revision += 1;
    const event = {
      protocolVersion: PROTOCOL_VERSION,
      type: "session-delta",
      sessionId,
      revision,
      eventId: requiredText(createEventId(revision), "eventId"),
      kind: requiredText(kind, "event kind", 80),
      sourceSurfaceId: requiredText(sourceSurfaceId, "sourceSurfaceId"),
      causeRefs: validateCauseRefs(causeRefs),
      changes: cloneJson(changes, "session changes"),
      payload: payload === null ? null : cloneJson(payload, "session event payload"),
      at: requiredText(at, "event timestamp", 80)
    };
    if (JSON.stringify(event).length > MAX_EVENT_JSON_CHARACTERS) {
      revision -= 1;
      throw new CoworkSessionError(
        "SESSION_EVENT_TOO_LARGE",
        `Session deltas are limited to ${MAX_EVENT_JSON_CHARACTERS} JSON characters`
      );
    }
    events = [...events, event].slice(-maxEvents);
    notify(event);
    return cloneJson(event);
  }

  function commit({
    kind,
    nextState,
    sourceSurfaceId = state.surface.primarySurfaceId,
    causeRefs = [],
    payload = null,
    at = new Date().toISOString(),
    recordUnchanged = false
  }) {
    const normalized = assertState(nextState);
    const changes = stateChanges(state, normalized);
    if (changes.length === 0 && payload === null && !recordUnchanged) {
      return { committed: false, revision, state: cloneJson(state) };
    }
    state = normalized;
    const event = appendEvent({
      kind,
      sourceSurfaceId,
      changes,
      payload,
      causeRefs,
      at
    });
    return { committed: true, revision, event, state: cloneJson(state) };
  }

  function record({
    kind,
    sourceSurfaceId = state.surface.primarySurfaceId,
    payload,
    causeRefs = [],
    at = new Date().toISOString()
  }) {
    return appendEvent({
      kind,
      sourceSurfaceId,
      payload,
      causeRefs,
      at
    });
  }

  function claimSurface({
    surfaceId,
    kind,
    reason,
    expectedRevision = revision,
    sourceSurfaceId = state.surface.primarySurfaceId,
    at = new Date().toISOString()
  }) {
    if (expectedRevision !== revision) {
      throw new CoworkSessionError(
        "STALE_SESSION_VERSION",
        `Surface handoff expected revision ${expectedRevision}, current revision is ${revision}`
      );
    }
    const nextSurface = {
      primarySurfaceId: requiredText(surfaceId, "surfaceId"),
      kind: requiredText(kind, "surface kind", 40),
      reason: boundedText(reason, 160)
    };
    const result = commit({
      kind: "surface-handoff",
      nextState: { ...state, surface: nextSurface },
      sourceSurfaceId,
      payload: { previousSurface: state.surface, nextSurface },
      at,
      recordUnchanged: true
    });
    return {
      protocolVersion: PROTOCOL_VERSION,
      type: "surface-lease",
      sessionId,
      revision: result.revision,
      surface: cloneJson(nextSurface)
    };
  }

  function claimModelSeat({
    leaseId,
    owner,
    providerId,
    contextAuthority,
    expiresAt,
    expectedRevision = revision,
    sourceSurfaceId = state.surface.primarySurfaceId,
    at = new Date().toISOString()
  }) {
    if (expectedRevision !== revision) {
      throw new CoworkSessionError(
        "STALE_SESSION_VERSION",
        `Model seat claim expected revision ${expectedRevision}, current revision is ${revision}`
      );
    }
    const nowMilliseconds = Date.parse(at);
    const expiryMilliseconds = Date.parse(expiresAt);
    if (
      !Number.isFinite(nowMilliseconds) ||
      !Number.isFinite(expiryMilliseconds) ||
      expiryMilliseconds <= nowMilliseconds
    ) {
      throw new CoworkSessionError(
        "INVALID_MODEL_SEAT_LEASE",
        "Model seat expiry must be a valid time after the claim"
      );
    }
    const currentSeatExpiry = Date.parse(state.modelSeat?.expiresAt);
    const currentSeatActive =
      state.modelSeat != null &&
      typeof state.modelSeat?.leaseId === "string" &&
      Number.isFinite(currentSeatExpiry) &&
      nowMilliseconds < currentSeatExpiry;
    if (currentSeatActive) {
      throw new CoworkSessionError(
        "MODEL_SEAT_OCCUPIED",
        "Another model owner currently holds the Cowork model seat"
      );
    }
    const modelSeat = {
      leaseId: requiredText(leaseId, "model seat leaseId"),
      owner: requiredText(owner, "model seat owner", 80),
      providerId: requiredText(providerId, "model seat providerId", 120),
      contextAuthority: requiredText(
        contextAuthority,
        "model seat contextAuthority",
        120
      ),
      expiresAt
    };
    const result = commit({
      kind: "model-seat-claimed",
      nextState: { ...state, modelSeat },
      sourceSurfaceId,
      payload: { modelSeat },
      at,
      recordUnchanged: true
    });
    return {
      protocolVersion: PROTOCOL_VERSION,
      type: "model-seat-lease",
      sessionId,
      revision: result.revision,
      modelSeat: cloneJson(modelSeat)
    };
  }

  function transferModelSeat({
    currentLeaseId,
    nextLease,
    handoffCapsule,
    expectedRevision = revision,
    sourceSurfaceId = state.surface.primarySurfaceId,
    at = new Date().toISOString()
  }) {
    if (expectedRevision !== revision) {
      throw new CoworkSessionError(
        "STALE_SESSION_VERSION",
        `Model seat transfer expected revision ${expectedRevision}, current revision is ${revision}`
      );
    }
    if (state.modelSeat?.leaseId !== currentLeaseId) {
      throw new CoworkSessionError(
        "MODEL_SEAT_LEASE_MISMATCH",
        "Only the current model-seat lease can authorize a transfer"
      );
    }
    if (
      handoffCapsule?.protocolVersion !== PROTOCOL_VERSION ||
      handoffCapsule?.type !== "handoff-capsule" ||
      handoffCapsule.sessionId !== sessionId ||
      handoffCapsule.revision !== expectedRevision
    ) {
      throw new CoworkSessionError(
        "INVALID_HANDOFF_CAPSULE",
        "Model-seat transfer requires a handoff capsule for the exact session revision"
      );
    }
    const nowMilliseconds = Date.parse(at);
    const expiryMilliseconds = Date.parse(nextLease?.expiresAt);
    if (
      !Number.isFinite(nowMilliseconds) ||
      !Number.isFinite(expiryMilliseconds) ||
      expiryMilliseconds <= nowMilliseconds
    ) {
      throw new CoworkSessionError(
        "INVALID_MODEL_SEAT_LEASE",
        "Transferred model-seat expiry must be after the transfer"
      );
    }
    const modelSeat = {
      leaseId: requiredText(nextLease?.leaseId, "model seat leaseId"),
      owner: requiredText(nextLease?.owner, "model seat owner", 80),
      providerId: requiredText(nextLease?.providerId, "model seat providerId", 120),
      contextAuthority: requiredText(
        nextLease?.contextAuthority,
        "model seat contextAuthority",
        120
      ),
      expiresAt: nextLease.expiresAt
    };
    const previousModelSeat = cloneJson(state.modelSeat);
    const capsule = cloneJson(handoffCapsule, "handoff capsule");
    const result = commit({
      kind: "model-seat-transferred",
      nextState: { ...state, modelSeat },
      sourceSurfaceId,
      payload: { previousModelSeat, modelSeat, handoffCapsule: capsule },
      causeRefs: [currentLeaseId],
      at,
      recordUnchanged: true
    });
    return {
      protocolVersion: PROTOCOL_VERSION,
      type: "model-seat-lease",
      sessionId,
      revision: result.revision,
      modelSeat: cloneJson(modelSeat),
      handoffCapsule: capsule
    };
  }

  function renewModelSeat({
    leaseId,
    expiresAt,
    expectedRevision = revision,
    sourceSurfaceId = state.surface.primarySurfaceId,
    at = new Date().toISOString()
  }) {
    if (expectedRevision !== revision) {
      throw new CoworkSessionError(
        "STALE_SESSION_VERSION",
        `Model seat renewal expected revision ${expectedRevision}, current revision is ${revision}`
      );
    }
    if (state.modelSeat?.leaseId !== leaseId) {
      throw new CoworkSessionError(
        "MODEL_SEAT_LEASE_MISMATCH",
        "Only the current model-seat lease can authorize a renewal"
      );
    }
    const nowMilliseconds = Date.parse(at);
    const currentExpiry = Date.parse(state.modelSeat.expiresAt);
    const nextExpiry = Date.parse(expiresAt);
    if (
      !Number.isFinite(nowMilliseconds) ||
      !Number.isFinite(currentExpiry) ||
      !Number.isFinite(nextExpiry) ||
      nowMilliseconds >= currentExpiry ||
      nextExpiry <= currentExpiry
    ) {
      throw new CoworkSessionError(
        "INVALID_MODEL_SEAT_LEASE",
        "Model seat renewal must extend a still-active lease"
      );
    }
    const modelSeat = { ...state.modelSeat, expiresAt };
    const result = commit({
      kind: "model-seat-renewed",
      nextState: { ...state, modelSeat },
      sourceSurfaceId,
      payload: { modelSeat },
      causeRefs: [leaseId],
      at,
      recordUnchanged: true
    });
    return {
      protocolVersion: PROTOCOL_VERSION,
      type: "model-seat-lease",
      sessionId,
      revision: result.revision,
      modelSeat: cloneJson(modelSeat)
    };
  }

  function readState() {
    return cloneJson(state);
  }

  function readSnapshot() {
    return {
      protocolVersion: PROTOCOL_VERSION,
      type: "session-snapshot",
      sessionId,
      revision,
      state: cloneJson(state)
    };
  }

  function readDeltas({ afterRevision, limit = maxEvents }) {
    if (
      !Number.isInteger(afterRevision) ||
      afterRevision < 0 ||
      afterRevision > revision ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > maxEvents
    ) {
      throw new CoworkSessionError(
        "INVALID_SESSION_MESSAGE",
        "Delta cursor and limit are outside the available session range"
      );
    }
    const earliestRevision = events[0]?.revision ?? revision + 1;
    if (afterRevision < earliestRevision - 1) {
      throw new CoworkSessionError(
        "SESSION_HISTORY_GAP",
        "The requested delta range was compacted; request a fresh session snapshot"
      );
    }
    const available = events.filter((event) => event.revision > afterRevision);
    const selected = available.slice(0, limit);
    return {
      protocolVersion: PROTOCOL_VERSION,
      type: "session-delta-batch",
      sessionId,
      afterRevision,
      toRevision: selected.at(-1)?.revision ?? afterRevision,
      currentRevision: revision,
      hasMore: available.length > selected.length,
      events: cloneJson(selected)
    };
  }

  function subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("session subscriber must be a function");
    }
    subscribers.add(listener);
    return () => subscribers.delete(listener);
  }

  return {
    claimModelSeat,
    claimSurface,
    commit,
    readDeltas,
    readSnapshot,
    readState,
    record,
    renewModelSeat,
    subscribe,
    transferModelSeat
  };
}

export function restoreCoworkSessionAuthority({
  snapshot,
  maxEvents = DEFAULT_MAX_EVENTS
}) {
  if (
    snapshot?.protocolVersion !== PROTOCOL_VERSION ||
    snapshot?.type !== "session-snapshot" ||
    !Number.isInteger(snapshot.revision) ||
    snapshot.revision < 0 ||
    !snapshot.state ||
    typeof snapshot.state !== "object" ||
    Array.isArray(snapshot.state) ||
    !snapshot.state.surface
  ) {
    throw new CoworkSessionError(
      "INVALID_SESSION_STATE",
      "Restoring a Cowork session requires a current versioned snapshot"
    );
  }
  return createCoworkSessionAuthority({
    sessionId: snapshot.sessionId,
    initialState: snapshot.state,
    primarySurface: {
      surfaceId: snapshot.state.surface.primarySurfaceId,
      kind: snapshot.state.surface.kind,
      reason: snapshot.state.surface.reason
    },
    initialRevision: snapshot.revision,
    maxEvents
  });
}

export function applySessionDeltaBatch({ snapshot, batch }) {
  if (
    snapshot?.protocolVersion !== PROTOCOL_VERSION ||
    snapshot?.type !== "session-snapshot" ||
    batch?.protocolVersion !== PROTOCOL_VERSION ||
    batch?.type !== "session-delta-batch" ||
    batch.sessionId !== snapshot.sessionId ||
    batch.afterRevision !== snapshot.revision ||
    batch.currentRevision !== batch.toRevision ||
    !Array.isArray(batch.events)
  ) {
    throw new CoworkSessionError(
      "STALE_SESSION_VERSION",
      "Session replica requires a delta batch continuing from its exact revision"
    );
  }
  const state = assertState(snapshot.state);
  let expectedRevision = snapshot.revision + 1;
  const forbiddenKeys = new Set(["__proto__", "constructor", "prototype"]);
  for (const event of batch.events) {
    if (
      event?.protocolVersion !== PROTOCOL_VERSION ||
      event?.type !== "session-delta" ||
      event.sessionId !== snapshot.sessionId ||
      event.revision !== expectedRevision ||
      !Array.isArray(event.changes)
    ) {
      throw new CoworkSessionError(
        "STALE_SESSION_VERSION",
        "Session replica deltas must be contiguous and belong to one session"
      );
    }
    for (const change of event.changes) {
      if (
        typeof change?.key !== "string" ||
        change.key.length === 0 ||
        forbiddenKeys.has(change.key) ||
        !new Set(["set", "delete"]).has(change.operation)
      ) {
        throw new CoworkSessionError(
          "INVALID_SESSION_MESSAGE",
          "Session replica delta contains an invalid state operation"
        );
      }
      if (change.operation === "delete") delete state[change.key];
      else state[change.key] = cloneJson(change.value, `state.${change.key}`);
    }
    expectedRevision += 1;
  }
  const appliedRevision = expectedRevision - 1;
  if (batch.toRevision !== appliedRevision) {
    throw new CoworkSessionError(
      "STALE_SESSION_VERSION",
      "Session replica delta batch ended at an unexpected revision"
    );
  }
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: "session-snapshot",
    sessionId: snapshot.sessionId,
    revision: appliedRevision,
    state
  };
}

export function createSessionBriefing({
  snapshot,
  focus = null,
  summary = "",
  pendingOfferIds = [],
  latestChangeIds = [],
  capabilityDigest = ""
}) {
  if (snapshot?.type !== "session-snapshot" || typeof snapshot.state !== "object") {
    throw new CoworkSessionError(
      "INVALID_SESSION_MESSAGE",
      "A current session snapshot is required for a briefing"
    );
  }
  const state = snapshot.state;
  const briefing = {
    protocolVersion: PROTOCOL_VERSION,
    type: "session-briefing",
    sessionId: requiredText(snapshot.sessionId, "sessionId"),
    revision: snapshot.revision,
    summary: boundedText(summary, 280),
    presence: {
      human: boundedText(state.humanPresence, 40),
      agent: boundedText(state.agentPresence, 40),
      mode: boundedText(state.effectiveMode, 40)
    },
    actionMode: boundedText(state.actionMode, 40),
    goal: boundedText(state.lease?.goal ?? "", 120),
    focus:
      focus === null
        ? null
        : {
            targetId: boundedText(focus.targetId, 160),
            label: boundedText(focus.focus?.label, 220),
            pageVersion: focus.pageVersion
          },
    pendingOfferIds: pendingOfferIds.slice(-3).map((id) => boundedText(id, 120)),
    latestChangeIds: latestChangeIds.slice(-3).map((id) => boundedText(id, 120)),
    capabilityDigest: boundedText(capabilityDigest, 160),
    modelSeat: {
      owner: boundedText(state.modelSeat?.owner, 40),
      contextAuthority: boundedText(state.modelSeat?.contextAuthority, 60)
    },
    lastConversation:
      state.lastConversation == null
        ? null
        : {
            human: boundedText(state.lastConversation.human, 160),
            assistant: boundedText(state.lastConversation.assistant, 240),
            status: boundedText(state.lastConversation.status, 40)
          },
    surface: {
      id: boundedText(state.surface?.primarySurfaceId, 120),
      kind: boundedText(state.surface?.kind, 40)
    }
  };
  if (JSON.stringify(briefing).length > MAX_BRIEFING_CHARACTERS) {
    throw new CoworkSessionError(
      "CONTEXT_BUDGET_EXCEEDED",
      `Session briefings are limited to ${MAX_BRIEFING_CHARACTERS} JSON characters`
    );
  }
  return briefing;
}
