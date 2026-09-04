import {
  resolveBridgeState,
  resolveWorkMode
} from "../../../packages/core/src/index.js";
import {
  BRIDGE_COPY,
  buildWorkModePresentation
} from "../../../packages/reference-ui/src/index.js";

const NO_SEAT_NOTE =
  "Model seat: none. This extension has no model client, so nothing is proposed here " +
  "until one attaches. Voice and handoff need the Desktop Companion " +
  "(npm run start:companion-host, then 127.0.0.1:47831/cowork/v1/ui).";

const ROUTES = Object.freeze({
  off: Object.freeze({
    route: "off",
    routeLabel: "Not attached",
    routeExplainer:
      "Not attached. Click the toolbar icon on a page to attach this bridge.",
    seatNote: "No page attached."
  }),
  "native-cowork": Object.freeze({
    route: "native",
    // "Native" describes the page, never this bridge. The old label read as if
    // the extension itself were the native thing, which is the opposite.
    routeLabel: "Page has its own tools (native WebMCP)",
    routeExplainer:
      "This page speaks Cowork Protocol itself, so this bridge only relays the " +
      "page's own tools; offers appear in the page's own panel and are clicked there.",
    seatNote:
      "Model seat: the page's own (Desktop Companion, page host, direct model or demo helper). " +
      "This extension adds no model."
  }),
  "native-webmcp": Object.freeze({
    route: "webmcp",
    routeLabel: "Page has WebMCP tools, no Cowork",
    routeExplainer:
      "The page exposes WebMCP tools but speaks no Cowork Protocol. Reads may run; " +
      "changes stay offer-only.",
    seatNote: NO_SEAT_NOTE
  }),
  "legacy-host-companion": Object.freeze({
    route: "bridge",
    routeLabel: "Bridge only (no WebMCP in this browser)",
    routeExplainer:
      "No protocol on this page, and no WebMCP to register tools into. Bounded " +
      "DOM/accessibility view; nothing changes without your click here.",
    seatNote: NO_SEAT_NOTE
  })
});

// The page had no Cowork tools, so this extension registered them. Any WebMCP
// agent in this browser can now read and propose here through its own chat;
// the click stays in this panel either way.
const TOOLS_REGISTERED_ROUTE = Object.freeze({
  route: "bridge-webmcp",
  routeLabel: "Bridge tools registered for this page",
  routeExplainer:
    "This page carried no Cowork tools, so this bridge registered them. Any WebMCP " +
    "agent in this browser may now read focus and propose; your click stays here.",
  seatNote:
    "Model seat: whichever WebMCP agent this browser attaches. This bridge supplies " +
    "the tools, not the model."
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

/**
 * The four statuses one figure cycles through. Availability answers "who is
 * here", role answers "executing or advising"; the area is the third question
 * and travels with the actor, so it is never part of the cycle.
 */
export const ACTOR_STATUS_CYCLE = Object.freeze([
  Object.freeze({ availability: "here", role: "executing" }),
  Object.freeze({ availability: "here", role: "advising" }),
  Object.freeze({ availability: "standby", role: "advising" }),
  Object.freeze({ availability: "away", role: "advising" })
]);

/**
 * Next status in the cycle. Pass the *resolved* actor (workMode.human /
 * .model), not the stored one: once a missing grant has taken the model's
 * authority away, the figure must cycle on from what the panel shows.
 */
export function nextActorStatus(actor) {
  const index = ACTOR_STATUS_CYCLE.findIndex(
    (candidate) =>
      candidate.availability === actor?.availability &&
      (actor.availability !== "here" || candidate.role === actor.role)
  );
  if (index < 0) throw new TypeError("Cockpit requires a valid actor status");
  return ACTOR_STATUS_CYCLE[(index + 1) % ACTOR_STATUS_CYCLE.length];
}

/**
 * The next status this surface can actually deliver, skipping the ones it
 * cannot grant - a seat cannot be clicked into existence, and execution
 * cannot be clicked past a missing grant. Returns null when the actor has
 * nowhere to go.
 */
export function nextAvailableStatus(actor, unavailable) {
  let next = nextActorStatus(actor);
  // Only the other three: landing back on the status we are already on is
  // nowhere to go, not a move.
  for (let step = 0; step < ACTOR_STATUS_CYCLE.length - 1; step += 1) {
    if (!unavailable(next)) return next;
    next = nextActorStatus(next);
  }
  return null;
}

export { resolveBridgeState };

export function buildCockpitPresentation(input) {
  const baseRoute = ROUTES[input?.mode];
  if (!baseRoute) throw new TypeError("Cockpit requires a supported connector route");
  const route = input?.toolsRegistered === true ? TOOLS_REGISTERED_ROUTE : baseRoute;
  const execution = EXECUTION_MODES[input?.executionMode];
  if (!execution) throw new TypeError("Cockpit requires a supported execution mode");

  if (
    !Number.isInteger(input?.contextLevel) ||
    input.contextLevel < 0 ||
    input.contextLevel >= CONTEXT_LABELS.length
  ) {
    throw new TypeError("Cockpit requires a bounded context level");
  }

  let workMode;
  try {
    workMode = resolveWorkMode({
      human: input.human,
      model: input.model,
      modelAuthorityValid: input.modelAuthorityValid === true
    });
  } catch (error) {
    throw new TypeError("Cockpit requires a valid actor status", { cause: error });
  }
  // Badges are drawn from CSS so the state survives a missing font; every
  // word comes from packages/reference-ui, none from this surface.
  const {
    humanBadge: _humanBadge,
    modelBadge: _modelBadge,
    ...presentation
  } = buildWorkModePresentation(workMode);

  const bridgeState = resolveBridgeState({
    companionConnected: input.companionConnected === true,
    pageOwnsBridge: input.pageOwnsBridge === true,
    agentLastSeenAt: input.agentLastSeenAt ?? null,
    agentIdleTimeoutMs: Number.isFinite(input.agentIdleTimeoutMs)
      ? input.agentIdleTimeoutMs
      : 90_000,
    offerPending: input.offerPending === true,
    // This bridge has no seat of its own; only an agent puts a model on it.
    seatOccupied: false,
    now: Number.isFinite(input.now) ? input.now : Date.now()
  });

  return {
    ...route,
    ...execution,
    ...presentation,
    bridgeState,
    // Every bridge word comes from packages/reference-ui, like every status
    // word, so both bridges say the same thing about the same emptiness.
    bridgeMessage:
      bridgeState === "companion"
        ? BRIDGE_COPY.companion
        : bridgeState === "page-owns"
          ? BRIDGE_COPY.pageOwnsBridge
          : bridgeState === "crossing"
            ? BRIDGE_COPY.crossing
            : BRIDGE_COPY.resting,
    authorityLapsed: workMode.authorityLapsed,
    doublingAvailable: workMode.doublingAvailable,
    contextLevel: input.contextLevel,
    contextLabel: CONTEXT_LABELS[input.contextLevel]
  };
}
