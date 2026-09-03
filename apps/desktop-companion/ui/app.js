import { buildWorkModePresentation, STATUS_STEPS } from "./reference-ui.js";

const $ = (selector) => document.querySelector(selector);
// The 0.1 wire carries availability for the human and availability+role for
// the model. Cycling these is cycling the matrix; the Companion offers no
// separate action-rights switch, the click right follows from the status.
const HUMAN_STATES = ["present", "afk-short", "afk-long"];
const MODEL_STATES = ["collaborating", "observing", "paused"];
const IDLE_WORK_MODE = Object.freeze({
  mode: "idle",
  authority: "none",
  authorityLapsed: false,
  doublingAvailable: false,
  human: Object.freeze({ availability: "here", role: "advising", area: null }),
  model: Object.freeze({ availability: "away", role: "advising", area: null })
});
const COCKPIT_BACKGROUND_KEY = "cowork.companion.cockpit-background.v1";
const DEFAULT_COCKPIT_BACKGROUND = "#f8f1e4";
let currentSession = null;
let busy = false;
let controlBusy = false;
// Host-wide, not per session: with no session connected there is no session
// object to read it from, and the button must still say why it cannot switch.
let computerUseInstalled = false;
let executionError = null;

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

// The host stamps lastPageContactAt on every request a joined page makes. A
// session restored from the store after a host restart has never been stamped,
// so it is a session we hold while no page speaks to us.
function formatContact(isoText) {
  const at = new Date(isoText ?? "");
  return Number.isNaN(at.getTime()) ? "unknown time" : at.toLocaleTimeString();
}

function render(state) {
  currentSession = state.sessions[0] ?? null;
  const connected = Boolean(currentSession);
  // The host resolves the matrix; this surface only renders it.
  const presentation = buildWorkModePresentation(
    currentSession?.workMode ?? IDLE_WORK_MODE
  );
  const cockpit = $(".companion-cockpit");

  const pageLinked = connected && Boolean(currentSession.lastPageContactAt);
  $("#connection").textContent = !connected
    ? "Waiting for a page"
    : pageLinked
      ? "Connected to page"
      : "Restored session · page not linked";
  $("#connection").classList.toggle("connected", pageLinked);
  $("#connection").classList.toggle("restored", connected && !pageLinked);
  $("#session-heading").textContent = currentSession?.sessionId ?? "No page connected";
  $("#session-source").textContent = connected
    ? `${currentSession.pageSurfaceId ?? "unknown surface"} · ${currentSession.origin ?? "unknown origin"}`
    : "No page linked";
  $("#mode").textContent = presentation.modeLabel;
  $("#mode").classList.toggle("active", presentation.relayState !== "dormant");
  cockpit.dataset.humanState = presentation.humanState;
  cockpit.dataset.modelState = presentation.modelState;
  cockpit.dataset.relayState = presentation.relayState;
  const executionMode = currentSession?.executionMode ?? "structured";
  const computerUseActive = executionMode === "computer-use";
  cockpit.dataset.executionMode = executionMode;
  if (typeof state.computerUseAvailable === "boolean") {
    computerUseInstalled = state.computerUseAvailable;
  }
  $("#execution-control").setAttribute("aria-pressed", String(computerUseActive));
  $("#execution-control").dataset.unavailable = String(!computerUseInstalled);
  $("#execution-label").textContent = computerUseActive
    ? "Execution: Computer Use (filtered Open Compute, red pointer)"
    : "Execution: structured (WebMCP tools)";
  $("#execution-detail").textContent = executionError
    ?? (computerUseActive
      ? "Click to hand execution back to WebMCP tools."
      : !computerUseInstalled
        ? "Computer Use fallback is off on this host (COWORK_COMPUTER_USE=0). See the Desktop Companion README."
        : !connected
          ? "Connect a page before switching execution."
          : "Click to switch to filtered Open Compute.");
  $("#computer-use-indicator").setAttribute(
    "aria-hidden",
    String(!currentSession?.computerUseIndicatorVisible)
  );
  // A local agent reaches this Companion over MCP, not through the page, so
  // the seat line above cannot show it. Without a linked page its tool calls
  // have nowhere to run, and saying so here beats a timeout the agent alone sees.
  const agent = state.agent ?? { client: null, toolCalls: 0, pageLinked: false };
  const agentCalls = `${agent.toolCalls} tool call${agent.toolCalls === 1 ? "" : "s"}`;
  $("#agent-link").textContent = agent.client === null
    ? "No agent connected over MCP."
    : agent.pageLinked
      ? `Agent via MCP: ${agent.client} · ${agentCalls}`
      : `Agent via MCP: ${agent.client} · No page linked - tool calls will fail with PAGE_UNREACHABLE`;
  $("#agent-link").dataset.agent = agent.client === null
    ? "none"
    : agent.pageLinked ? "linked" : "unreachable";
  $("#human-label").textContent = presentation.humanLabel;
  $("#model-label").textContent = presentation.modelLabel;
  const modelIdentity = currentSession?.modelIdentity ?? "No model connected";
  $("#model-identity").textContent = modelIdentity;
  $("#model-identity").title = currentSession?.modelIdentity
    ? `Current model: ${modelIdentity}`
    : modelIdentity;
  // Pressed means "taking part": here, whichever role.
  $("#human-control").setAttribute(
    "aria-pressed",
    String(presentation.humanState.startsWith("here"))
  );
  $("#model-control").setAttribute(
    "aria-pressed",
    String(presentation.modelState.startsWith("here"))
  );
  $("#relay-core").setAttribute("aria-label", presentation.modeLabel);
  $("#relay-label").textContent = presentation.modeLabel;
  // Connection state and work mode are different questions - the connection
  // chip above answers the first, this line the second.
  $("#relay-detail").textContent = connected
    ? presentation.modeDetail
    : "Waiting for one shared session";
  // A model set to execute without a current grant is the one state worth
  // spelling out: the cockpit says why the click right did not move.
  const workMode = currentSession?.workMode ?? IDLE_WORK_MODE;
  $("#cockpit-status").textContent = connected
    ? currentSession?.computerUseAbortMessage
      ? `Computer Use stopped: ${currentSession.computerUseAbortMessage}`
      : computerUseActive
        ? "The red model pointer marks profile-filtered system control. Click again to stop."
        : workMode.authorityLapsed === true
          ? `${presentation.authorityLabel}. The model needs a current grant with goal, budget and expiry before it can execute.`
          : `${presentation.authorityLabel}. ${presentation.roleDetail}`
    : "Connect a page to awaken the relay.";
  $("#relay-core").title = presentation.areaLabel;

  const pageVisibility = currentSession?.applicationSurfaceVisibility ?? "unknown";
  $("#page-availability").textContent = pageVisibility === "visible"
    ? "Page active"
    : pageVisibility === "hidden"
      ? "Page hidden"
      : "Page unknown";
  $("#page-availability").dataset.visibility = pageVisibility;
  $("#revision").textContent = !connected
    ? "Open FormBuilder Studio and click Desktop Companion in its Cowork panel."
    : pageLinked
      ? `Revision ${currentSession.revision} · ${currentSession.surfaceKind} authority · last contact ${formatContact(currentSession.lastPageContactAt)}`
      : `Revision ${currentSession.revision} · restored from the session store. Reopen the page and click Desktop Companion to link it again.`;

  const turns = currentSession?.context?.recentTurns ?? [];
  $("#context-budget").textContent = `${turns.length} recent turn${turns.length === 1 ? "" : "s"}`;
  const entries = turns.map((turn) => ({
    role: turn.role === "assistant" ? "Model" : "Human",
    className: turn.role,
    text: turn.text
  }));
  // A turn the model failed leaves no assistant turn behind, so the list used
  // to end on the human's line as if nothing had been asked. Say what failed.
  const lastConversation = currentSession?.lastConversation ?? null;
  if (
    lastConversation !== null &&
    !["responded", "pending"].includes(lastConversation.status)
  ) {
    entries.push({
      role: `Failed · ${lastConversation.status}`,
      className: "failed",
      text: lastConversation.assistant || "The model turn did not produce a reply."
    });
  }
  $("#turns").replaceChildren(...entries.map((entry) => {
    const item = document.createElement("li");
    item.className = entry.className;
    const role = document.createElement("strong");
    role.textContent = entry.role;
    const text = document.createElement("span");
    text.textContent = entry.text;
    item.append(role, text);
    return item;
  }));

  // Derived from the matrix, not from a rights setting: a model that is here
  // can be addressed, whether it acts or advises.
  const modelInputEnabled = Boolean(
    currentSession?.modelAvailable && presentation.modelState.startsWith("here")
  );
  $("#human-control").disabled = !connected || controlBusy;
  $("#model-control").disabled = !currentSession?.modelAvailable || controlBusy;
  $("#execution-control").disabled = !connected || !computerUseInstalled || controlBusy;
  // A disabled control swallows a click without a trace, which reads to a
  // screen reader and to any automated driver as "nothing happened". Say we
  // are busy instead of only going quiet.
  for (const id of ["#human-control", "#model-control", "#execution-control"]) {
    $(id).setAttribute("aria-busy", String(controlBusy));
  }
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

// Every visible status word comes from packages/reference-ui.
$("#status-steps").replaceChildren(
  ...STATUS_STEPS.map((step) => {
    const item = document.createElement("span");
    const dot = document.createElement("i");
    dot.setAttribute("aria-hidden", "true");
    item.append(dot, step.label);
    item.title = step.question;
    return item;
  })
);

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

async function toggleComputerUse(event) {
  if (!event.isTrusted || !computerUseInstalled || !currentSession) return;
  executionError = null;
  const wanted = currentSession.executionMode !== "computer-use";
  await postControl("computer-use", { enabled: wanted, humanGesture: true });
  if (currentSession?.executionMode !== (wanted ? "computer-use" : "structured")) {
    executionError = `Execution did not switch: ${$("#status").textContent}`;
    render({ sessions: currentSession === null ? [] : [currentSession] });
  }
}

$("#human-control").addEventListener("click", cycleHumanPresence);
$("#model-control").addEventListener("click", cycleModelEngagement);
$("#execution-control").addEventListener("click", toggleComputerUse);

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
    if (!response.ok) {
      throw new Error(
        [result.code ?? "MODEL_TURN_FAILED", result.message].filter(Boolean).join(" - ")
      );
    }
    $("#conversation-input").value = "";
    const delivery = result.delivery ?? { offered: 0, rejected: 0, reason: null };
    const placed = delivery.offered > 0
      ? ` ${delivery.offered} suggestion${delivery.offered === 1 ? "" : "s"} are waiting on the page for your click.`
      : delivery.rejected > 0
        ? ` ${delivery.rejected} suggestion${delivery.rejected === 1 ? "" : "s"} could not reach the page (${delivery.reason}).`
        : "";
    $("#status").textContent = `${result.reply.message ?? "Reply received."}${placed}`;
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
