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
