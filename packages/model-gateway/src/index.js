const PROTOCOL_VERSION = "0.1";
const MAX_INPUT_CHARACTERS = 2400;
const MAX_REQUEST_CHARACTERS = 6000;
const MAX_REPLY_CHARACTERS = 6000;

export class CoworkModelGatewayError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CoworkModelGatewayError";
    this.code = code;
  }
}

function requiredText(value, name, maximum = 160) {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    value.length > maximum
  ) {
    throw new CoworkModelGatewayError(
      "INVALID_MODEL_TURN",
      `${name} must be a bounded non-empty string`
    );
  }
  return value;
}

function cloneJson(value, code = "INVALID_MODEL_TURN") {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    throw new CoworkModelGatewayError(code, "Model gateway data must be JSON serializable");
  }
}

function boundedJson(value, maximum, code) {
  const serialized = JSON.stringify(value);
  if (serialized.length > maximum) {
    throw new CoworkModelGatewayError(code, "Model gateway data exceeded its character budget");
  }
  return serialized;
}

function sessionProjection(snapshot) {
  const state = snapshot.state;
  return {
    revision: snapshot.revision,
    humanPresence: state.humanPresence,
    agentPresence: state.agentPresence,
    effectiveMode: state.effectiveMode,
    primarySurfaceId: state.surface?.primarySurfaceId,
    surfaceKind: state.surface?.kind,
    focus: state.focus ?? null,
    // What the model may do is derived from the work mode, not chosen
    // separately - see docs/work-modes.md.
    workMode: state.workMode?.mode ?? null,
    authority: state.workMode?.authority ?? null,
    lease: state.lease ?? null
  };
}

export function createCoworkModelGateway({
  sessionId,
  seatOwner,
  readSnapshot,
  readModelContext,
  sendTurn,
  maxCompletedTurns = 100,
  now = () => new Date().toISOString()
}) {
  requiredText(sessionId, "sessionId");
  requiredText(seatOwner, "seatOwner", 80);
  if (
    typeof readSnapshot !== "function" ||
    typeof readModelContext !== "function" ||
    typeof sendTurn !== "function"
  ) {
    throw new TypeError("Model Gateway requires snapshot, context, and model functions");
  }
  if (!Number.isInteger(maxCompletedTurns) || maxCompletedTurns < 1 || maxCompletedTurns > 1000) {
    throw new TypeError("maxCompletedTurns must be between 1 and 1,000");
  }

  const turns = new Map();
  let tail = Promise.resolve();
  let activeTurnId = null;
  let queuedTurns = 0;
  let completedTurns = 0;
  let failedTurns = 0;

  function trimCompleted() {
    while (turns.size > maxCompletedTurns) {
      const oldestCompleted = [...turns].find(([, value]) => value.completed)?.[0];
      if (!oldestCompleted) return;
      turns.delete(oldestCompleted);
    }
  }

  async function execute({ turnId, sourceSurfaceId, input }) {
    queuedTurns -= 1;
    activeTurnId = turnId;
    try {
      const snapshot = cloneJson(readSnapshot(), "INVALID_SESSION_SNAPSHOT");
      if (
        snapshot?.protocolVersion !== PROTOCOL_VERSION ||
        snapshot?.type !== "session-snapshot" ||
        snapshot.sessionId !== sessionId ||
        !Number.isInteger(snapshot.revision) ||
        !snapshot.state ||
        typeof snapshot.state !== "object"
      ) {
        throw new CoworkModelGatewayError(
          "INVALID_SESSION_SNAPSHOT",
          "Model Gateway requires the current Cowork session snapshot"
        );
      }
      const seat = snapshot.state.modelSeat;
      const expiresAt = Date.parse(seat?.expiresAt);
      const currentTime = Date.parse(now());
      if (
        seat?.owner !== seatOwner ||
        !Number.isFinite(expiresAt) ||
        !Number.isFinite(currentTime) ||
        currentTime >= expiresAt
      ) {
        throw new CoworkModelGatewayError(
          "MODEL_SEAT_NOT_OWNED",
          "This gateway does not own the active Cowork model seat"
        );
      }
      if (seat.contextAuthority !== "cowork-session") {
        throw new CoworkModelGatewayError(
          "MODEL_CONTEXT_EXTERNAL",
          "The active provider owns its private conversation context"
        );
      }
      const context = cloneJson(
        readModelContext({ maxCharacters: 1200 }),
        "INVALID_MODEL_CONTEXT"
      );
      if (context?.sessionId !== sessionId || context?.type !== "model-context") {
        throw new CoworkModelGatewayError(
          "INVALID_MODEL_CONTEXT",
          "Context Manager returned a context for another session"
        );
      }
      const request = {
        protocolVersion: PROTOCOL_VERSION,
        type: "model-gateway-turn",
        sessionId,
        turnId,
        sourceSurfaceId,
        modelSeat: {
          leaseId: seat.leaseId,
          owner: seat.owner,
          providerId: seat.providerId,
          expiresAt: seat.expiresAt
        },
        session: sessionProjection(snapshot),
        context,
        input
      };
      boundedJson(request, MAX_REQUEST_CHARACTERS, "MODEL_REQUEST_TOO_LARGE");
      const reply = cloneJson(await sendTurn(request), "INVALID_MODEL_REPLY");
      boundedJson(reply, MAX_REPLY_CHARACTERS, "MODEL_REPLY_TOO_LARGE");
      return reply;
    } finally {
      activeTurnId = null;
    }
  }

  function submit({ turnId, sourceSurfaceId, input }) {
    requiredText(turnId, "turnId");
    requiredText(sourceSurfaceId, "sourceSurfaceId");
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new CoworkModelGatewayError(
        "INVALID_MODEL_TURN",
        "Model turn input must be an object"
      );
    }
    const normalizedInput = cloneJson(input);
    const signature = boundedJson(
      { sourceSurfaceId, input: normalizedInput },
      MAX_INPUT_CHARACTERS,
      "MODEL_INPUT_TOO_LARGE"
    );
    const existing = turns.get(turnId);
    if (existing) {
      if (existing.signature !== signature) {
        return Promise.reject(new CoworkModelGatewayError(
          "TURN_ID_COLLISION",
          "A model turn id cannot be reused with different input"
        ));
      }
      return existing.promise;
    }
    queuedTurns += 1;
    const run = () => execute({
      turnId,
      sourceSurfaceId,
      input: normalizedInput
    });
    const promise = tail.then(run, run);
    const entry = { signature, promise, completed: false };
    turns.set(turnId, entry);
    tail = promise.then(
      () => undefined,
      () => undefined
    );
    // Settled is not the same as answered. Counting a failed turn as completed
    // told the cockpit two turns had succeeded while the model had answered
    // neither, so the two are counted apart.
    promise.then(
      () => { completedTurns += 1; },
      () => { failedTurns += 1; }
    ).finally(() => {
      entry.completed = true;
      trimCompleted();
    }).catch(() => {});
    return promise;
  }

  function readStatus() {
    return {
      activeTurnId,
      queuedTurns,
      completedTurns,
      failedTurns
    };
  }

  return Object.freeze({ submit, readStatus });
}
