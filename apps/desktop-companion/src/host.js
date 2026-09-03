import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createCoworkContextManager,
  restoreCoworkContextManager
} from "../../../packages/context-manager/src/index.js";
import {
  fromLegacyPresence,
  resolvePresenceMode,
  resolveWorkMode
} from "../../../packages/core/src/index.js";
import { createCoworkModelGateway } from "../../../packages/model-gateway/src/index.js";
import { coworkToolDefinitions } from "../../../packages/native-webmcp/src/index.js";
import { restoreCoworkSessionAuthority } from "../../../packages/session-authority/src/index.js";

const PROTOCOL_VERSION = "0.1";
const LINK_VERSION = "0.1";
const MAX_BODY_BYTES = 64 * 1024;
// A local agent may call exactly the tools a browser agent can call, so the
// allowlist is the published WebMCP registration rather than a second list.
const AGENT_TOOL_NAMES = new Set(
  (await coworkToolDefinitions()).map(({ name }) => name)
);
const AGENT_REQUEST_TIMEOUT_MILLISECONDS = 15_000;
const MAX_PENDING_AGENT_REQUESTS = 16;
const UI_ROOT = fileURLToPath(new URL("../ui/", import.meta.url));
const REFERENCE_UI_MARK = fileURLToPath(
  new URL("../../../packages/reference-ui/assets/cowork-dialogue-mark.svg", import.meta.url)
);
const REFERENCE_UI_MODULE = fileURLToPath(
  new URL("../../../packages/reference-ui/src/index.js", import.meta.url)
);

export class CompanionHostError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "CompanionHostError";
    this.code = code;
    this.status = status;
  }
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function readAgentEngagement(state) {
  if (["collaborating", "observing", "paused"].includes(state.agentEngagement)) {
    return state.agentEngagement;
  }
  // Fail closed, and agree with packages/core `fromLegacyPresence`: a missing
  // engagement field means the offer-and-click rhythm, so the model advises.
  // Defaulting to "collaborating" would claim the model is executing, which
  // without a grant is exactly the authority the protocol refuses to give it.
  return state.agentPresence === "paused" ? "paused" : "observing";
}

function hasCurrentSoloLease(state, at) {
  const currentMilliseconds = Date.parse(at);
  const expiryMilliseconds = Date.parse(state.lease?.expiresAt);
  return (
    state.lease !== null &&
    typeof state.lease === "object" &&
    Number.isFinite(currentMilliseconds) &&
    Number.isFinite(expiryMilliseconds) &&
    currentMilliseconds < expiryMilliseconds
  );
}

function resolveCompanionMode({ state, humanPresence, agentPresence, agentEngagement, at }) {
  const effectiveMode = resolvePresenceMode({
    humanPresence,
    agentPresence,
    leaseValid: hasCurrentSoloLease(state, at)
  });
  return agentEngagement === "observing" && humanPresence !== "present"
    ? "idle"
    : effectiveMode;
}

/**
 * The three status variables per actor, read back out of the 0.1 presence
 * values the Companion mutates on the replicated state.
 *
 * The solo lease is the model's authority record, and the only one. A human
 * sitting in front of the screen is not a substitute: `executeSoloAction`
 * demands a lease either way, so granting authority on presence alone would
 * make the cockpit promise a click right that does not exist - and, because
 * `canExecute` and `canPropose` are mutually exclusive, would leave the model
 * unable to execute *or* propose. Without a record it visibly advises.
 *
 * Both partners share the connected page as their area, except a model
 * working under a lease, which is on that lease's goal.
 */
function resolveCompanionWorkMode({ state, agentEngagement, at, area }) {
  const { human, model } = fromLegacyPresence({
    humanPresence: state.humanPresence,
    agentPresence: state.agentPresence,
    agentEngagement
  });
  const leaseValid = hasCurrentSoloLease(state, at);
  return resolveWorkMode({
    human: { ...human, area },
    model: {
      ...model,
      area: leaseValid ? state.lease?.goal ?? area : area
    },
    modelAuthorityValid: leaseValid
  });
}

function assertLoopbackHostname(hostname) {
  if (!new Set(["127.0.0.1", "localhost", "::1"]).has(hostname)) {
    throw new CompanionHostError(
      "NON_LOOPBACK_BIND_REJECTED",
      "Desktop Companion host may bind only to loopback"
    );
  }
}

function formatLoopbackOrigin(hostname, port) {
  const host = hostname.includes(":") ? `[${hostname}]` : hostname;
  return `http://${host}:${port}`;
}

function assertAllowedOrigins(origins) {
  if (
    !Array.isArray(origins) ||
    origins.length === 0 ||
    origins.some((origin) => {
      try {
        return new URL(origin).origin !== origin || origin === "*";
      } catch {
        return true;
      }
    })
  ) {
    throw new CompanionHostError(
      "INVALID_ORIGIN_ALLOWLIST",
      "Desktop Companion requires explicit absolute website origins"
    );
  }
  return new Set(origins);
}

function writeJson(response, status, body, origin = null) {
  const serialized = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(serialized),
    "cache-control": "no-store",
    ...(origin
      ? {
          "access-control-allow-origin": origin,
          vary: "Origin"
        }
      : {})
  });
  response.end(serialized);
}

function writeStatic(response, status, body, contentType) {
  response.writeHead(status, {
    "content-type": contentType,
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    "content-security-policy": [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "connect-src 'self'",
      "img-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'"
    ].join("; "),
    "x-content-type-options": "nosniff"
  });
  response.end(body);
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new CompanionHostError(
        "COMPANION_MESSAGE_TOO_LARGE",
        "Companion request exceeded the local link budget",
        413
      );
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new CompanionHostError(
      "INVALID_COMPANION_MESSAGE",
      "Companion request must contain JSON"
    );
  }
}

function validateJoin(body, requestOrigin) {
  const { hello, snapshot, context = null } = body ?? {};
  if (
    hello?.protocolVersion !== PROTOCOL_VERSION ||
    hello?.linkVersion !== LINK_VERSION ||
    hello?.type !== "companion-hello" ||
    hello.origin !== requestOrigin ||
    snapshot?.protocolVersion !== PROTOCOL_VERSION ||
    snapshot?.type !== "session-snapshot" ||
    snapshot.sessionId !== hello.sessionId ||
    snapshot.revision !== hello.revision ||
    !Number.isInteger(snapshot.revision) ||
    snapshot.revision < 0 ||
    !snapshot.state ||
    typeof snapshot.state !== "object" ||
    Array.isArray(snapshot.state)
  ) {
    throw new CompanionHostError(
      "INVALID_COMPANION_MESSAGE",
      "Companion join did not contain one exact Cowork snapshot"
    );
  }
  if (
    context !== null &&
    (
      context?.protocolVersion !== PROTOCOL_VERSION ||
      context?.type !== "context-snapshot" ||
      context.sessionId !== snapshot.sessionId ||
      !Number.isInteger(context.revision) ||
      context.revision < 0 ||
      !Array.isArray(context.recentTurns)
    )
  ) {
    throw new CompanionHostError(
      "INVALID_COMPANION_MESSAGE",
      "Companion join context did not match the joined Cowork session"
    );
  }
  return {
    hello: cloneJson(hello),
    snapshot: cloneJson(snapshot),
    context: context === null ? null : cloneJson(context)
  };
}

export function createCompanionSessionHost({
  allowedOrigins,
  hostname = "127.0.0.1",
  port = 47831,
  sessionStorePath = null,
  sendModelTurn = null,
  modelProviderId = "preferred-model",
  modelSeatDurationMs = 30 * 60 * 1000,
  computerUse = null,
  agentRequestTimeoutMilliseconds = AGENT_REQUEST_TIMEOUT_MILLISECONDS,
  now = () => new Date().toISOString(),
  createLinkSessionId = () => randomUUID()
}) {
  assertLoopbackHostname(hostname);
  const originAllowlist = assertAllowedOrigins(allowedOrigins);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new CompanionHostError("INVALID_PORT", "Companion port is invalid");
  }
  if (sessionStorePath !== null && !path.isAbsolute(sessionStorePath)) {
    throw new CompanionHostError(
      "INVALID_SESSION_STORE",
      "Desktop Companion session store path must be absolute"
    );
  }
  if (sendModelTurn !== null && typeof sendModelTurn !== "function") {
    throw new TypeError("sendModelTurn must be a function when a model is configured");
  }
  if (
    computerUse !== null &&
    ["readStatus", "activate", "deactivate", "refreshStatus", "close"].some(
      (method) => typeof computerUse?.[method] !== "function"
    )
  ) {
    throw new TypeError("computerUse must be a complete profiled execution adapter");
  }
  if (
    typeof modelProviderId !== "string" ||
    modelProviderId.trim() === "" ||
    modelProviderId.length > 120 ||
    !Number.isInteger(modelSeatDurationMs) ||
    modelSeatDurationMs < 60_000 ||
    modelSeatDurationMs > 24 * 60 * 60 * 1000
  ) {
    throw new TypeError("Companion model seat configuration is invalid");
  }
  if (
    !Number.isInteger(agentRequestTimeoutMilliseconds) ||
    agentRequestTimeoutMilliseconds < 100 ||
    agentRequestTimeoutMilliseconds > 120_000
  ) {
    throw new TypeError("Companion agent request timeout must be in 100..120000 milliseconds");
  }
  const sessions = new Map();
  // Host-wide, like Computer Use: an MCP client connects to this Companion,
  // not to one page, and the cockpit says so before any page has linked.
  const agentRelay = { clientName: null, toolCalls: 0 };
  let storeLoaded = false;
  let persistence = Promise.resolve();

  function createSessionRuntime({
    linkSessionId,
    origin,
    hello,
    snapshot,
    context,
    authority,
    lastPageContactAt = null
  }) {
    const contextManager = context === null
      ? createCoworkContextManager({ sessionId: snapshot.sessionId })
      : restoreCoworkContextManager({ snapshot: context });
    const gateway = sendModelTurn === null
      ? null
      : createCoworkModelGateway({
          sessionId: snapshot.sessionId,
          seatOwner: "cowork-companion",
          readSnapshot: () => authority.readSnapshot(),
          readModelContext: (options) => contextManager.readModelContext(options),
          sendTurn: sendModelTurn,
          now
        });
    return {
      origin,
      hello: cloneJson(hello),
      snapshot: cloneJson(snapshot),
      contextManager,
      authority,
      gateway,
      submittedTurns: new Map(),
      // Tool calls a local agent placed, waiting for the page to pull them,
      // and the callers waiting for the page's answer.
      agentRequests: [],
      awaitingAgentResults: new Map(),
      linkSessionId,
      lastPageContactAt
    };
  }

  async function loadSessionStore() {
    if (storeLoaded || sessionStorePath === null) return;
    storeLoaded = true;
    let serialized;
    try {
      serialized = await readFile(sessionStorePath, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw new CompanionHostError(
        "SESSION_STORE_UNAVAILABLE",
        "Desktop Companion could not read its session store",
        500
      );
    }
    let stored;
    try {
      stored = JSON.parse(serialized);
    } catch {
      throw new CompanionHostError(
        "INVALID_SESSION_STORE",
        "Desktop Companion session store is not valid JSON",
        500
      );
    }
    if (
      stored?.storeVersion !== 1 ||
      !Array.isArray(stored.sessions) ||
      stored.sessions.some(
        (entry) =>
          typeof entry?.linkSessionId !== "string" ||
          typeof entry?.origin !== "string" ||
          !originAllowlist.has(entry.origin) ||
          entry?.snapshot?.type !== "session-snapshot" ||
          (entry.context !== null && entry.context?.type !== "context-snapshot")
      )
    ) {
      throw new CompanionHostError(
        "INVALID_SESSION_STORE",
        "Desktop Companion session store does not match the supported format",
        500
      );
    }
    for (const { linkSessionId, origin, hello, snapshot, context = null } of stored.sessions) {
      const authority = restoreCoworkSessionAuthority({ snapshot });
      sessions.set(linkSessionId, createSessionRuntime({
        linkSessionId,
        origin,
        hello,
        snapshot,
        context,
        authority
      }));
    }
  }

  function persistSessions() {
    if (sessionStorePath === null) return Promise.resolve();
    persistence = persistence.then(async () => {
      const body = JSON.stringify({
        storeVersion: 1,
        sessions: [...sessions].map(([linkSessionId, value]) => ({
          linkSessionId,
          origin: value.origin,
          hello: cloneJson(value.hello),
          snapshot: cloneJson(value.snapshot),
          context: value.contextManager.readContext()
        }))
      });
      await mkdir(path.dirname(sessionStorePath), { recursive: true });
      const temporaryPath = `${sessionStorePath}.${process.pid}.tmp`;
      await writeFile(temporaryPath, body, "utf8");
      await rename(temporaryPath, sessionStorePath);
    });
    return persistence;
  }

  async function readComputerUseStatus() {
    if (computerUse === null) return null;
    let status = computerUse.readStatus();
    if (status?.activeSessionId && status?.indicatorVisible) {
      try {
        status = await computerUse.refreshStatus({ sessionId: status.activeSessionId });
      } catch {
        status = computerUse.readStatus();
      }
    }
    return status;
  }

  // A local agent (Claude Code, Codex CLI, any MCP client) calls a Cowork tool
  // on this host; the page runs it. The Companion is the session authority, so
  // it holds the request until the page pulls it, and answers the agent with
  // whatever the page returned - or with PAGE_UNREACHABLE, never with silence.
  function resolveAgentSession(linkSessionId) {
    if (typeof linkSessionId === "string" && linkSessionId !== "") {
      const linkSession = sessions.get(linkSessionId);
      if (!linkSession) {
        throw new CompanionHostError(
          "PAGE_UNREACHABLE",
          "The named Companion link session is unavailable",
          503
        );
      }
      return linkSession;
    }
    const linked = [...sessions.values()].filter(
      (value) => value.lastPageContactAt !== null
    );
    if (linked.length === 0) {
      throw new CompanionHostError(
        "PAGE_UNREACHABLE",
        "No Cowork page is linked to this Companion",
        503
      );
    }
    if (linked.length > 1) {
      throw new CompanionHostError(
        "AMBIGUOUS_LINK_SESSION",
        "Several pages are linked; name one linkSessionId",
        409
      );
    }
    return linked[0];
  }

  // Async throughout, so a rejected call never arrives as a synchronous throw
  // at a caller that is awaiting it.
  async function callAgentTool({
    name,
    arguments: toolArguments = {},
    linkSessionId = null,
    clientName = null
  }) {
    if (!AGENT_TOOL_NAMES.has(name)) {
      throw new CompanionHostError(
        "UNKNOWN_TOOL",
        "That tool is not part of the Cowork tool set",
        404
      );
    }
    if (
      !toolArguments ||
      typeof toolArguments !== "object" ||
      Array.isArray(toolArguments)
    ) {
      throw new CompanionHostError(
        "INVALID_TOOL_ARGUMENTS",
        "Cowork tool arguments must be a JSON object"
      );
    }
    const linkSession = resolveAgentSession(linkSessionId);
    if (
      linkSession.agentRequests.length + linkSession.awaitingAgentResults.size >=
      MAX_PENDING_AGENT_REQUESTS
    ) {
      throw new CompanionHostError(
        "AGENT_QUEUE_FULL",
        "Too many Cowork tool calls are already waiting for this page",
        429
      );
    }
    if (typeof clientName === "string" && clientName.trim() !== "") {
      agentRelay.clientName = clientName.trim().slice(0, 120);
    }
    agentRelay.toolCalls += 1;
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        linkSession.awaitingAgentResults.delete(requestId);
        linkSession.agentRequests = linkSession.agentRequests.filter(
          (request) => request.requestId !== requestId
        );
        reject(new CompanionHostError(
          "PAGE_UNREACHABLE",
          "The linked Cowork page did not answer this tool call",
          504
        ));
      }, agentRequestTimeoutMilliseconds);
      linkSession.awaitingAgentResults.set(requestId, { resolve, reject, timer });
      linkSession.agentRequests.push({
        requestId,
        name,
        arguments: cloneJson(toolArguments),
        at: now()
      });
    });
  }

  function takeAgentRequests(linkSession) {
    const requests = linkSession.agentRequests;
    linkSession.agentRequests = [];
    return requests;
  }

  function settleAgentRequest(linkSession, { requestId, result = null, error = null }) {
    const waiting = linkSession.awaitingAgentResults.get(requestId);
    if (!waiting) {
      throw new CompanionHostError(
        "AGENT_REQUEST_NOT_FOUND",
        "No Cowork tool call is waiting under that id",
        404
      );
    }
    linkSession.awaitingAgentResults.delete(requestId);
    clearTimeout(waiting.timer);
    if (error !== null && error !== undefined) {
      // The page refused or failed the call. That is a tool failure, and it
      // reaches the agent as one - reporting it as success would tell an agent
      // a change happened that the page never made.
      waiting.reject(new CompanionHostError(
        typeof error.code === "string" && error.code !== "" ? error.code.slice(0, 120) : "TOOL_FAILED",
        typeof error.message === "string" ? error.message.slice(0, 200) : "The Cowork page rejected the tool call",
        422
      ));
      return { settled: "error" };
    }
    waiting.resolve(result === undefined ? null : cloneJson(result));
    return { settled: "result" };
  }

  async function readUiState() {
    const computerUseStatus = await readComputerUseStatus();
    return {
      protocolVersion: PROTOCOL_VERSION,
      type: "companion-ui-state",
      // Host-wide: the cockpit needs it before any page has connected.
      computerUseAvailable: computerUse !== null,
      agent: {
        client: agentRelay.clientName,
        toolCalls: agentRelay.toolCalls,
        pageLinked: [...sessions.values()].some(
          (value) => value.lastPageContactAt !== null
        )
      },
      sessions: [...sessions].map(([linkSessionId, value]) => {
        const snapshot = value.authority.readSnapshot();
        const agentEngagement = value.gateway === null
          ? "paused"
          : readAgentEngagement(snapshot.state);
        return {
          linkSessionId,
          sessionId: snapshot.sessionId,
          origin: value.origin,
          pageSurfaceId: value.hello?.surfaceId ?? null,
          lastPageContactAt: value.lastPageContactAt,
          revision: snapshot.revision,
          humanPresence: snapshot.state.humanPresence,
          agentPresence: snapshot.state.agentPresence,
          agentEngagement,
          effectiveMode: snapshot.state.effectiveMode,
          // Derived for the cockpit: status, work mode and the click right in
          // one shape. The wire above keeps its published 0.1 values.
          workMode: resolveCompanionWorkMode({
            state: snapshot.state,
            agentEngagement,
            at: now(),
            area: value.hello?.surfaceId ?? snapshot.state.surface?.primarySurfaceId ?? null
          }),
          surfaceKind: snapshot.state.surface?.kind,
          applicationSurfaceVisibility:
            snapshot.state.applicationSurface?.visibility ?? "unknown",
          modelAvailable: value.gateway !== null,
          modelIdentity: value.gateway === null ? null : modelProviderId,
          modelStatus: value.gateway?.readStatus() ?? null,
          lastConversation: snapshot.state.lastConversation ?? null,
          computerUseAvailable: computerUse !== null,
          executionMode:
            computerUseStatus?.activeSessionId === snapshot.sessionId &&
            computerUseStatus?.indicatorVisible
              ? "computer-use"
              : "structured",
          computerUseIndicatorVisible: Boolean(
            computerUseStatus?.activeSessionId === snapshot.sessionId &&
            computerUseStatus?.indicatorVisible
          ),
          computerUseAbortMessage:
            computerUseStatus?.lastAbortSessionId === snapshot.sessionId
              ? computerUseStatus?.lastAbortMessage ?? null
              : null,
          context: value.contextManager.readContext()
        };
      })
    };
  }

  // The 0.1 state already carries lastConversation, and the page replicates
  // state. Writing the turn's outcome there is what makes a Companion-side
  // conversation - answered or failed - visible on the linked page at all.
  function recordConversation(linkSession, lastConversation) {
    const snapshot = linkSession.authority.readSnapshot();
    linkSession.authority.commit({
      kind: "companion-conversation-recorded",
      nextState: { ...snapshot.state, lastConversation },
      sourceSurfaceId: snapshot.state.surface.primarySurfaceId,
      at: now()
    });
    linkSession.snapshot = linkSession.authority.readSnapshot();
  }

  // The model's offers reach the page the same way a local agent's do: as
  // cowork_offer_action calls the page pulls and runs. Without this the model
  // could answer in the cockpit but never put anything on the page.
  async function deliverOffers(linkSessionId, offers) {
    const list = Array.isArray(offers) ? offers : [];
    if (list.length === 0) return { offered: 0, rejected: 0, reason: null };
    let offered = 0;
    let rejected = 0;
    let reason = null;
    for (const offer of list) {
      try {
        await callAgentTool({
          name: "cowork_offer_action",
          arguments: {
            capabilityId: offer.capabilityId,
            targetId: offer.targetId,
            value: offer.value,
            summary: offer.summary
          },
          linkSessionId
        });
        offered += 1;
      } catch (error) {
        rejected += 1;
        // The first reason is the useful one; the rest are usually the same.
        reason ??= typeof error?.code === "string" ? error.code : "OFFER_DELIVERY_FAILED";
      }
    }
    return { offered, rejected, reason };
  }

  async function submitModelTurn(linkSessionId, { turnId, input }) {
    const linkSession = sessions.get(linkSessionId);
    if (!linkSession) {
      throw new CompanionHostError(
        "LINK_SESSION_NOT_FOUND",
        "Companion link session is unavailable",
        404
      );
    }
    if (!linkSession.gateway) {
      throw new CompanionHostError(
        "MODEL_GATEWAY_UNAVAILABLE",
        "No preferred model is configured for this Companion",
        503
      );
    }
    const signature = JSON.stringify(input);
    const existing = linkSession.submittedTurns.get(turnId);
    if (existing) {
      if (existing.signature !== signature) {
        throw new CompanionHostError(
          "TURN_ID_COLLISION",
          "A Companion turn id cannot be reused with different input",
          409
        );
      }
      return existing.promise;
    }
    const transcript = input?.transcript;
    if (
      typeof transcript !== "string" ||
      transcript.trim() === "" ||
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      Object.keys(input).length !== 1
    ) {
      throw new CompanionHostError(
        "INVALID_MODEL_TURN",
        "Companion model turns require a transcript"
      );
    }
    const currentSnapshot = linkSession.authority.readSnapshot();
    if (currentSnapshot.state.agentPresence === "paused") {
      throw new CompanionHostError(
        "MODEL_PAUSED",
        "The Companion model is paused",
        409
      );
    }
    const currentSeat = currentSnapshot.state.modelSeat;
    const currentMilliseconds = Date.parse(now());
    const seatExpiryMilliseconds = Date.parse(currentSeat?.expiresAt);
    if (
      currentSeat?.owner === "cowork-companion" &&
      Number.isFinite(currentMilliseconds) &&
      Number.isFinite(seatExpiryMilliseconds) &&
      currentMilliseconds < seatExpiryMilliseconds &&
      seatExpiryMilliseconds - currentMilliseconds <= modelSeatDurationMs / 2
    ) {
      linkSession.authority.renewModelSeat({
        leaseId: currentSeat.leaseId,
        expiresAt: new Date(currentMilliseconds + modelSeatDurationMs).toISOString(),
        expectedRevision: currentSnapshot.revision,
        sourceSurfaceId: currentSnapshot.state.surface.primarySurfaceId,
        at: new Date(currentMilliseconds).toISOString()
      });
      linkSession.snapshot = linkSession.authority.readSnapshot();
    }
    linkSession.contextManager.appendTurn({
      turnId,
      role: "human",
      text: transcript,
      at: now()
    });
    await persistSessions();
    const promise = linkSession.gateway.submit({
      turnId,
      sourceSurfaceId: linkSession.authority.readSnapshot().state.surface.primarySurfaceId,
      input
    }).then(
      async (reply) => {
        linkSession.contextManager.appendTurn({
          turnId: `assistant:${turnId}`,
          role: "assistant",
          text: typeof reply?.message === "string" ? reply.message : JSON.stringify(reply),
          at: now(),
          causeRefs: [turnId]
        });
        recordConversation(linkSession, {
          human: transcript,
          assistant: typeof reply?.message === "string" ? reply.message : "",
          status: "responded"
        });
        await persistSessions();
        // The reply stays exactly what the model said; where its offers landed
        // is a separate fact and rides beside it.
        return { reply, delivery: await deliverOffers(linkSessionId, reply?.offers) };
      },
      async (error) => {
        // A model turn that failed has to look failed on both surfaces. It used
        // to leave the human turn standing alone in the cockpit with no reply
        // and no reason, which reads as "the model ignored me".
        const code = typeof error?.code === "string" && error.code !== ""
          ? error.code.slice(0, 40)
          : "MODEL_TURN_FAILED";
        recordConversation(linkSession, {
          human: transcript,
          assistant: typeof error?.message === "string" ? error.message.slice(0, 240) : "",
          status: code
        });
        await persistSessions();
        throw error;
      }
    );
    linkSession.submittedTurns.set(turnId, { signature, promise });
    return promise;
  }

  async function updatePresence(linkSessionId, humanPresence) {
    const linkSession = sessions.get(linkSessionId);
    if (!linkSession) {
      throw new CompanionHostError(
        "LINK_SESSION_NOT_FOUND",
        "Companion link session is unavailable",
        404
      );
    }
    if (!["present", "afk-short", "afk-long"].includes(humanPresence)) {
      throw new CompanionHostError(
        "INVALID_PRESENCE",
        "Companion presence value is invalid"
      );
    }
    const snapshot = linkSession.authority.readSnapshot();
    const agentEngagement = readAgentEngagement(snapshot.state);
    const changedAt = now();
    const nextState = {
      ...snapshot.state,
      humanPresence,
      agentEngagement,
      effectiveMode: resolveCompanionMode({
        state: snapshot.state,
        humanPresence,
        agentPresence: snapshot.state.agentPresence,
        agentEngagement,
        at: changedAt
      })
    };
    const result = linkSession.authority.commit({
      kind: humanPresence === "present" ? "human-returned" : "human-away",
      nextState,
      sourceSurfaceId: snapshot.state.surface.primarySurfaceId,
      at: changedAt
    });
    linkSession.snapshot = linkSession.authority.readSnapshot();
    await persistSessions();
    return result;
  }

  async function updateModelEngagement(linkSessionId, agentEngagement) {
    const linkSession = sessions.get(linkSessionId);
    if (!linkSession) {
      throw new CompanionHostError(
        "LINK_SESSION_NOT_FOUND",
        "Companion link session is unavailable",
        404
      );
    }
    if (!linkSession.gateway) {
      throw new CompanionHostError(
        "MODEL_GATEWAY_UNAVAILABLE",
        "No preferred model is configured for this Companion",
        503
      );
    }
    if (!["collaborating", "observing", "paused"].includes(agentEngagement)) {
      throw new CompanionHostError(
        "INVALID_AGENT_ENGAGEMENT",
        "Companion model engagement value is invalid"
      );
    }
    const snapshot = linkSession.authority.readSnapshot();
    const agentPresence = agentEngagement === "paused" ? "paused" : "active";
    const changedAt = now();
    const nextState = {
      ...snapshot.state,
      agentPresence,
      agentEngagement,
      effectiveMode: resolveCompanionMode({
        state: snapshot.state,
        humanPresence: snapshot.state.humanPresence,
        agentPresence,
        agentEngagement,
        at: changedAt
      })
    };
    const result = linkSession.authority.commit({
      kind: agentEngagement === "paused"
        ? "agent-paused"
        : agentEngagement === "observing"
          ? "agent-observing"
          : "agent-resumed",
      nextState,
      sourceSurfaceId: snapshot.state.surface.primarySurfaceId,
      at: changedAt
    });
    linkSession.snapshot = linkSession.authority.readSnapshot();
    await persistSessions();
    return result;
  }

  // Every request a joined page makes routes through here, so this is the one
  // place that records that the page is really talking to us. A session that
  // was only restored from the store has never been stamped and stays null.
  function touchPageSession(linkSessionId, origin) {
    const linkSession = sessions.get(linkSessionId);
    if (!linkSession || linkSession.origin !== origin) {
      throw new CompanionHostError(
        "LINK_SESSION_NOT_FOUND",
        "Companion link session is unavailable",
        404
      );
    }
    linkSession.lastPageContactAt = now();
    return linkSession;
  }

  async function reportSurface(linkSessionId, event) {
    const linkSession = sessions.get(linkSessionId);
    if (!linkSession) {
      throw new CompanionHostError(
        "LINK_SESSION_NOT_FOUND",
        "Companion link session is unavailable",
        404
      );
    }
    const snapshot = linkSession.authority.readSnapshot();
    if (
      event?.protocolVersion !== PROTOCOL_VERSION ||
      event?.linkVersion !== LINK_VERSION ||
      event?.type !== "surface-event" ||
      event.sessionId !== snapshot.sessionId ||
      event.surfaceId !== linkSession.hello.surfaceId ||
      !["page-hidden", "page-visible"].includes(event.event) ||
      !Number.isInteger(event.observedRevision) ||
      event.observedRevision < 0 ||
      event.observedRevision > snapshot.revision
    ) {
      throw new CompanionHostError(
        "INVALID_SURFACE_EVENT",
        "Companion surface event did not match the joined page and revision"
      );
    }
    const visibility = event.event === "page-hidden" ? "hidden" : "visible";
    const applicationSurface = {
      surfaceId: event.surfaceId,
      visibility
    };
    let result = {
      committed: false,
      revision: snapshot.revision,
      state: snapshot.state
    };
    if (
      snapshot.state.applicationSurface?.surfaceId !== applicationSurface.surfaceId ||
      snapshot.state.applicationSurface?.visibility !== applicationSurface.visibility
    ) {
      result = linkSession.authority.commit({
        kind: "surface-visibility",
        nextState: { ...snapshot.state, applicationSurface },
        sourceSurfaceId: event.surfaceId,
        payload: {
          event: event.event,
          observedRevision: event.observedRevision
        },
        at: now()
      });
      linkSession.snapshot = linkSession.authority.readSnapshot();
      await persistSessions();
    }
    return {
      protocolVersion: PROTOCOL_VERSION,
      linkVersion: LINK_VERSION,
      type: "companion-surface-ack",
      sessionId: snapshot.sessionId,
      linkSessionId,
      observedRevision: event.observedRevision,
      acceptedRevision: result.revision
    };
  }

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(
      request.url,
      `http://${request.headers.host ?? `${hostname}:${port}`}`
    );
    const uiAssets = new Map([
      ["/cowork/v1/ui", ["index.html", "text/html; charset=utf-8"]],
      ["/cowork/v1/ui/", ["index.html", "text/html; charset=utf-8"]],
      ["/cowork/v1/ui/styles.css", ["styles.css", "text/css; charset=utf-8"]],
      ["/cowork/v1/ui/app.js", ["app.js", "text/javascript; charset=utf-8"]],
      ["/cowork/v1/ui/reference-ui.js", [REFERENCE_UI_MODULE, "text/javascript; charset=utf-8"]],
      ["/cowork/v1/ui/cowork-dialogue-mark.svg", [REFERENCE_UI_MARK, "image/svg+xml"]]
    ]);
    if (request.method === "GET" && uiAssets.has(requestUrl.pathname)) {
      const [filename, contentType] = uiAssets.get(requestUrl.pathname);
      const assetPath = path.isAbsolute(filename) ? filename : path.join(UI_ROOT, filename);
      writeStatic(response, 200, await readFile(assetPath, "utf8"), contentType);
      return;
    }
    if (request.method === "GET" && requestUrl.pathname === "/cowork/v1/ui/state") {
      writeJson(response, 200, await readUiState());
      return;
    }
    // Local agents speak to this route, and only local agents can: a browser
    // always attaches Origin to a cross-origin POST, so its absence is what
    // separates a process on this machine from a page trying the same call.
    const agentToolMatch = requestUrl.pathname.match(
      /^\/cowork\/v1\/agent\/tools\/([^/]+)$/
    );
    if (request.method === "POST" && agentToolMatch) {
      if (typeof request.headers.origin === "string") {
        writeJson(response, 403, { code: "AGENT_ROUTE_IS_LOCAL_ONLY" });
        return;
      }
      try {
        const body = await readJson(request);
        const result = await callAgentTool({
          name: decodeURIComponent(agentToolMatch[1]),
          arguments: body?.arguments ?? {},
          linkSessionId: body?.linkSessionId ?? null,
          clientName: body?.clientName ?? null
        });
        writeJson(response, 200, { result });
      } catch (error) {
        const status = error instanceof CompanionHostError ? error.status : 500;
        const code = error instanceof CompanionHostError
          ? error.code
          : "COMPANION_HOST_ERROR";
        writeJson(response, status, { code, message: error.message });
      }
      return;
    }

    const boundAddress = server.address();
    const localUiOrigin = formatLoopbackOrigin(
      hostname,
      boundAddress && typeof boundAddress !== "string" ? boundAddress.port : port
    );
    const uiTurnMatch = requestUrl.pathname.match(
      /^\/cowork\/v1\/ui\/sessions\/([^/]+)\/turns$/
    );
    const uiPresenceMatch = requestUrl.pathname.match(
      /^\/cowork\/v1\/ui\/sessions\/([^/]+)\/presence$/
    );
    const uiEngagementMatch = requestUrl.pathname.match(
      /^\/cowork\/v1\/ui\/sessions\/([^/]+)\/engagement$/
    );
    const uiComputerUseMatch = requestUrl.pathname.match(
      /^\/cowork\/v1\/ui\/sessions\/([^/]+)\/computer-use$/
    );
    if (
      request.method === "POST" &&
      (uiTurnMatch || uiPresenceMatch || uiEngagementMatch || uiComputerUseMatch)
    ) {
      if (request.headers.origin !== localUiOrigin) {
        writeJson(response, 403, { code: "COMPANION_UI_ORIGIN_REQUIRED" });
        return;
      }
      try {
        const body = await readJson(request);
        if (uiComputerUseMatch) {
          if (body?.humanGesture !== true) {
            throw new CompanionHostError(
              "HUMAN_ACTIVATION_REQUIRED",
              "Only a deliberate local cockpit gesture can change Computer Use",
              400
            );
          }
          if (typeof body.enabled !== "boolean") {
            throw new CompanionHostError(
              "INVALID_COMPUTER_USE_REQUEST",
              "Computer Use requests require an enabled boolean"
            );
          }
          if (computerUse === null) {
            throw new CompanionHostError(
              "COMPUTER_USE_UNAVAILABLE",
              "No profiled Open Compute adapter is configured",
              503
            );
          }
          const linkSession = sessions.get(decodeURIComponent(uiComputerUseMatch[1]));
          if (!linkSession) {
            throw new CompanionHostError(
              "LINK_SESSION_NOT_FOUND",
              "Companion link session is unavailable",
              404
            );
          }
          const sessionId = linkSession.authority.readSnapshot().sessionId;
          const status = await computerUse[body.enabled ? "activate" : "deactivate"]({
            sessionId,
            humanGesture: true
          });
          writeJson(response, 200, { status });
        } else if (uiTurnMatch) {
          writeJson(
            response,
            200,
            await submitModelTurn(decodeURIComponent(uiTurnMatch[1]), body)
          );
        } else if (uiPresenceMatch) {
          const result = await updatePresence(
            decodeURIComponent(uiPresenceMatch[1]),
            body.humanPresence
          );
          writeJson(response, 200, { revision: result.revision });
        } else {
          const result = await updateModelEngagement(
            decodeURIComponent(uiEngagementMatch[1]),
            body.agentEngagement
          );
          writeJson(response, 200, { revision: result.revision });
        }
      } catch (error) {
        const computerUseStatuses = {
          HUMAN_ACTIVATION_REQUIRED: 400,
          INVALID_COMPUTER_USE_SESSION: 400,
          COMPUTER_USE_NOT_ACTIVE: 409,
          COMPUTER_USE_SEAT_TAKEN: 409,
          OPEN_COMPUTE_CAPABILITIES_MISSING: 503,
          MCP_PROCESS_UNAVAILABLE: 503,
          MCP_PROCESS_START_FAILED: 503,
          OPEN_COMPUTE_SIGNAL_UNVERIFIED: 502
        };
        const status = error instanceof CompanionHostError
          ? error.status
          : computerUseStatuses[error?.code] ?? 500;
        const code = error instanceof CompanionHostError
          ? error.code
          : typeof error?.code === "string"
            ? error.code
            : "COMPANION_HOST_ERROR";
        // A bare code tells the human nothing to do about it. Every message
        // here is one we wrote; no provider text is copied through.
        writeJson(response, status, {
          code,
          message: typeof error?.message === "string" ? error.message.slice(0, 240) : ""
        });
      }
      return;
    }

    const origin = request.headers.origin;
    if (typeof origin !== "string" || !originAllowlist.has(origin)) {
      writeJson(response, 403, { code: "ORIGIN_NOT_PAIRED" });
      return;
    }

    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type",
        "access-control-allow-private-network": "true",
        vary: "Origin"
      });
      response.end();
      return;
    }

    try {
      const url = requestUrl;
      if (request.method === "POST" && url.pathname === "/cowork/v1/sessions/join") {
        const joined = validateJoin(await readJson(request), origin);
        const linkSessionId = createLinkSessionId();
        if (typeof linkSessionId !== "string" || linkSessionId.length === 0) {
          throw new CompanionHostError(
            "INVALID_LINK_SESSION",
            "Companion link session id is invalid",
            500
          );
        }
        const companionSurfaceId = `desktop:${linkSessionId}`;
        const authority = restoreCoworkSessionAuthority({ snapshot: joined.snapshot });
        const claimedAt = now();
        authority.claimSurface({
          surfaceId: companionSurfaceId,
          kind: "desktop",
          reason: "Companion accepted session authority",
          expectedRevision: joined.snapshot.revision,
          sourceSurfaceId: joined.hello.surfaceId,
          at: claimedAt
        });
        authority.claimModelSeat({
          leaseId: `model-seat:${linkSessionId}`,
          owner: "cowork-companion",
          providerId: modelProviderId,
          contextAuthority: "cowork-session",
          expiresAt: new Date(
            Date.parse(claimedAt) + modelSeatDurationMs
          ).toISOString(),
          expectedRevision: joined.snapshot.revision + 1,
          sourceSurfaceId: companionSurfaceId,
          at: claimedAt
        });
        const authorityDeltas = authority.readDeltas({
          afterRevision: joined.snapshot.revision
        });
        const authoritySnapshot = authority.readSnapshot();
        sessions.set(linkSessionId, createSessionRuntime({
          linkSessionId,
          origin,
          hello: joined.hello,
          snapshot: authoritySnapshot,
          context: joined.context,
          authority,
          lastPageContactAt: claimedAt
        }));
        await persistSessions();
        writeJson(response, 200, {
          protocolVersion: PROTOCOL_VERSION,
          linkVersion: LINK_VERSION,
          type: "companion-join-ack",
          sessionId: joined.snapshot.sessionId,
          linkSessionId,
          acceptedRevision: joined.snapshot.revision,
          authorityRevision: authoritySnapshot.revision,
          authorityDeltas,
          companionSurfaceId
        }, origin);
        return;
      }

      const match = url.pathname.match(/^\/cowork\/v1\/sessions\/([^/]+)\/deltas$/);
      const readMatch = url.pathname.match(
        /^\/cowork\/v1\/sessions\/([^/]+)\/deltas\/read$/
      );
      const surfaceMatch = url.pathname.match(
        /^\/cowork\/v1\/sessions\/([^/]+)\/surface-events$/
      );
      if (request.method === "POST" && surfaceMatch) {
        const linkSessionId = decodeURIComponent(surfaceMatch[1]);
        touchPageSession(linkSessionId, origin);
        const acknowledgement = await reportSurface(
          linkSessionId,
          (await readJson(request)).event
        );
        writeJson(response, 200, acknowledgement, origin);
        return;
      }
      if (request.method === "POST" && readMatch) {
        const linkSessionId = decodeURIComponent(readMatch[1]);
        const linkSession = touchPageSession(linkSessionId, origin);
        const { afterRevision, limit } = await readJson(request);
        const batch = linkSession.authority.readDeltas({ afterRevision, limit });
        writeJson(response, 200, batch, origin);
        return;
      }
      const agentPullMatch = url.pathname.match(
        /^\/cowork\/v1\/sessions\/([^/]+)\/agent-requests\/read$/
      );
      const agentResultMatch = url.pathname.match(
        /^\/cowork\/v1\/sessions\/([^/]+)\/agent-requests\/result$/
      );
      if (request.method === "POST" && agentPullMatch) {
        const linkSession = touchPageSession(
          decodeURIComponent(agentPullMatch[1]),
          origin
        );
        writeJson(response, 200, {
          protocolVersion: PROTOCOL_VERSION,
          linkVersion: LINK_VERSION,
          type: "companion-agent-requests",
          requests: takeAgentRequests(linkSession)
        }, origin);
        return;
      }
      if (request.method === "POST" && agentResultMatch) {
        const linkSession = touchPageSession(
          decodeURIComponent(agentResultMatch[1]),
          origin
        );
        const body = await readJson(request);
        if (typeof body?.requestId !== "string" || body.requestId === "") {
          throw new CompanionHostError(
            "INVALID_COMPANION_MESSAGE",
            "A Cowork tool result must name the request it answers"
          );
        }
        writeJson(response, 200, settleAgentRequest(linkSession, body), origin);
        return;
      }
      if (request.method === "POST" && match) {
        const linkSessionId = decodeURIComponent(match[1]);
        touchPageSession(linkSessionId, origin);
        throw new CompanionHostError(
          "COMPANION_IS_SESSION_AUTHORITY",
          "Page replicas must pull Companion-authored deltas after joining",
          409
        );
      }

      writeJson(response, 404, { code: "NOT_FOUND" }, origin);
    } catch (error) {
      const status = error instanceof CompanionHostError ? error.status : 500;
      const code = error instanceof CompanionHostError ? error.code : "COMPANION_HOST_ERROR";
      writeJson(response, status, { code }, origin);
    }
  });

  return {
    async listen() {
      await loadSessionStore();
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, hostname, resolve);
      });
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new CompanionHostError("COMPANION_HOST_ERROR", "Companion host has no port", 500);
      }
      return { hostname, port: address.port };
    },
    async close() {
      await computerUse?.close();
      if (server.listening) {
        await new Promise((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve()))
        );
      }
    },
    readSnapshot(linkSessionId) {
      const snapshot = sessions.get(linkSessionId)?.snapshot;
      return snapshot ? cloneJson(snapshot) : null;
    },
    readContext(linkSessionId) {
      const contextManager = sessions.get(linkSessionId)?.contextManager;
      return contextManager ? contextManager.readContext() : null;
    },
    async commitSession(linkSessionId, {
      expectedRevision,
      ...input
    }) {
      const linkSession = sessions.get(linkSessionId);
      if (!linkSession) {
        throw new CompanionHostError(
          "LINK_SESSION_NOT_FOUND",
          "Companion link session is unavailable",
          404
        );
      }
      const currentRevision = linkSession.authority.readSnapshot().revision;
      if (expectedRevision !== currentRevision) {
        throw new CompanionHostError(
          "COMPANION_REVISION_MISMATCH",
          "Companion session commit did not target the current authority revision",
          409
        );
      }
      const result = linkSession.authority.commit(input);
      linkSession.snapshot = linkSession.authority.readSnapshot();
      await persistSessions();
      return cloneJson(result);
    },
    readDeltas(linkSessionId, options) {
      const authority = sessions.get(linkSessionId)?.authority;
      if (!authority) return null;
      return authority.readDeltas(options);
    },
    reportSurface,
    callAgentTool,
    readAgentRelay() {
      return { ...agentRelay };
    },
    submitModelTurn,
    updateModelEngagement,
    readModelStatus(linkSessionId) {
      return sessions.get(linkSessionId)?.gateway?.readStatus() ?? null;
    },
    sessionCount() {
      return sessions.size;
    }
  };
}
