import {
  fromLegacyPresence,
  resolveWorkMode,
  toLegacyPresence
} from "../../../packages/core/src/index.js";

/**
 * The showcase session answers three questions per partner - present, working
 * on what, executing or advising - and derives everything else. The work
 * mode, who holds the click right and the 0.1 presence values the wire still
 * speaks all come out of `resolveWorkMode` / `toLegacyPresence`. There is no
 * action-rights setting and no simultaneity switch.
 */

/** The four status states one figure cycles through when it is clicked. */
export const ACTOR_STATUS_CYCLE = Object.freeze([
  Object.freeze({ availability: "here", role: "executing" }),
  Object.freeze({ availability: "here", role: "advising" }),
  Object.freeze({ availability: "standby", role: "advising" }),
  Object.freeze({ availability: "away", role: "advising" })
]);

/**
 * The model's own cycle: the same states without "away". For a model, away
 * means no seat connected at all - which the model seat block owns (disconnect,
 * demo off, a Companion taking over), not something a human should have to walk
 * through to get a working model back. Pressing the seat into it read as
 * "the connection is gone" and left the human reaching for the other figure.
 * The Companion cockpit has only ever offered paused and active; this is the
 * page saying the same thing.
 */
export const MODEL_STATUS_CYCLE = Object.freeze(
  ACTOR_STATUS_CYCLE.filter((status) => status.availability !== "away")
);

function nextInCycle(cycle, actor) {
  const index = cycle.findIndex(
    (candidate) =>
      candidate.availability === actor?.availability &&
      (actor.availability !== "here" || candidate.role === actor.role)
  );
  // A status outside the cycle - a model reported away because its seat is
  // empty - starts the cycle from the front, which is where it went before.
  return cycle[(index + 1) % cycle.length];
}

/**
 * Next status in the cycle. Pass the *resolved* partner (session.workMode.human
 * / .model), not the stored one: once a model without a grant has fallen back
 * to advising, the figure must move on from what the panel shows, not from an
 * intent the panel is not displaying.
 */
export function nextActorStatus(actor) {
  return nextInCycle(ACTOR_STATUS_CYCLE, actor);
}

export function nextModelStatus(actor) {
  return nextInCycle(MODEL_STATUS_CYCLE, actor);
}

function leaseIsValid(lease, now) {
  const currentTime = Date.parse(now);
  const leaseExpiry = Date.parse(lease?.expiresAt);
  return (
    lease != null &&
    Number.isFinite(currentTime) &&
    Number.isFinite(leaseExpiry) &&
    currentTime < leaseExpiry
  );
}

function withWorkMode(state, now = new Date().toISOString()) {
  const workMode = resolveWorkMode({
    human: state.human,
    model: state.model,
    // The security core: only a live grant or solo lease - with its goal,
    // call budget and expiry - lets the model execute. A present human is
    // NOT a substitute for that record. Without one the model advises and
    // its proposals still need a human click.
    modelAuthorityValid: leaseIsValid(state.lease, now)
  });
  const legacy = toLegacyPresence(workMode);
  return {
    ...state,
    workMode,
    // 0.1 wire mirrors: presence events, solo leases and the nine WebMCP
    // tools keep their published shapes. Derived, never set by hand.
    // `agentEngagement` is published too: a consumer that has to guess it
    // guesses "collaborating" and then disagrees with this panel about who
    // is executing. While a Companion is the authority this surface commits
    // nothing, so its own value is never overwritten.
    humanPresence: legacy.humanPresence,
    agentPresence: legacy.agentPresence,
    agentEngagement: legacy.agentEngagement,
    effectiveMode: legacy.effectiveMode
  };
}

export function createShowcaseSession() {
  return withWorkMode({
    human: { availability: "here", role: "executing", area: null },
    model: { availability: "here", role: "advising", area: null },
    attentionMode: "pointer",
    changeCausality: true,
    lease: null,
    returnSummary: null
  });
}

/**
 * Adopt a session state that came back from a Desktop Companion replica. The
 * Companion speaks 0.1 and mutates `humanPresence` / `agentPresence`
 * directly, so the matrix has to be re-derived from those values - otherwise
 * the panel keeps rendering the work mode from before the Companion moved.
 */
export function adoptSessionState(state) {
  const legacy = fromLegacyPresence(state);
  return withWorkMode({
    ...state,
    human: { ...legacy.human, area: state.human?.area ?? null },
    model: { ...legacy.model, area: state.model?.area ?? null }
  });
}

function leaseHasExpired(lease, now) {
  if (lease == null) return false;
  return !leaseIsValid(lease, now);
}

export function nextLeaseExpiryDelay(lease, nowMilliseconds, graceMilliseconds = 10) {
  if (lease == null) return null;
  const leaseExpiry = Date.parse(lease.expiresAt);
  if (!Number.isFinite(nowMilliseconds) || !Number.isFinite(leaseExpiry)) return 0;
  return Math.max(0, leaseExpiry - nowMilliseconds + graceMilliseconds);
}

export function buildLeaseExpiryEffect(leaseBeforeTick, leaseAfterTick) {
  if (leaseBeforeTick == null || leaseAfterTick != null) return null;
  return {
    leaseCallsUsed: 0,
    status: "Solo lease expired. Agent work stopped; the human is still away."
  };
}

export function transitionShowcaseSession(state, event) {
  if (event.type === "SILENCE") {
    return state;
  }

  if (event.type === "SET_STATUS") {
    return withWorkMode(
      {
        ...state,
        human: event.human ?? state.human,
        model: event.model ?? state.model
      },
      event.now
    );
  }

  if (event.type === "HUMAN_AWAY") {
    return withWorkMode(
      {
        ...state,
        // Nobody who is away is working on anything; the area the lease
        // covers belongs to the model from here on.
        human: { availability: event.duration === "long" ? "away" : "standby", role: "advising", area: null },
        model: { availability: "here", role: "executing", area: event.area ?? state.human.area },
        lease: event.lease,
        leaseCallsUsed: 0,
        returnSummary: null
      },
      event.now
    );
  }

  if (event.type === "HUMAN_RETURNED") {
    const receipts = event.receipts ?? [];
    return withWorkMode({
      ...state,
      human: { availability: "here", role: "executing", area: event.area ?? null },
      // The lease ends with the return, so the model's authority and its
      // claimed area end with it too.
      model: { ...state.model, role: "advising", area: null },
      lease: null,
      returnSummary: {
        verified: receipts.filter((receipt) => receipt.status === "verified").length,
        failed: receipts.filter((receipt) => receipt.status === "failed").length,
        pendingQuestion: event.pendingQuestion ?? null
      }
    });
  }

  if (event.type === "AGENT_PAUSED") {
    return withWorkMode({
      ...state,
      model: { availability: "standby", role: "advising", area: null }
    });
  }

  if (event.type === "AGENT_RESUMED") {
    return withWorkMode({
      ...state,
      model: { ...state.model, availability: "here", role: "advising" }
    });
  }

  if (event.type === "CLOCK_TICK") {
    const expired = state.lease === undefined || leaseHasExpired(state.lease, event.now);
    return withWorkMode(
      {
        ...state,
        // Areas are derived from the focused target and the live grant; the
        // caller passes the current pair on every tick so the two can never
        // drift apart.
        human: event.human ?? state.human,
        model: event.model ?? state.model,
        ...(expired ? { lease: null, leaseCallsUsed: 0 } : {})
      },
      event.now
    );
  }

  if (event.type === "SOLO_ATTEMPT_STARTED") {
    return {
      ...state,
      leaseCallsUsed: (state.leaseCallsUsed ?? 0) + 1
    };
  }

  if (event.type === "RECEIPT_RECORDED") {
    return {
      ...state,
      receipts: [...(state.receipts ?? []), event.receipt].slice(-20)
    };
  }

  return state;
}
