import { resolvePresenceMode } from "../../../packages/core/src/index.js";
import { buildCollaborationPresentation } from "../../../packages/reference-ui/src/index.js";

const ROUTES = Object.freeze({
  off: Object.freeze({ route: "off", routeLabel: "Not attached" }),
  "native-cowork": Object.freeze({ route: "native", routeLabel: "Native Cowork" }),
  "native-webmcp": Object.freeze({ route: "webmcp", routeLabel: "Native WebMCP" }),
  "legacy-host-companion": Object.freeze({ route: "bridge", routeLabel: "Bounded Bridge" })
});

const EXECUTION_MODES = Object.freeze({
  structured: Object.freeze({
    executionMode: "structured",
    executionLabel: "Structured actions",
    computerUseActive: false
  }),
  "computer-use": Object.freeze({
    executionMode: "computer-use",
    executionLabel: "Computer use · higher token use",
    computerUseActive: true
  })
});

const CONTEXT_LABELS = Object.freeze([
  "Focus only",
  "Nearby semantics",
  "Related context",
  "One visual lens"
]);

const HUMAN_SEQUENCE = Object.freeze(["present", "afk-short", "afk-long"]);
const MODEL_SEQUENCE = Object.freeze(["collaborating", "observing", "paused"]);

function nextInSequence(value, sequence, label) {
  const index = sequence.indexOf(value);
  if (index < 0) throw new TypeError(`Cockpit requires a valid ${label}`);
  return sequence[(index + 1) % sequence.length];
}

export function nextHumanPresence(current) {
  return nextInSequence(current, HUMAN_SEQUENCE, "human presence");
}

export function nextModelEngagement(current) {
  return nextInSequence(current, MODEL_SEQUENCE, "model engagement");
}

export function buildCockpitPresentation(input) {
  const route = ROUTES[input?.mode];
  if (!route) throw new TypeError("Cockpit requires a supported connector route");
  const execution = EXECUTION_MODES[input?.executionMode];
  if (!execution) throw new TypeError("Cockpit requires a supported execution mode");

  if (
    !Number.isInteger(input?.contextLevel) ||
    input.contextLevel < 0 ||
    input.contextLevel >= CONTEXT_LABELS.length
  ) {
    throw new TypeError("Cockpit requires a bounded context level");
  }

  const agentPresence = input.agentEngagement === "paused" ? "paused" : "active";
  const effectiveMode = resolvePresenceMode({
    humanPresence: input.humanPresence,
    agentPresence,
    leaseValid: input.soloLeaseValid === true
  });
  let collaboration;
  try {
    collaboration = buildCollaborationPresentation({
      humanPresence: input.humanPresence,
      agentEngagement: input.agentEngagement,
      effectiveMode
    });
  } catch (error) {
    if (!HUMAN_SEQUENCE.includes(input?.humanPresence)) {
      throw new TypeError("Cockpit requires a valid human presence", { cause: error });
    }
    throw new TypeError("Cockpit requires a valid model engagement", { cause: error });
  }
  const { humanBadge: _humanBadge, modelBadge: _modelBadge, ...actorPresentation } = collaboration;

  return {
    ...route,
    ...execution,
    ...actorPresentation,
    effectiveMode,
    contextLevel: input.contextLevel,
    contextLabel: CONTEXT_LABELS[input.contextLevel]
  };
}
