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

/* ------------------------------------------------------------------ *
 * Work-mode vocabulary (v0.2)
 *
 * Every surface - showcase panel, browser side panel, Desktop Companion -
 * reads its wording from here. Never write these strings into a surface.
 * ------------------------------------------------------------------ */

/** The four questions a Cowork surface answers, in reading order. */
export const CLARIFY_STEPS = Object.freeze([
  Object.freeze({ id: "status", label: "Your status", question: "Clarify who is here" }),
  Object.freeze({ id: "mode", label: "How we work", question: "Clarify how you work together" }),
  Object.freeze({ id: "attention", label: "What the model sees", question: "Clarify what reaches the model" }),
  Object.freeze({ id: "task", label: "The model's job", question: "Clarify what the model may do" })
]);

const HUMAN_STATUS = Object.freeze({
  "here-acting": Object.freeze({ label: "You are working", badge: "●", tone: "green" }),
  "here-observing": Object.freeze({ label: "You are watching", badge: "◉", tone: "green" }),
  standby: Object.freeze({ label: "You are briefly away", badge: "◷", tone: "yellow" }),
  away: Object.freeze({ label: "You are away", badge: "↗", tone: "red" })
});

const MODEL_STATUS = Object.freeze({
  "here-acting": Object.freeze({ label: "Model is working", badge: "✓", tone: "green" }),
  "here-observing": Object.freeze({ label: "Model is advising", badge: "◉", tone: "green" }),
  standby: Object.freeze({ label: "Model on standby", badge: "Ⅱ", tone: "yellow" }),
  away: Object.freeze({ label: "Model disconnected", badge: "○", tone: "red" })
});

const WORK_MODES = Object.freeze({
  "cowork-human": Object.freeze({
    modeLabel: "Together · you act",
    relayState: "watching",
    modeDetail: "You click. The model watches and suggests."
  }),
  "cowork-model": Object.freeze({
    modeLabel: "Together · model acts",
    relayState: "live",
    modeDetail: "The model acts on your commands while you watch."
  }),
  parallel: Object.freeze({
    modeLabel: "Both at once",
    relayState: "live",
    modeDetail: "Both act at the same time, on separate targets."
  }),
  "human-solo": Object.freeze({
    modeLabel: "You work alone",
    relayState: "dormant",
    modeDetail: "The model is not taking part."
  }),
  "model-solo": Object.freeze({
    modeLabel: "Model works alone",
    relayState: "to-model",
    modeDetail: "The model finishes the agreed job while you are away."
  }),
  idle: Object.freeze({
    modeLabel: "Nobody is acting",
    relayState: "dormant",
    modeDetail: "No one holds the click right right now."
  })
});

const MODEL_TASKS = Object.freeze({
  acting: Object.freeze({
    taskLabel: "Work",
    taskDetail: "Acts within the agreed scope and reports every change."
  }),
  advising: Object.freeze({
    taskLabel: "Advise",
    taskDetail: "Explains and proposes. Nothing changes without your click."
  }),
  standby: Object.freeze({
    taskLabel: "Stand by",
    taskDetail: "Proposes nothing until you bring it back in."
  }),
  off: Object.freeze({
    taskLabel: "Disconnected",
    taskDetail: "No model is attached to this session."
  })
});

function statusKey(actor) {
  return actor?.availability === "here" ? `here-${actor.role}` : actor?.availability;
}

function modeKey(workMode) {
  if (workMode?.mode !== "cowork") return workMode?.mode;
  return workMode.authority === "model" ? "cowork-model" : "cowork-human";
}

function modelTaskKey(workMode) {
  if (workMode.model.availability === "away") return "off";
  if (workMode.model.availability === "standby") return "standby";
  return workMode.model.role === "acting" ? "acting" : "advising";
}

/**
 * Turn a resolved work mode (packages/core `resolveWorkMode`) into the words
 * and badges a surface renders. Pure lookup - all logic stays in core.
 */
export function buildWorkModePresentation(workMode) {
  const human = HUMAN_STATUS[statusKey(workMode?.human)];
  const model = MODEL_STATUS[statusKey(workMode?.model)];
  const mode = WORK_MODES[modeKey(workMode)];
  if (!human || !model || !mode) {
    throw new TypeError("Work-mode presentation requires a resolved work mode");
  }
  const task = MODEL_TASKS[modelTaskKey(workMode)];
  return Object.freeze({
    providerId: REFERENCE_UI_PROVIDER_ID,
    mode: workMode.mode,
    authority: workMode.authority,
    ...mode,
    humanState: statusKey(workMode.human),
    humanLabel: human.label,
    humanBadge: human.badge,
    humanTone: human.tone,
    modelState: statusKey(workMode.model),
    modelLabel: model.label,
    modelBadge: model.badge,
    modelTone: model.tone,
    ...task,
    authorityLabel:
      workMode.authority === "both"
        ? "Both hold the click right"
        : workMode.authority === "none"
          ? "Nobody holds the click right"
          : workMode.authority === "human"
            ? "You hold the click right"
            : "The model holds the click right"
  });
}

/** The selectable work modes, in the order a surface offers them. */
export const WORK_MODE_CHOICES = Object.freeze([
  Object.freeze({ id: "cowork-human", label: WORK_MODES["cowork-human"].modeLabel }),
  Object.freeze({ id: "cowork-model", label: WORK_MODES["cowork-model"].modeLabel }),
  Object.freeze({ id: "parallel", label: WORK_MODES.parallel.modeLabel }),
  Object.freeze({ id: "human-solo", label: WORK_MODES["human-solo"].modeLabel }),
  Object.freeze({ id: "model-solo", label: WORK_MODES["model-solo"].modeLabel }),
  Object.freeze({ id: "idle", label: WORK_MODES.idle.modeLabel })
]);

/**
 * The reverse direction: picking a mode sets both actors' status. This is why
 * no surface needs a separate action-rights control - and why choosing a mode
 * moves the status displays, exactly as clicking a figure moves the mode.
 */
export function statusForWorkModeChoice(choiceId, current = {}) {
  const stillAway = current?.human?.availability === "away" ? "away" : "standby";
  switch (choiceId) {
    case "cowork-human":
      return { human: { availability: "here", role: "acting" }, model: { availability: "here", role: "observing" }, allowParallel: false };
    case "cowork-model":
      return { human: { availability: "here", role: "observing" }, model: { availability: "here", role: "acting" }, allowParallel: false };
    case "parallel":
      return { human: { availability: "here", role: "acting" }, model: { availability: "here", role: "acting" }, allowParallel: true };
    case "human-solo":
      return { human: { availability: "here", role: "acting" }, model: { availability: "standby", role: "observing" }, allowParallel: false };
    case "model-solo":
      return { human: { availability: stillAway, role: "observing" }, model: { availability: "here", role: "acting" }, allowParallel: false };
    case "idle":
      return { human: { availability: "here", role: "observing" }, model: { availability: "standby", role: "observing" }, allowParallel: false };
    default:
      throw new TypeError(`Unknown work-mode choice: ${choiceId}`);
  }
}
