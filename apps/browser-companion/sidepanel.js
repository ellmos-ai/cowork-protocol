import {
  buildReferenceSurfacePresentation
} from "./modules/packages/reference-ui/src/index.js";

const $ = (selector) => document.querySelector(selector);
let currentState = null;
let refreshBusy = false;

async function send(message) {
  const envelope = await chrome.runtime.sendMessage(message);
  if (!envelope?.ok) throw new Error(envelope?.code ?? "SIDE_PANEL_REQUEST_FAILED");
  return envelope.result;
}

function render(state) {
  currentState = state;
  const enabled = state?.enabled === true;
  const presentation = buildReferenceSurfacePresentation({
    humanPresence: "present",
    agentPresence: enabled ? "active" : "paused",
    effectiveMode: enabled ? "cowork" : "idle"
  });
  $("#human-label").textContent = presentation.humanLabel;
  $("#model-label").textContent = presentation.agentLabel;
  $("#human-seat").classList.toggle("is-active", true);
  $("#human-seat").classList.toggle("is-away", false);
  $("#model-seat").classList.toggle("is-active", enabled);
  $("#model-seat").classList.toggle("is-paused", !enabled);
  $("#mode").textContent = enabled ? presentation.modeLabel : "Off";
  $("#mode").classList.toggle("active", enabled);
  $("#status").textContent = state?.statusText ?? "Page relay unavailable";
  $("#toggle").textContent = enabled ? "Pause" : "Start";
  const offer = state?.pendingOffer;
  $("#offer-card").hidden = !offer;
  $("#offer-action").textContent = offer?.summary ?? "";
  $("#offer-action").dataset.offerId = offer?.offerId ?? "";
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

$("#toggle").addEventListener("click", async (event) => {
  if (!event.isTrusted) return;
  try {
    const response = await send({ type: "cowork:sidepanel:toggle" });
    render(response.state);
  } catch {
    render(null);
  }
});

$("#offer-action").addEventListener("click", async (event) => {
  if (!event.isTrusted || !currentState?.pendingOffer) return;
  const offerId = currentState.pendingOffer.offerId;
  try {
    await send({
      type: "cowork:sidepanel:confirm-offer",
      offerId,
      humanGesture: true
    });
  } finally {
    await refresh();
  }
});

await refresh();
setInterval(refresh, 400);
