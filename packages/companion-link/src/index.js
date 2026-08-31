const PROTOCOL_VERSION = "0.1";
const LINK_VERSION = "0.1";
const DEFAULT_ENDPOINT = "http://127.0.0.1:47831/cowork/v1";
const DEFAULT_TIMEOUT_MILLISECONDS = 2_000;
const MAX_RESPONSE_CHARACTERS = 12_000;

export class CompanionLinkError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CompanionLinkError";
    this.code = code;
  }
}

function requiredText(value, label, limit = 200) {
  if (typeof value !== "string" || value.trim() === "" || value.length > limit) {
    throw new CompanionLinkError(
      "INVALID_COMPANION_MESSAGE",
      `${label} must contain between 1 and ${limit} characters`
    );
  }
  return value;
}

function cloneJson(value, label) {
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new CompanionLinkError(
      "INVALID_COMPANION_MESSAGE",
      `${label} must be JSON-serializable`
    );
  }
  if (serialized === undefined) {
    throw new CompanionLinkError(
      "INVALID_COMPANION_MESSAGE",
      `${label} must be JSON-serializable`
    );
  }
  return JSON.parse(serialized);
}

function assertLoopbackEndpoint(endpoint) {
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw new CompanionLinkError(
      "INVALID_COMPANION_ENDPOINT",
      "Companion endpoint must be an absolute loopback HTTP URL"
    );
  }
  const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
  if (url.protocol !== "http:" || !loopbackHosts.has(url.hostname)) {
    throw new CompanionLinkError(
      "INVALID_COMPANION_ENDPOINT",
      "Companion Link permits only an explicit loopback HTTP endpoint"
    );
  }
  return url.href.replace(/\/$/, "");
}

function assertSnapshot(snapshot, sessionId) {
  if (
    snapshot?.protocolVersion !== PROTOCOL_VERSION ||
    snapshot?.type !== "session-snapshot" ||
    snapshot.sessionId !== sessionId ||
    !Number.isInteger(snapshot.revision) ||
    snapshot.revision < 0 ||
    !snapshot.state ||
    typeof snapshot.state !== "object" ||
    Array.isArray(snapshot.state)
  ) {
    throw new CompanionLinkError(
      "INVALID_COMPANION_MESSAGE",
      "Companion join requires a current versioned session snapshot"
    );
  }
  return cloneJson(snapshot, "session snapshot");
}

function assertContext(context, sessionId) {
  if (context === null || context === undefined) return null;
  if (
    context?.protocolVersion !== PROTOCOL_VERSION ||
    context?.type !== "context-snapshot" ||
    context.sessionId !== sessionId ||
    !Number.isInteger(context.revision) ||
    context.revision < 0 ||
    !Array.isArray(context.recentTurns)
  ) {
    throw new CompanionLinkError(
      "INVALID_COMPANION_MESSAGE",
      "Companion join context must match the Cowork session"
    );
  }
  return cloneJson(context, "session context");
}

function assertAck(value, expected) {
  if (
    value?.protocolVersion !== PROTOCOL_VERSION ||
    value?.linkVersion !== LINK_VERSION ||
    value?.type !== expected.type ||
    value.sessionId !== expected.sessionId ||
    typeof value.linkSessionId !== "string" ||
    value.linkSessionId.length === 0 ||
    !Number.isInteger(value.acceptedRevision) ||
    value.acceptedRevision !== expected.revision
  ) {
    throw new CompanionLinkError(
      "COMPANION_REVISION_MISMATCH",
      "Companion did not acknowledge the exact Cowork session revision"
    );
  }
  if (expected.type === "companion-join-ack") {
    const handoff = value.authorityDeltas;
    if (
      value.authorityRevision !== expected.revision + 2 ||
      handoff?.protocolVersion !== PROTOCOL_VERSION ||
      handoff?.type !== "session-delta-batch" ||
      handoff.sessionId !== expected.sessionId ||
      handoff.afterRevision !== expected.revision ||
      handoff.toRevision !== value.authorityRevision ||
      handoff.currentRevision !== value.authorityRevision ||
      handoff.hasMore !== false ||
      !Array.isArray(handoff.events) ||
      handoff.events.length !== 2 ||
      handoff.events[0]?.protocolVersion !== PROTOCOL_VERSION ||
      handoff.events[0]?.type !== "session-delta" ||
      handoff.events[0]?.sessionId !== expected.sessionId ||
      handoff.events[0]?.revision !== expected.revision + 1 ||
      handoff.events[0]?.kind !== "surface-handoff" ||
      handoff.events[1]?.protocolVersion !== PROTOCOL_VERSION ||
      handoff.events[1]?.type !== "session-delta" ||
      handoff.events[1]?.sessionId !== expected.sessionId ||
      handoff.events[1]?.revision !== value.authorityRevision ||
      handoff.events[1]?.kind !== "model-seat-claimed"
    ) {
      throw new CompanionLinkError(
        "COMPANION_REVISION_MISMATCH",
        "Companion authority handoff did not continue from the exact joined revision"
      );
    }
  }
  return cloneJson(value, "Companion acknowledgement");
}

function assertSurfaceAck(value, expected) {
  if (
    value?.protocolVersion !== PROTOCOL_VERSION ||
    value?.linkVersion !== LINK_VERSION ||
    value?.type !== "companion-surface-ack" ||
    value.sessionId !== expected.sessionId ||
    value.linkSessionId !== expected.linkSessionId ||
    value.observedRevision !== expected.observedRevision ||
    !Number.isInteger(value.acceptedRevision) ||
    value.acceptedRevision < expected.observedRevision
  ) {
    throw new CompanionLinkError(
      "COMPANION_REVISION_MISMATCH",
      "Companion did not acknowledge the bounded surface event"
    );
  }
  return cloneJson(value, "Companion surface acknowledgement");
}

export function createCompanionHello({
  sessionId,
  surfaceId,
  revision,
  origin,
  capabilityDigest = ""
}) {
  if (!Number.isInteger(revision) || revision < 0) {
    throw new CompanionLinkError(
      "INVALID_COMPANION_MESSAGE",
      "Companion hello revision must be a non-negative integer"
    );
  }
  let normalizedOrigin;
  try {
    normalizedOrigin = new URL(origin).origin;
  } catch {
    throw new CompanionLinkError(
      "INVALID_COMPANION_MESSAGE",
      "Companion hello requires an absolute website origin"
    );
  }
  return {
    protocolVersion: PROTOCOL_VERSION,
    linkVersion: LINK_VERSION,
    type: "companion-hello",
    sessionId: requiredText(sessionId, "sessionId"),
    surfaceId: requiredText(surfaceId, "surfaceId"),
    revision,
    origin: normalizedOrigin,
    capabilityDigest:
      typeof capabilityDigest === "string" ? capabilityDigest.slice(0, 200) : ""
  };
}

export function createHttpCompanionLink({
  endpoint = DEFAULT_ENDPOINT,
  fetchImpl = globalThis.fetch,
  timeoutMilliseconds = DEFAULT_TIMEOUT_MILLISECONDS
} = {}) {
  const baseUrl = assertLoopbackEndpoint(endpoint);
  const joinedSessions = new Map();
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");
  if (
    !Number.isInteger(timeoutMilliseconds) ||
    timeoutMilliseconds < 100 ||
    timeoutMilliseconds > 10_000
  ) {
    throw new CompanionLinkError(
      "INVALID_COMPANION_ENDPOINT",
      "Companion timeout must be between 100 and 10,000 milliseconds"
    );
  }

  async function post(pathname, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMilliseconds);
    try {
      let response;
      try {
        response = await fetchImpl(`${baseUrl}${pathname}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
          targetAddressSpace: "loopback"
        });
      } catch {
        throw new CompanionLinkError(
          "COMPANION_UNAVAILABLE",
          "Local Cowork Companion is unavailable or permission was not granted"
        );
      }
      if (!response?.ok) {
        throw new CompanionLinkError(
          "COMPANION_REJECTED",
          `Local Cowork Companion rejected the request with status ${response?.status ?? 0}`
        );
      }
      const text = await response.text();
      if (text.length > MAX_RESPONSE_CHARACTERS) {
        throw new CompanionLinkError(
          "INVALID_COMPANION_MESSAGE",
          "Companion response exceeded the bounded link budget"
        );
      }
      try {
        return JSON.parse(text);
      } catch {
        throw new CompanionLinkError(
          "INVALID_COMPANION_MESSAGE",
          "Companion response was not valid JSON"
        );
      }
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async join({ hello, snapshot, context = null }) {
      if (hello?.type !== "companion-hello") {
        throw new CompanionLinkError(
          "INVALID_COMPANION_MESSAGE",
          "Companion join requires a versioned hello"
        );
      }
      const normalizedSnapshot = assertSnapshot(snapshot, hello.sessionId);
      if (hello.revision !== normalizedSnapshot.revision) {
        throw new CompanionLinkError(
          "COMPANION_REVISION_MISMATCH",
          "Companion hello and snapshot revisions differ"
        );
      }
      const response = await post("/sessions/join", {
        hello: cloneJson(hello, "Companion hello"),
        snapshot: normalizedSnapshot,
        context: assertContext(context, hello.sessionId)
      });
      const acknowledgement = assertAck(response, {
        type: "companion-join-ack",
        sessionId: hello.sessionId,
        revision: normalizedSnapshot.revision
      });
      joinedSessions.set(acknowledgement.linkSessionId, hello.sessionId);
      return acknowledgement;
    },

    async pullDeltas({ linkSessionId, afterRevision, limit = 64 }) {
      requiredText(linkSessionId, "linkSessionId");
      const sessionId = joinedSessions.get(linkSessionId);
      if (
        !sessionId ||
        !Number.isInteger(afterRevision) ||
        afterRevision < 0 ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 64
      ) {
        throw new CompanionLinkError(
          "INVALID_COMPANION_MESSAGE",
          "Companion delta pull requires a joined session and valid cursor"
        );
      }
      const batch = await post(
        `/sessions/${encodeURIComponent(linkSessionId)}/deltas/read`,
        { afterRevision, limit }
      );
      if (
        batch?.protocolVersion !== PROTOCOL_VERSION ||
        batch?.type !== "session-delta-batch" ||
        batch.sessionId !== sessionId ||
        batch.afterRevision !== afterRevision ||
        !Number.isInteger(batch.toRevision) ||
        !Number.isInteger(batch.currentRevision) ||
        !Array.isArray(batch.events)
      ) {
        throw new CompanionLinkError(
          "COMPANION_REVISION_MISMATCH",
          "Companion delta response did not continue the joined session"
        );
      }
      return cloneJson(batch, "Companion delta batch");
    },

    async reportSurface({
      linkSessionId,
      surfaceId,
      visibility,
      observedRevision
    }) {
      requiredText(linkSessionId, "linkSessionId");
      const sessionId = joinedSessions.get(linkSessionId);
      if (
        !sessionId ||
        !["hidden", "visible"].includes(visibility) ||
        !Number.isInteger(observedRevision) ||
        observedRevision < 0
      ) {
        throw new CompanionLinkError(
          "INVALID_COMPANION_MESSAGE",
          "Companion surface reports require a joined session, visibility and cursor"
        );
      }
      const event = {
        protocolVersion: PROTOCOL_VERSION,
        linkVersion: LINK_VERSION,
        type: "surface-event",
        sessionId,
        surfaceId: requiredText(surfaceId, "surfaceId"),
        event: `page-${visibility}`,
        observedRevision
      };
      const acknowledgement = await post(
        `/sessions/${encodeURIComponent(linkSessionId)}/surface-events`,
        { event }
      );
      return assertSurfaceAck(acknowledgement, {
        sessionId,
        linkSessionId,
        observedRevision
      });
    },

    async pushDeltas({ linkSessionId, batch }) {
      requiredText(linkSessionId, "linkSessionId");
      if (
        batch?.type !== "session-delta-batch" ||
        typeof batch.sessionId !== "string" ||
        !Number.isInteger(batch.afterRevision) ||
        !Number.isInteger(batch.toRevision) ||
        !Array.isArray(batch.events)
      ) {
        throw new CompanionLinkError(
          "INVALID_COMPANION_MESSAGE",
          "Companion delta push requires a versioned session delta batch"
        );
      }
      const response = await post(
        `/sessions/${encodeURIComponent(linkSessionId)}/deltas`,
        { batch: cloneJson(batch, "session delta batch") }
      );
      return assertAck(response, {
        type: "companion-delta-ack",
        sessionId: batch.sessionId,
        revision: batch.toRevision
      });
    }
  };
}
