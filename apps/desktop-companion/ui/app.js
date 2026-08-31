const $ = (selector) => document.querySelector(selector);
let currentSession = null;
let busy = false;

function speech(text) {
  if (!$("#speak").checked || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

function render(state) {
  currentSession = state.sessions[0] ?? null;
  const connected = Boolean(currentSession);
  $("#connection").textContent = connected ? "Connected" : "Waiting";
  $("#connection").classList.toggle("connected", connected);
  $("#session-heading").textContent = currentSession?.sessionId ?? "No page connected";
  $("#mode").textContent = currentSession?.effectiveMode ?? "Idle";
  $("#mode").classList.toggle("active", connected);
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
  const human = currentSession?.humanPresence ?? "present";
  $("#human-label").textContent = human === "present"
    ? "Human present"
    : human === "afk-short"
      ? "Human briefly away"
      : "Human away longer";
  $("#model-label").textContent = currentSession?.agentPresence === "paused"
    ? "Agent paused"
    : "Agent active";
  $("#human-seat").classList.toggle("is-active", human === "present");
  $("#human-seat").classList.toggle("is-away", human !== "present");
  $("#model-seat").classList.toggle(
    "is-active",
    currentSession?.agentPresence !== "paused"
  );
  $("#model-seat").classList.toggle(
    "is-paused",
    currentSession?.agentPresence === "paused"
  );
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
  $("#conversation-input").disabled = !currentSession?.modelAvailable;
  $("#send").disabled = !currentSession?.modelAvailable || busy;
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
for (const button of document.querySelectorAll("[data-presence]")) {
  button.addEventListener("click", async () => {
    if (!currentSession) return;
    const response = await fetch(
      `/cowork/v1/ui/sessions/${encodeURIComponent(currentSession.linkSessionId)}/presence`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ humanPresence: button.dataset.presence })
      }
    );
    $("#status").textContent = response.ok ? "Presence shared." : "Presence update failed.";
    await refresh();
  });
}

await refresh();
setInterval(refresh, 1000);
