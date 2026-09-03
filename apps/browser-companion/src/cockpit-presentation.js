import { resolvePresenceMode } from "../../../packages/core/src/index.js";
import { buildCollaborationPresentation } from "../../../packages/reference-ui/src/index.js";

const NO_SEAT_NOTE =
  "Model seat: none. This extension has no model client, so nothing is proposed here " +
  "until one attaches. Voice and handoff need the Desktop Companion " +
  "(npm run start:companion-host, then 127.0.0.1:47831/cowork/v1/ui).";

const ROUTES = Object.freeze({
  off: Object.freeze({
    route: "off",
    routeLabel: "Not attached",
    routeExplainer:
      "Not attached. Click the toolbar icon on a page to attach this panel.",
    seatNote: "No page attached."
  }),
  "native-cowork": Object.freeze({
    route: "native",
    routeLabel: "Native Cowork",
    routeExplainer:
      "Native — this page speaks Cowork Protocol. This panel relays the page's own tools; " +
      "offers appear in the page's Cowork panel and are clicked there.",
    seatNote:
      "Model seat: the page's own (Desktop Companion, page host, direct model or demo helper). " +
      "This extension adds no model."
  }),
  "native-webmcp": Object.freeze({
    route: "webmcp",
    routeLabel: "Native WebMCP",
    routeExplainer:
      "WebMCP — the page exposes WebMCP tools but no Cowork Protocol. Reads may run; " +
      "changes stay offer-only.",
    seatNote: NO_SEAT_NOTE
  }),
  "legacy-host-companion": Object.freeze({
    route: "bridge",
    routeLabel: "Bounded Bridge",
    routeExplainer:
      "Bridge — no protocol on this page. Bounded DOM/accessibility fallback; " +
      "nothing changes without your click here.",
    seatNote: NO_SEAT_NOTE
  })
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

function relayDetailFor(route, relayState, effectiveMode) {
  if (relayState === "live") {
    return route === "native"
      ? "Ideas and actions relay through the page"
      : "Ready to relay — no model connected in this extension";
  }
  if (relayState === "watching") return "Model reads and explains only";
  if (relayState === "to-model") return "Scoped solo work is flowing to the model";
  if (effectiveMode === "human-solo") return "Model is paused";
  return "No collaboration turn is active";
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
    relayDetail: relayDetailFor(route.route, actorPresentation.relayState, effectiveMode),
    contextLevel: input.contextLevel,
    contextLabel: CONTEXT_LABELS[input.contextLevel]
  };
}
