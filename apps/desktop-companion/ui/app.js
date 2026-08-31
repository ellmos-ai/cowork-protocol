import { buildCollaborationPresentation } from "./reference-ui.js";

const $ = (selector) => document.querySelector(selector);
const HUMAN_STATES = ["present", "afk-short", "afk-long"];
const MODEL_STATES = ["collaborating", "observing", "paused"];
const COCKPIT_BACKGROUND_KEY = "cowork.companion.cockpit-background.v1";
const DEFAULT_COCKPIT_BACKGROUND = "#f8f1e4";
let currentSession = null;
let busy = false;
let controlBusy = false;

function speech(text) {
  if (!$("#speak").checked || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

function nextValue(values, current) {
  const index = values.indexOf(current);
  return values[(index + 1) % values.length];
}

function validColor(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function readSavedBackground() {
  try {
    const value = localStorage.getItem(COCKPIT_BACKGROUND_KEY);
    return validColor(value) ? value.toLowerCase() : DEFAULT_COCKPIT_BACKGROUND;
  } catch {
    return DEFAULT_COCKPIT_BACKGROUND;
  }
}

function applyCockpitBackground(color, { persist = true } = {}) {
  const normalized = validColor(color) ? color.toLowerCase() : DEFAULT_COCKPIT_BACKGROUND;
  document.documentElement.style.setProperty("--cockpit-background", normalized);
  $("#custom-cockpit-color").value = normalized;
  document.querySelectorAll("[data-cockpit-color]").forEach((choice) => {
    choice.setAttribute(
      "aria-pressed",
      String(choice.dataset.cockpitColor.toLowerCase() === normalized)
    );
  });
  if (persist) {
    try {
      localStorage.setItem(COCKPIT_BACKGROUND_KEY, normalized);
    } catch {
      // The color still applies for this window when storage is unavailable.
    }
  }
}

function setAppearancePanel(open) {
  $("#appearance-panel").hidden = !open;
  $("#appearance-toggle").setAttribute("aria-expanded", String(open));
}

function relayDetail(presentation, connected) {
  if (!connected) return "Waiting for one shared session";
  if (presentation.relayState === "live") return "Both seats active";
  if (presentation.relayState === "watching") return "Model listens; actions withheld";
  if (presentation.relayState === "to-model") return "Delegated lease carries the work";
  if (presentation.humanState !== "present") return "No solo lease; model waits";
  return "Model is paused";
}

function render(state) {
  currentSession = state.sessions[0] ?? null;
  const connected = Boolean(currentSession);
  const humanPresence = currentSession?.humanPresence ?? "present";
  const agentEngagement = currentSession?.agentEngagement ?? "paused";
  const presentation = buildCollaborationPresentation({
    humanPresence,
    agentEngagement,
    effectiveMode: currentSession?.effectiveMode ?? "human-solo"
  });
  const cockpit = $(".companion-cockpit");

  $("#connection").textContent = connected ? "Connected" : "Waiting";
  $("#connection").classList.toggle("connected", connected);
  $("#session-heading").textContent = currentSession?.sessionId ?? "No page connected";
  $("#mode").textContent = presentation.modeLabel;
  $("#mode").classList.toggle("active", presentation.relayState !== "dormant");
  cockpit.dataset.humanState = presentation.humanState;
  cockpit.dataset.modelState = presentation.modelState;
  cockpit.dataset.relayState = presentation.relayState;
  $("#human-label").textContent = presentation.humanLabel;
  $("#model-label").textContent = presentation.modelLabel;
  const modelIdentity = currentSession?.modelIdentity ?? "No model connected";
  $("#model-identity").textContent = modelIdentity;
  $("#model-identity").title = currentSession?.modelIdentity
    ? `Current model: ${modelIdentity}`
    : modelIdentity;
  $("#human-control").setAttribute(
    "aria-pressed",
    String(presentation.humanState === "present")
  );
  $("#model-control").setAttribute(
    "aria-pressed",
    String(presentation.modelState === "collaborating")
  );
  $("#relay-core").setAttribute("aria-label", presentation.modeLabel);
  $("#relay-label").textContent = presentation.modeLabel;
  $("#relay-detail").textContent = relayDetail(presentation, connected);
  $("#cockpit-status").textContent = connected
    ? presentation.relayState === "live"
      ? "Cowork is live. Click either figure to change who participates."
      : presentation.relayState === "watching"
        ? "The model can discuss context but will not act."
        : presentation.relayState === "to-model"
          ? "You are away; the model follows the bounded delegated lease."
          : humanPresence === "present"
            ? "You work alone while the model is paused."
            : "Your absence is shared; without a lease the model waits."
    : "Connect a page to awaken the relay.";

  const pageVisibility = currentSession?.applicationSurfaceVisibility ?? "unknown";
  $("#page-availability").textContent = pageVisibility === "visible"
    ? "Page active"
    : pageVisibility === "hidden"
      ? "Page hidden"
      : "Page unknown";
  $("#page-availability").dataset.visibility = pageVisibility;
  $("#revision").textContent = connected
    ? `Revision ${currentSession.revision} · ${currentSession.surfaceKind} authority`
    : "The Companion stays ready on loopback.";

  const turns = currentSession?.context?.recentTurns ?? [];
  $("#context-budget").textContent = `${turns.length} recent turn${turns.length === 1 ? "" : "s"}`;
  $("#turns").replaceChildren(...turns.map((turn) => {
    const item = document.createElement("li");
    item.className = turn.role;
    const role = document.createElement("strong");
    role.textContent = turn.role === "assistant" ? "Model" : "Human";
    const text = document.createElement("span");
    text.textContent = turn.text;
    item.append(role, text);
    return item;
  }));

  const modelInputEnabled = Boolean(
    currentSession?.modelAvailable && agentEngagement !== "paused"
  );
  $("#human-control").disabled = !connected || controlBusy;
  $("#model-control").disabled = !currentSession?.modelAvailable || controlBusy;
  $("#conversation-input").disabled = !modelInputEnabled;
  $("#send").disabled = !modelInputEnabled || busy;
  $("#talk").disabled = !modelInputEnabled;
}

async function refresh() {
  try {
    const response = await fetch("/cowork/v1/ui/state", { cache: "no-store" });
    if (!response.ok) throw new Error("STATE_UNAVAILABLE");
    render(await response.json());
  } catch {
    render({ sessions: [] });
  }
}

async function postControl(kind, body) {
  if (!currentSession || controlBusy) return;
  controlBusy = true;
  render({ sessions: [currentSession] });
  try {
    const response = await fetch(
      `/cowork/v1/ui/sessions/${encodeURIComponent(currentSession.linkSessionId)}/${kind}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      }
    );
    const result = await response.json();
    if (!response.ok) throw new Error(result.code ?? "CONTROL_UPDATE_FAILED");
    $("#status").textContent = "Collaboration state shared.";
  } catch (error) {
    $("#status").textContent = error.message;
  } finally {
    controlBusy = false;
    await refresh();
  }
}

function cycleHumanPresence() {
  if (!currentSession) return;
  return postControl("presence", {
    humanPresence: nextValue(HUMAN_STATES, currentSession.humanPresence)
  });
}

function cycleModelEngagement() {
  if (!currentSession?.modelAvailable) return;
  return postControl("engagement", {
    agentEngagement: nextValue(MODEL_STATES, currentSession.agentEngagement)
  });
}

$("#human-control").addEventListener("click", cycleHumanPresence);
$("#model-control").addEventListener("click", cycleModelEngagement);

$("#appearance-toggle").addEventListener("click", () => {
  setAppearancePanel($("#appearance-panel").hidden);
});

document.querySelectorAll("[data-cockpit-color]").forEach((choice) => {
  choice.addEventListener("click", () => applyCockpitBackground(choice.dataset.cockpitColor));
});

$("#custom-cockpit-color").addEventListener("input", (event) => {
  applyCockpitBackground(event.target.value);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("#appearance-panel").hidden) {
    setAppearancePanel(false);
    $("#appearance-toggle").focus();
  }
});

$("#conversation-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const transcript = $("#conversation-input").value.trim();
  if (!currentSession || busy || transcript === "") return;
  busy = true;
  render({ sessions: [currentSession] });
  $("#status").textContent = "Model working from the shared bounded context…";
  try {
    const response = await fetch(
      `/cowork/v1/ui/sessions/${encodeURIComponent(currentSession.linkSessionId)}/turns`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          turnId: `companion-human-${crypto.randomUUID()}`,
          input: { transcript }
        })
      }
    );
    const result = await response.json();
    if (!response.ok) throw new Error(result.code ?? "MODEL_TURN_FAILED");
    $("#conversation-input").value = "";
    $("#status").textContent = result.reply.message ?? "Reply received.";
    speech(result.reply.message ?? "");
  } catch (error) {
    $("#status").textContent = error.message;
  } finally {
    busy = false;
    await refresh();
  }
});

$("#talk").addEventListener("click", () => {
  const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (!Recognition) {
    $("#status").textContent = "Speech recognition is unavailable in this browser.";
    return;
  }
  const recognition = new Recognition();
  recognition.interimResults = false;
  recognition.onresult = (event) => {
    $("#conversation-input").value = event.results[0][0].transcript;
    $("#status").textContent = "Transcript ready. Send when you choose.";
  };
  recognition.onerror = () => {
    $("#status").textContent = "No speech turn created.";
  };
  recognition.start();
  $("#status").textContent = "Listening… pause naturally.";
});

$("#stop-speech").addEventListener("click", () => window.speechSynthesis?.cancel());

applyCockpitBackground(readSavedBackground(), { persist: false });
await refresh();
setInterval(refresh, 1000);
