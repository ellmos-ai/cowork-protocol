export const REFERENCE_UI_PROVIDER_ID = "cowork-reference-ui";


/* ------------------------------------------------------------------ *
 * Work-mode vocabulary (v0.2)
 *
 * Every surface - showcase panel, browser side panel, Desktop Companion -
 * reads its wording from here. Never write these strings into a surface.
 * ------------------------------------------------------------------ */

/** The three questions a Cowork surface answers, in reading order. Each step
 *  carries its icon as bare path data, so every surface draws the same mark
 *  without an icon font, a sprite or a second asset that could fail to load. */
export const STATUS_STEPS = Object.freeze([
  Object.freeze({
    id: "present",
    label: "Present",
    question: "Who is here right now",
    icon: Object.freeze([
      "M12 4.4a3.4 3.4 0 1 1 0 6.8 3.4 3.4 0 0 1 0-6.8Z",
      "M4.9 19.6a7.1 7.1 0 0 1 14.2 0"
    ])
  }),
  Object.freeze({
    id: "area",
    label: "Working on",
    question: "Which page, task or field",
    icon: Object.freeze([
      "M4.4 8.6V5.9A1.5 1.5 0 0 1 5.9 4.4h2.7",
      "M15.4 4.4h2.7a1.5 1.5 0 0 1 1.5 1.5v2.7",
      "M19.6 15.4v2.7a1.5 1.5 0 0 1-1.5 1.5h-2.7",
      "M8.6 19.6H5.9a1.5 1.5 0 0 1-1.5-1.5v-2.7",
      "M12 11.9v.2"
    ])
  }),
  Object.freeze({
    id: "role",
    label: "Role",
    question: "Executing or advising",
    icon: Object.freeze([
      "M7.4 8.4h11.2",
      "M15.4 5.2 18.6 8.4l-3.2 3.2",
      "M16.6 15.6H5.4",
      "M8.6 12.4 5.4 15.6l3.2 3.2"
    ])
  })
]);

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/**
 * Draws one of the icons above into a surface's document. It lives here beside
 * the words it belongs to: a surface never invents a mark of its own, exactly
 * as it never invents a label of its own.
 */
export function createStepIcon(paths, doc) {
  const svg = doc.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("class", "ui-icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  for (const d of paths) {
    const path = doc.createElementNS(SVG_NAMESPACE, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

/* ------------------------------------------------------------------ *
 * Bridge vocabulary
 *
 * A bridge has a place; a vehicle carries a model across it. Both bridges -
 * the one a page builds into itself and the one the extension carries onto a
 * page that built none - say these words, so a person who learns the bridge
 * once recognises it anywhere.
 * ------------------------------------------------------------------ */

/** The bridge mark, in the same monoline 24x24 language as STATUS_STEPS. */
export const BRIDGE_ICON = Object.freeze([
  "M2.5 13h19",
  "M4.5 19a7.5 6 0 0 1 15 0",
  "M4.5 13v6",
  "M19.5 13v6"
]);

/** What a bridge says about itself. Never write these into a surface. */
export const BRIDGE_COPY = Object.freeze({
  resting: "No model is crossing the bridge.",
  arriving: "A model is coming across the bridge.",
  crossing: "A model is on the bridge.",
  left: "The model left the bridge.",
  pageOwnsBridge:
    "This page carries its own bridge; the panel on the page takes your clicks.",
  companion: "Session lives in the Desktop Companion."
});

const HUMAN_STATUS = Object.freeze({
  "here-executing": Object.freeze({ label: "You are executing", badge: "●", tone: "green" }),
  "here-advising": Object.freeze({ label: "You are advising", badge: "◉", tone: "green" }),
  standby: Object.freeze({ label: "You are briefly away", badge: "◷", tone: "yellow" }),
  away: Object.freeze({ label: "You are away", badge: "↗", tone: "red" })
});

const MODEL_STATUS = Object.freeze({
  "here-executing": Object.freeze({ label: "Model is executing", badge: "✓", tone: "green" }),
  "here-advising": Object.freeze({ label: "Model is advising", badge: "◉", tone: "green" }),
  standby: Object.freeze({ label: "Model on standby", badge: "Ⅱ", tone: "yellow" }),
  away: Object.freeze({ label: "No model connected", badge: "○", tone: "red" })
});

const WORK_MODES = Object.freeze({
  "sparring-human": Object.freeze({
    modeLabel: "Sparring · you execute",
    relayState: "watching",
    modeDetail: "You act, the model advises. Say the word and it swaps."
  }),
  "sparring-model": Object.freeze({
    modeLabel: "Sparring · model executes",
    relayState: "live",
    modeDetail: "The model acts inside its granted job, you advise."
  }),
  doubling: Object.freeze({
    modeLabel: "Doubling",
    relayState: "live",
    modeDetail: "Both act at once, each confined to a different area."
  }),
  "human-solo": Object.freeze({
    modeLabel: "You work alone",
    relayState: "dormant",
    modeDetail: "The model is not taking part."
  }),
  "model-solo": Object.freeze({
    modeLabel: "Model works alone",
    relayState: "to-model",
    modeDetail: "The model finishes its granted job while you are away."
  }),
  idle: Object.freeze({
    modeLabel: "Nobody is executing",
    relayState: "dormant",
    modeDetail: "No one holds the click right right now."
  })
});

const MODEL_ROLES = Object.freeze({
  executing: Object.freeze({
    roleLabel: "Executing",
    roleDetail: "Acts inside the granted goal and budget, and reports every change."
  }),
  advising: Object.freeze({
    roleLabel: "Advising",
    roleDetail: "Explains and proposes. Nothing changes without your click."
  }),
  standby: Object.freeze({
    roleLabel: "Standing by",
    roleDetail: "Proposes nothing until you bring it back in."
  }),
  off: Object.freeze({
    roleLabel: "No seat",
    roleDetail: "No model is connected to this session."
  })
});

function statusKey(actor) {
  return actor?.availability === "here" ? `here-${actor.role}` : actor?.availability;
}

function modeKey(workMode) {
  if (workMode?.mode !== "sparring") return workMode?.mode;
  return workMode.authority === "model" ? "sparring-model" : "sparring-human";
}

function modelRoleKey(workMode) {
  if (workMode.model.availability === "away") return "off";
  if (workMode.model.availability === "standby") return "standby";
  return workMode.model.role;
}

function describeAreas(workMode) {
  const humanArea = workMode.human.area;
  const modelArea = workMode.model.area;
  if (humanArea === null && modelArea === null) return "Nothing claimed yet";
  if (humanArea === modelArea) return `Both on ${humanArea}`;
  return [
    humanArea === null ? null : `You: ${humanArea}`,
    modelArea === null ? null : `Model: ${modelArea}`
  ]
    .filter(Boolean)
    .join(" · ");
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
  const role = MODEL_ROLES[modelRoleKey(workMode)];
  return Object.freeze({
    providerId: REFERENCE_UI_PROVIDER_ID,
    mode: workMode.mode,
    authority: workMode.authority,
    ...mode,
    humanState: statusKey(workMode.human),
    humanLabel: human.label,
    humanBadge: human.badge,
    humanTone: human.tone,
    humanArea: workMode.human.area,
    modelState: statusKey(workMode.model),
    modelLabel: model.label,
    modelBadge: model.badge,
    modelTone: model.tone,
    modelArea: workMode.model.area,
    ...role,
    areaLabel: describeAreas(workMode),
    authorityLabel:
      workMode.authority === "both"
        ? "Both hold the click right, each in its own area"
        : workMode.authority === "none"
          ? "Nobody holds the click right"
          : workMode.authority === "human"
            ? "You hold the click right"
            : "The model holds the click right"
  });
}

/**
 * The selectable work modes, in the order a surface offers them. Doubling is
 * only offered while the two are on different areas - otherwise it would
 * promise a simultaneity the tools and the task cannot give.
 */
export function workModeChoices(workMode) {
  const choices = [
    { id: "sparring-human", label: WORK_MODES["sparring-human"].modeLabel },
    { id: "sparring-model", label: WORK_MODES["sparring-model"].modeLabel },
    { id: "human-solo", label: WORK_MODES["human-solo"].modeLabel },
    { id: "model-solo", label: WORK_MODES["model-solo"].modeLabel },
    { id: "idle", label: WORK_MODES.idle.modeLabel }
  ];
  if (workMode?.doublingAvailable === true || workMode?.mode === "doubling") {
    choices.splice(2, 0, { id: "doubling", label: WORK_MODES.doubling.modeLabel });
  }
  return Object.freeze(choices.map((choice) => Object.freeze(choice)));
}

/**
 * The reverse direction: picking a mode sets the status of both partners.
 * This is why no surface needs a separate action-rights control, and why
 * choosing a mode moves the status displays exactly as clicking a figure
 * moves the mode. Areas carry over; a mode never invents what someone is on.
 */
export function statusForWorkModeChoice(choiceId, current = {}) {
  const humanArea = current.human?.area ?? null;
  const modelArea = current.model?.area ?? null;
  const stillAway = current.human?.availability === "away" ? "away" : "standby";
  const pair = (humanAvailability, humanRole, modelAvailability, modelRole) => ({
    human: { availability: humanAvailability, role: humanRole, area: humanArea },
    model: { availability: modelAvailability, role: modelRole, area: modelArea }
  });
  switch (choiceId) {
    case "sparring-human":
      return pair("here", "executing", "here", "advising");
    case "sparring-model":
      return pair("here", "advising", "here", "executing");
    case "doubling":
      return pair("here", "executing", "here", "executing");
    case "human-solo":
      return pair("here", "executing", "standby", "advising");
    case "model-solo":
      return pair(stillAway, "advising", "here", "executing");
    case "idle":
      return pair("here", "advising", "standby", "advising");
    default:
      throw new TypeError(`Unknown work-mode choice: ${choiceId}`);
  }
}

// --- Spoken replies --------------------------------------------------------
// One voice for every Cowork surface: the page, the detached panel and the
// Companion window all speak through this, so a session never answers in two
// different voices. Male Natural voices first - Andrew is the voice of the
// project's videos - then any en-US Natural/Neural voice, then any en-US voice
// at all. The browser default is only used when the browser offers no en-US
// voice, because that default is what made the Companion answer in a
// different voice than the page.
export const PREFERRED_VOICE_NAMES = Object.freeze([
  "Andrew",
  "Guy",
  "Christopher",
  "David"
]);

export function selectSpeechVoice(voices) {
  const english = (Array.isArray(voices) ? voices : []).filter(
    (voice) => typeof voice?.name === "string" && /^en-us/i.test(voice.lang ?? "")
  );
  const natural = english.filter((voice) => /natural|neural/i.test(voice.name));
  for (const candidates of [natural, english]) {
    for (const preferred of PREFERRED_VOICE_NAMES) {
      const match = candidates.find((voice) => voice.name.includes(preferred));
      if (match) return match;
    }
  }
  // A machine whose only en-US voice is the female Zira gets Zira: an en-US
  // voice the surface picked on purpose still beats a browser default that,
  // on a German Windows, reads English aloud in a German voice.
  return natural[0] ?? english[0] ?? null;
}

/**
 * A speaker that says each thing once. `once` keys a receipt or a turn, so a
 * re-render, a delta pull or a session handover replays no announcement, and
 * announcements that arrive in the same burst become one sentence instead of
 * cutting each other into fragments.
 */
export function createSpeaker({
  synthesis,
  Utterance = globalThis.SpeechSynthesisUtterance,
  isEnabled = () => true,
  coalesceMs = 120,
  // getVoices() is empty until the browser has loaded the list. Speaking
  // before that is what picked the browser default for the first sentence.
  voiceWaitMs = 1200,
  setTimer = setTimeout,
  clearTimer = clearTimeout
} = {}) {
  const announced = new Set();
  let pending = [];
  let timer = null;
  let voice = null;

  function resolveVoice() {
    if (!voice) voice = selectSpeechVoice(synthesis?.getVoices?.() ?? []);
    return voice;
  }

  function schedule() {
    if (!pending.length) return;
    if (timer !== null) clearTimer(timer);
    timer = setTimer(flush, resolveVoice() ? coalesceMs : voiceWaitMs);
  }

  function flush() {
    timer = null;
    const message = pending.join(" ");
    pending = [];
    if (!message) return;
    synthesis.cancel();
    const utterance = new Utterance(message);
    utterance.lang = "en-US";
    utterance.rate = 1.02;
    const chosen = resolveVoice();
    if (chosen) utterance.voice = chosen;
    synthesis.speak(utterance);
  }

  synthesis?.addEventListener?.("voiceschanged", () => {
    voice = null;
    resolveVoice();
    schedule();
  });

  return {
    speak(message, { once = null } = {}) {
      if (!synthesis || !Utterance || !message || !isEnabled()) return false;
      if (once !== null) {
        if (announced.has(once)) return false;
        announced.add(once);
      }
      pending.push(String(message));
      schedule();
      return true;
    },
    // Only for a surface that stops speaking mid-sentence, e.g. when the page
    // hands the session to the Companion window.
    silence() {
      if (timer !== null) clearTimer(timer);
      timer = null;
      pending = [];
      synthesis?.cancel?.();
    }
  };
}

// --- Push to talk ----------------------------------------------------------
// Holding a key and speaking without stopping are the same gesture on every
// surface, so the rules live here once: the page panel, the detached panel and
// the Companion window all listen the same way.

/**
 * The new final text in one recognition result event. While listening
 * continuously the event carries every result of the session, and only the
 * ones from `resultIndex` on are new; an interim result is not yet something
 * the human finished saying, so it never becomes text to send.
 */
export function readFinalTranscript(event) {
  const results = event?.results ?? [];
  const start = Number.isInteger(event?.resultIndex) ? event.resultIndex : 0;
  let text = "";
  for (let index = start; index < results.length; index += 1) {
    const result = results[index];
    if (result?.isFinal === false) continue;
    text += result?.[0]?.transcript ?? "";
  }
  return text.trim();
}

/** Where a space bar is a space and nothing else. */
function typesText(target) {
  if (target?.isContentEditable === true) return true;
  return /^(input|textarea|select|button|a)$/i.test(target?.tagName ?? "");
}

/**
 * Hold-to-talk: pressing the key starts listening, releasing it stops. The
 * repeats a held key sends are not further presses, and a window that loses
 * focus mid-hold never sees the release - without `cancel` the microphone
 * would stay open with nobody holding anything.
 */
export function createHoldToTalk({ start, stop, key = " ", isTypingTarget = typesText }) {
  let held = false;
  const wrongKey = (event) =>
    event?.key !== key || event.ctrlKey || event.altKey || event.metaKey;

  return {
    keydown(event) {
      if (held || wrongKey(event) || isTypingTarget(event.target)) return false;
      held = true;
      event.preventDefault?.();
      start();
      return true;
    },
    keyup(event) {
      if (!held || wrongKey(event)) return false;
      held = false;
      event.preventDefault?.();
      stop();
      return true;
    },
    cancel() {
      if (!held) return false;
      held = false;
      stop();
      return true;
    },
    isHeld: () => held
  };
}
