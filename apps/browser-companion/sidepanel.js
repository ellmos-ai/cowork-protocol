import {
  buildCockpitPresentation
} from "./modules/apps/browser-companion/src/cockpit-presentation.js";
import {
  BRIDGE_COPY,
  BRIDGE_ICON,
  createStepIcon,
  STATUS_STEPS
} from "./modules/packages/reference-ui/src/index.js";

const $ = (selector) => document.querySelector(selector);
const root = $(".cowork-cockpit");
let currentState = null;
let refreshBusy = false;
let notice = null;
let noticeUntil = 0;
// Arrival and departure are transitions, so only this panel can see them: the
// runtime knows whether an agent is on the bridge right now, not whether it
// just got there. Opening the panel onto an agent already at work is not an
// arrival and must not be animated as one, which is why the first render
// starts from null and plays nothing.
let bridgeState = null;
let bridgeStage = null;
let bridgeStageUntil = 0;
const ARRIVAL_MS = 1400;
const DEPARTURE_MS = 4000;

const ERROR_MESSAGES = Object.freeze({
  SOLO_LEASE_REQUIRED: "Open the Desktop Companion and approve solo work before leaving.",
  COMPANION_DISABLED: "Start Cowork before using this instrument.",
  CONTEXT_LIMIT_REACHED: "The one-shot visual context level is already reached.",
  LEGACY_TARGET_REQUIRED: "Point at or focus a page control first.",
  NATIVE_COWORK_TOOL_UNAVAILABLE: "This page does not expose that native Cowork tool.",
  SIDE_PANEL_REQUEST_FAILED: "The page relay is unavailable. Use the toolbar action again."
});

async function send(message) {
  const envelope = await chrome.runtime.sendMessage(message);
  if (!envelope?.ok) throw new Error(envelope?.code ?? "SIDE_PANEL_REQUEST_FAILED");
  return envelope.result;
}

function setNotice(message, milliseconds = 3500) {
  notice = message;
  noticeUntil = Date.now() + milliseconds;
  $("#status").textContent = message;
}

// The two status variables per actor are the whole input; the work mode and
// the click right follow from them. There is no action-rights setting to read.
function presentationInput(state) {
  return {
    mode: state?.mode ?? "off",
    // Set once this extension has put Cowork tools on a page that had none.
    toolsRegistered: state?.toolsRegistered === true,
    executionMode: state?.executionMode ?? "structured",
    human: state?.human ?? { availability: "here", role: "executing", area: null },
    model: state?.model ?? { availability: "away", role: "advising", area: null },
    // The grant is the only authority record, so its absence is the default.
    modelAuthorityValid: state?.modelAuthorityValid === true,
    contextLevel: Number.isInteger(state?.contextLevel) ? state.contextLevel : 0,
    // Who is on the bridge, and who steps aside for whom.
    pageOwnsBridge: state?.pageOwnsBridge === true,
    companionConnected: state?.companionConnected === true,
    agentLastSeenAt: state?.agentLastSeenAt ?? null,
    agentIdleTimeoutMs: state?.agentIdleTimeoutMs,
    // An offer waiting for a click is an agent still waiting for an answer.
    offerPending: Boolean(state?.pendingOffer),
    now: Date.now()
  };
}

function renderBridge(presentation, state) {
  const next = presentation.bridgeState;
  if (bridgeState !== next) {
    if (bridgeState === "resting" && next === "crossing") {
      bridgeStage = "arriving";
      bridgeStageUntil = Date.now() + ARRIVAL_MS;
    } else if (bridgeState === "crossing" && next === "resting") {
      bridgeStage = "leaving";
      bridgeStageUntil = Date.now() + DEPARTURE_MS;
    } else {
      bridgeStage = null;
      bridgeStageUntil = 0;
    }
    bridgeState = next;
    // The 600 ms poll would leave the panel closed for up to half a second
    // after the crossing finishes; wake it exactly when the stage ends.
    if (bridgeStage) setTimeout(refresh, bridgeStageUntil - Date.now() + 40);
  }
  const stage = Date.now() < bridgeStageUntil ? bridgeStage : bridgeState;
  root.dataset.bridge = stage;
  $("#bridge-message").textContent =
    stage === "arriving"
      ? BRIDGE_COPY.arriving
      : stage === "leaving"
        ? BRIDGE_COPY.left
        : presentation.bridgeMessage;
  const origin = state?.origin ?? null;
  $("#bridge-where").textContent = origin
    ? `${origin} · ${presentation.routeLabel}`
    : presentation.routeExplainer;
}

function render(state) {
  currentState = state;
  const presentation = buildCockpitPresentation(presentationInput(state));
  root.dataset.humanState = presentation.humanState;
  root.dataset.modelState = presentation.modelState;
  root.dataset.relayState = presentation.relayState;
  root.dataset.route = presentation.route;
  root.dataset.executionMode = presentation.executionMode;
  renderBridge(presentation, state);

  const computerUseIndicator = $("#computer-use-indicator");
  computerUseIndicator.setAttribute(
    "aria-hidden",
    String(!presentation.computerUseActive)
  );

  $("#connection-lamp").setAttribute("aria-label", presentation.routeLabel);
  $("#human-label").textContent = presentation.humanLabel;
  $("#model-label").textContent = presentation.modelLabel;
  // Pressed means "taking part": here, whichever role.
  $("#human-control").setAttribute(
    "aria-pressed",
    String(presentation.humanState.startsWith("here"))
  );
  $("#model-control").setAttribute(
    "aria-pressed",
    String(presentation.modelState.startsWith("here"))
  );
  // Question two of the status bar, per partner: what each one is on.
  $("#human-area").textContent = presentation.humanArea ?? "You";
  $("#model-area").textContent = presentation.modelArea ?? "Model";
  $("#human-area").title = presentation.areaLabel;
  $("#model-area").title = presentation.areaLabel;
  $("#mode").textContent = presentation.modeLabel;
  $("#relay-core").setAttribute("aria-label", presentation.modeLabel);
  $("#relay-label").textContent = presentation.modeLabel;
  $("#relay-detail").textContent = presentation.modeDetail;
  $("#relay-detail").title = `${presentation.authorityLabel}. ${presentation.roleDetail}`;
  $("#route-explainer").textContent = presentation.routeExplainer;
  $("#seat-note").textContent = presentation.seatNote;

  if (!notice || Date.now() >= noticeUntil) {
    notice = null;
    $("#status").textContent = state?.statusText ?? "Use the model figure to start Cowork.";
  }
  $("#focus-label").textContent = state?.focusLabel ?? "Point to a page control";
  $("#focus-detail").textContent = state?.focusDetail ?? "No page content requested yet";
  $("#context-gauge").dataset.level = String(presentation.contextLevel);
  $("#context-label").textContent = presentation.contextLabel;
  const visibleSteps = presentation.contextLevel === 0
    ? 1
    : presentation.contextLevel >= 3
      ? 3
      : 2;
  document.querySelectorAll(".gauge-step").forEach((step, index) => {
    step.classList.toggle("is-active", index < visibleSteps);
  });

  const enabled = state?.enabled === true;
  $("#toggle").setAttribute("aria-pressed", String(enabled));
  $("#toggle").setAttribute(
    "aria-label",
    enabled ? "Pause model collaboration" : "Start model collaboration"
  );
  $("#toggle span").textContent = enabled ? "Pause" : "Start";

  const soloAvailable = state?.soloLeaseValid === true;
  $("#handoff-action").classList.toggle("is-restricted", !soloAvailable);
  $("#handoff-action").setAttribute("aria-disabled", String(!soloAvailable));

  const offer = state?.pendingOffer;
  $("#offer-card").hidden = !offer;
  $("#offer-action").textContent = offer?.summary ?? "";
  $("#offer-action").dataset.offerId = offer?.offerId ?? "";
}

async function operate(message) {
  try {
    const response = await send(message);
    if (response?.state) render(response.state);
    return response;
  } catch (error) {
    setNotice(ERROR_MESSAGES[error.message] ?? "That Cockpit control is not available here.");
    return null;
  }
}

async function refresh() {
  if (refreshBusy) return;
  refreshBusy = true;
  try {
    const response = await send({ type: "cowork:sidepanel:get-state" });
    render(response.state);
  } catch {
    render(null);
  } finally {
    refreshBusy = false;
  }
}

// The bridge mark is drawn from the shared vocabulary too, so both bridges
// show the same mark for the same emptiness.
$("#bridge-mark").replaceChildren(createStepIcon(BRIDGE_ICON, document));

// Every visible status word comes from packages/reference-ui.
$("#status-steps").replaceChildren(
  ...STATUS_STEPS.map((step) => {
    const item = document.createElement("span");
    item.append(createStepIcon(step.icon, document), step.label);
    item.title = step.question;
    return item;
  })
);

$("#model-control").addEventListener("click", async (event) => {
  if (event.isTrusted) await operate({ type: "cowork:sidepanel:cycle-model" });
});

$("#human-control").addEventListener("click", async (event) => {
  if (event.isTrusted) await operate({ type: "cowork:sidepanel:cycle-human" });
});

$("#toggle").addEventListener("click", async (event) => {
  if (event.isTrusted) await operate({ type: "cowork:sidepanel:toggle" });
});

$("#focus-action").addEventListener("click", async (event) => {
  if (event.isTrusted) await operate({ type: "cowork:sidepanel:read-focus" });
});

async function requestContext(event) {
  if (event.isTrusted) await operate({ type: "cowork:sidepanel:request-context" });
}
$("#context-gauge").addEventListener("click", requestContext);
$("#context-action").addEventListener("click", requestContext);

// Like Speak, this key explains a capability the extension does not have: no
// Session Authority here grants a solo lease, so it never performs a handoff.
$("#handoff-action").addEventListener("click", (event) => {
  if (event.isTrusted) setNotice(ERROR_MESSAGES.SOLO_LEASE_REQUIRED);
});

$("#voice-action").addEventListener("click", (event) => {
  if (event.isTrusted) {
    setNotice("Voice needs the Desktop Companion's model seat; this extension has none.");
  }
});

$("#offer-action").addEventListener("click", async (event) => {
  if (!event.isTrusted || !currentState?.pendingOffer) return;
  const offerId = currentState.pendingOffer.offerId;
  try {
    await operate({
      type: "cowork:sidepanel:confirm-offer",
      offerId,
      humanGesture: true
    });
  } finally {
    await refresh();
  }
});

await refresh();
setInterval(refresh, 600);
