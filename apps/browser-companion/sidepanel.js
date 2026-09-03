import {
  buildCockpitPresentation
} from "./modules/apps/browser-companion/src/cockpit-presentation.js";

const $ = (selector) => document.querySelector(selector);
const root = $(".cowork-cockpit");
let currentState = null;
let refreshBusy = false;
let notice = null;
let noticeUntil = 0;

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

function presentationInput(state) {
  return {
    enabled: state?.enabled === true,
    mode: state?.mode ?? "off",
    executionMode: state?.executionMode ?? "structured",
    humanPresence: state?.humanPresence ?? "present",
    agentEngagement:
      state?.agentEngagement ?? (state?.enabled === true ? "collaborating" : "paused"),
    soloLeaseValid: state?.soloLeaseValid === true,
    contextLevel: Number.isInteger(state?.contextLevel) ? state.contextLevel : 0
  };
}

function render(state) {
  currentState = state;
  const presentation = buildCockpitPresentation(presentationInput(state));
  root.dataset.humanState = presentation.humanState;
  root.dataset.modelState = presentation.modelState;
  root.dataset.relayState = presentation.relayState;
  root.dataset.route = presentation.route;
  root.dataset.executionMode = presentation.executionMode;

  const computerUseIndicator = $("#computer-use-indicator");
  computerUseIndicator.setAttribute(
    "aria-hidden",
    String(!presentation.computerUseActive)
  );

  $("#connection-lamp").setAttribute("aria-label", presentation.routeLabel);
  $("#human-label").textContent = presentation.humanLabel;
  $("#model-label").textContent = presentation.modelLabel;
  $("#human-control").setAttribute(
    "aria-pressed",
    String(presentation.humanState === "present")
  );
  $("#model-control").setAttribute(
    "aria-pressed",
    String(presentation.modelState === "collaborating")
  );
  $("#mode").textContent = presentation.modeLabel;
  $("#relay-core").setAttribute("aria-label", presentation.modeLabel);
  $("#relay-label").textContent = presentation.modeLabel;
  $("#relay-detail").textContent = presentation.relayDetail;
  $("#relay-detail").title = presentation.relayDetail;
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

$("#handoff-action").addEventListener("click", async (event) => {
  if (!event.isTrusted) return;
  if (currentState?.soloLeaseValid !== true) {
    setNotice(ERROR_MESSAGES.SOLO_LEASE_REQUIRED);
    return;
  }
  await operate({ type: "cowork:sidepanel:cycle-human" });
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
