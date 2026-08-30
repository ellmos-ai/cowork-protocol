import { resolvePresenceMode } from "../../../packages/core/src/index.js";

const ACTION_MODE_RIGHTS = {
  explain: new Set(),
  suggest: new Set(["offer"]),
  delegated: new Set(["solo"]),
  paused: new Set()
};

export function actionModeAllows(actionMode, operation) {
  return ACTION_MODE_RIGHTS[actionMode]?.has(operation) ?? false;
}

export function createShowcaseSession() {
  return {
    humanPresence: "present",
    agentPresence: "active",
    effectiveMode: "cowork",
    attentionMode: "pointer",
    changeCausality: true,
    actionMode: "suggest",
    lease: null,
    returnSummary: null
  };
}

function withEffectiveMode(state, now = new Date().toISOString()) {
  const currentTime = Date.parse(now);
  const leaseExpiry = Date.parse(state.lease?.expiresAt);
  const leaseValid =
    state.lease !== null &&
    Number.isFinite(currentTime) &&
    Number.isFinite(leaseExpiry) &&
    currentTime < leaseExpiry;
  return {
    ...state,
    effectiveMode: resolvePresenceMode({
      humanPresence: state.humanPresence,
      agentPresence: state.agentPresence,
      leaseValid
    })
  };
}

function leaseHasExpired(lease, now) {
  if (lease == null) return false;
  const currentTime = Date.parse(now);
  const leaseExpiry = Date.parse(lease.expiresAt);
  return (
    !Number.isFinite(currentTime) ||
    !Number.isFinite(leaseExpiry) ||
    currentTime >= leaseExpiry
  );
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

  if (event.type === "HUMAN_AWAY") {
    return withEffectiveMode(
      {
        ...state,
        humanPresence: event.duration === "long" ? "afk-long" : "afk-short",
        lease: event.lease,
        leaseCallsUsed: 0,
        returnSummary: null
      },
      event.now
    );
  }

  if (event.type === "HUMAN_RETURNED") {
    const receipts = event.receipts ?? [];
    return withEffectiveMode({
      ...state,
      humanPresence: "present",
      lease: null,
      returnSummary: {
        verified: receipts.filter((receipt) => receipt.status === "verified").length,
        failed: receipts.filter((receipt) => receipt.status === "failed").length,
        pendingQuestion: event.pendingQuestion ?? null
      }
    });
  }

  if (event.type === "AGENT_PAUSED") {
    return withEffectiveMode({ ...state, agentPresence: "paused" });
  }

  if (event.type === "AGENT_RESUMED") {
    return withEffectiveMode({ ...state, agentPresence: "active" });
  }

  if (event.type === "CLOCK_TICK") {
    const nextState = state.lease === undefined || leaseHasExpired(state.lease, event.now)
      ? { ...state, lease: null, leaseCallsUsed: 0 }
      : state;
    return withEffectiveMode(nextState, event.now);
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
