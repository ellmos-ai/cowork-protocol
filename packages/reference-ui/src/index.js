export const REFERENCE_UI_PROVIDER_ID = "cowork-reference-ui";

const MODE_LABELS = Object.freeze({
  cowork: "Cowork",
  "agent-solo": "Agent solo",
  "human-solo": "Human solo",
  idle: "Idle"
});

const HUMAN_PRESENTATIONS = Object.freeze({
  present: Object.freeze({ humanTone: "green", humanLabel: "Human present" }),
  "afk-short": Object.freeze({
    humanTone: "yellow",
    humanLabel: "Human briefly away"
  }),
  "afk-long": Object.freeze({
    humanTone: "red",
    humanLabel: "Human away for longer"
  })
});

const COLLABORATION_HUMANS = Object.freeze({
  present: Object.freeze({ humanLabel: "You are here", humanBadge: "●" }),
  "afk-short": Object.freeze({
    humanLabel: "You are briefly away",
    humanBadge: "◷"
  }),
  "afk-long": Object.freeze({ humanLabel: "You are away", humanBadge: "↗" })
});

const COLLABORATION_MODELS = Object.freeze({
  collaborating: Object.freeze({ modelLabel: "Model collaborating", modelBadge: "✓" }),
  observing: Object.freeze({ modelLabel: "Model observing", modelBadge: "◉" }),
  paused: Object.freeze({ modelLabel: "Model paused", modelBadge: "Ⅱ" })
});

const COLLABORATION_MODES = Object.freeze({
  cowork: Object.freeze({ modeLabel: "Working together", relayState: "live" }),
  "human-solo": Object.freeze({ modeLabel: "Human working solo", relayState: "dormant" }),
  "agent-solo": Object.freeze({ modeLabel: "Model working solo", relayState: "to-model" }),
  idle: Object.freeze({ modeLabel: "Both paused", relayState: "dormant" })
});

export function buildCollaborationPresentation({
  humanPresence,
  agentEngagement,
  effectiveMode
}) {
  const human = COLLABORATION_HUMANS[humanPresence];
  let model = COLLABORATION_MODELS[agentEngagement];
  let mode = COLLABORATION_MODES[effectiveMode];
  if (!human || !model || !mode) {
    throw new TypeError("Collaboration presentation requires valid actor and mode values");
  }
  if (agentEngagement === "paused") {
    mode = humanPresence === "present"
      ? COLLABORATION_MODES["human-solo"]
      : COLLABORATION_MODES.idle;
  } else if (agentEngagement === "observing" && effectiveMode === "cowork") {
    mode = Object.freeze({ modeLabel: "Model watching", relayState: "watching" });
  } else if (agentEngagement === "observing" && effectiveMode === "agent-solo") {
    mode = Object.freeze({ modeLabel: "Model waiting", relayState: "dormant" });
  } else if (
    effectiveMode === "idle" &&
    humanPresence !== "present" &&
    agentEngagement !== "paused"
  ) {
    mode = Object.freeze({ modeLabel: "Model waiting", relayState: "dormant" });
    if (agentEngagement === "collaborating") {
      model = Object.freeze({ ...model, modelLabel: "Model ready" });
    }
  }
  return Object.freeze({
    humanState: humanPresence,
    ...human,
    modelState: agentEngagement,
    ...model,
    ...mode
  });
}

export function buildReferenceSurfacePresentation({
  humanPresence,
  agentPresence,
  effectiveMode
}) {
  const human = HUMAN_PRESENTATIONS[humanPresence];
  const modeLabel = MODE_LABELS[effectiveMode];
  if (!human || !modeLabel || !["active", "paused"].includes(agentPresence)) {
    throw new TypeError("Reference UI requires valid Cowork presence and mode values");
  }
  return Object.freeze({
    providerId: REFERENCE_UI_PROVIDER_ID,
    humanIcon: "●",
    modelIcon: "A",
    ...human,
    agentLabel: agentPresence === "paused" ? "Agent paused" : "Agent active",
    modeLabel
  });
}
