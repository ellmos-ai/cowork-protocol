import {
  fromLegacyPresence,
  resolveWorkMode,
  toLegacyPresence
} from "../../../packages/core/src/index.js";

/**
 * The showcase session carries the two status variables per actor
 * (`availability` + `role`) plus whether simultaneous work is allowed.
 * Everything else - the work mode, who holds the click right, and the 0.1
 * presence values the wire still speaks - is derived by `resolveWorkMode`
 * and `toLegacyPresence`. There is no separate action-rights setting.
 */

/** The four status states one actor cycles through when its figure is clicked. */
export const ACTOR_STATUS_CYCLE = Object.freeze([
  Object.freeze({ availability: "here", role: "acting" }),
  Object.freeze({ availability: "here", role: "observing" }),
  Object.freeze({ availability: "standby", role: "observing" }),
  Object.freeze({ availability: "away", role: "observing" })
]);

/**
 * Next status in the cycle. Pass the *resolved* actor (session.workMode.human
 * / .model), not the stored one: after the conflict rule has taken a model's
 * authority away, the figure must cycle on from what the panel shows, not
 * from an intent the panel is not displaying.
 */
export function nextActorStatus(actor) {
  const index = ACTOR_STATUS_CYCLE.findIndex(
    (candidate) =>
      candidate.availability === actor?.availability &&
      (actor.availability !== "here" || candidate.role === actor.role)
  );
  return ACTOR_STATUS_CYCLE[(index + 1) % ACTOR_STATUS_CYCLE.length];
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
    allowParallel: state.allowParallel === true,
    // The lease is the model's authority record while the human is gone.
    // With the human here, their own presence is the live authority: every
    // model action still passes a click-gated offer or a spoken directive,
    // and the hand on the mouse can take it back at any moment.
    modelAuthorityValid:
      state.human?.availability === "here" || leaseIsValid(state.lease, now)
  });
  const legacy = toLegacyPresence(workMode);
  return {
    ...state,
    workMode,
    // 0.1 wire mirrors: presence events, solo leases and the nine WebMCP
    // tools keep their published shapes. Derived, never set by hand.
    // `agentEngagement` deliberately stays out of the session: the Desktop
    // Companion owns that field on the replicated state and would read a
    // stale copy back as a control value.
    humanPresence: legacy.humanPresence,
    agentPresence: legacy.agentPresence,
    effectiveMode: legacy.effectiveMode
  };
}

/**
 * Adopt a session state that came back from a Desktop Companion replica. The
 * Companion speaks 0.1 and mutates `humanPresence` / `agentPresence`
 * directly, so the matrix has to be re-derived from those values - otherwise
 * the panel keeps rendering the work mode from before the Companion moved.
 */
export function adoptSessionState(state) {
  return withWorkMode({ ...state, ...fromLegacyPresence(state) });
}

export function createShowcaseSession() {
  return withWorkMode({
    human: { availability: "here", role: "acting" },
    model: { availability: "here", role: "observing" },
    allowParallel: false,
    attentionMode: "pointer",
    changeCausality: true,
    lease: null,
    returnSummary: null
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
        model: event.model ?? state.model,
        allowParallel: event.allowParallel ?? state.allowParallel
      },
      event.now
    );
  }

  if (event.type === "HUMAN_AWAY") {
    return withWorkMode(
      {
        ...state,
        human: {
          availability: event.duration === "long" ? "away" : "standby",
          role: "observing"
        },
        model: { availability: "here", role: "acting" },
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
      human: { availability: "here", role: "acting" },
      // The conflict rule already takes the model's authority the moment the
      // human is back; storing the lapse keeps state and display in step.
      model: { ...state.model, role: "observing" },
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
      model: { availability: "standby", role: "observing" }
    });
  }

  if (event.type === "AGENT_RESUMED") {
    return withWorkMode({
      ...state,
      model: { availability: "here", role: "observing" }
    });
  }

  if (event.type === "CLOCK_TICK") {
    const nextState = state.lease === undefined || leaseHasExpired(state.lease, event.now)
      ? { ...state, lease: null, leaseCallsUsed: 0 }
      : state;
    return withWorkMode(nextState, event.now);
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
