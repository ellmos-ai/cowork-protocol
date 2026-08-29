import { resolvePresenceMode } from "../../../packages/core/src/index.js";

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

function withEffectiveMode(state) {
  return {
    ...state,
    effectiveMode: resolvePresenceMode({
      humanPresence: state.humanPresence,
      agentPresence: state.agentPresence,
      leaseValid: state.lease !== null
    })
  };
}

export function transitionShowcaseSession(state, event) {
  if (event.type === "SILENCE") {
    return state;
  }

  if (event.type === "HUMAN_AWAY") {
    return withEffectiveMode({
      ...state,
      humanPresence: event.duration === "long" ? "afk-long" : "afk-short",
      lease: event.lease,
      returnSummary: null
    });
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

  return state;
}
