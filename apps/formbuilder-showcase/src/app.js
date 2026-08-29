import {
  authorizeActionOffer,
  CoworkProtocolError,
  createActionOffer,
  createPresenceEvent,
  createActionReceipt,
  routeContextSignal
} from "../../../packages/core/src/index.js";
import {
  buildFormBuilderFocus,
  planAuthorizedFormBuilderMutation,
  planSoloFormBuilderMutation
} from "../../../packages/formbuilder-connector/src/index.js";
import { registerNativeCoworkTools } from "../../../packages/native-webmcp/src/index.js";
import {
  createShowcaseSubmission,
  SHOWCASE_SCHEMA
} from "./formbuilder-use-case.js";
import { createShowcaseSession, transitionShowcaseSession } from "./session.js";
import { buildPanelViewModel } from "./view-model.js";

const $ = (selector) => document.querySelector(selector);
const fields = [...document.querySelectorAll(".form-field[data-field-id]")];
const schemaFields = new Map(
  SHOWCASE_SCHEMA.form.elements.map((field) => [field.id, field])
);

for (const field of fields) {
  if (!schemaFields.has(field.dataset.fieldId)) {
    throw new Error(`FormBuilder schema is missing field ${field.dataset.fieldId}`);
  }
}

let session = createShowcaseSession();
let focusPacket = null;
let focusedField = null;
let offers = [];
let receipts = [];
let pageVersion = 1;
let capabilityLevel = "unavailable";
let registrationController = null;
let offerCounter = 0;
let recognition = null;
let leaseCallsUsed = 0;
let responseDownloadUrl = null;

function setStatus(message) {
  $("#system-status").textContent = message;
}

function speak(message) {
  if (!$("#speak-output").checked || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(message);
  utterance.lang = "en-US";
  utterance.rate = 1.02;
  window.speechSynthesis.speak(utterance);
}

function currentControl(field = focusedField) {
  return field?.querySelector("input, textarea, select") ?? null;
}

function selectedTextFor(control) {
  if (!control) return "";
  if (
    typeof control.selectionStart === "number" &&
    typeof control.selectionEnd === "number" &&
    control.selectionEnd > control.selectionStart
  ) {
    return control.value.slice(control.selectionStart, control.selectionEnd);
  }
  return session.attentionMode === "selection" ? control.value : "";
}

function focusKind() {
  if (session.attentionMode === "pinned") return "pinned";
  if (session.attentionMode === "selection") return "selection";
  return "pointer";
}

function buildFocus(field) {
  if (!field || session.attentionMode === "off") return null;
  const control = currentControl(field);
  return buildFormBuilderFocus({
    sessionId: "formbuilder-showcase",
    pageVersion,
    fieldId: field.dataset.fieldId,
    label: field.dataset.label,
    controlKind: field.dataset.controlKind,
    selectedText: selectedTextFor(control),
    focusKind: focusKind()
  });
}

function setFocus(field) {
  if (session.attentionMode === "off") return;
  focusedField = field;
  fields.forEach((candidate) => candidate.classList.toggle("is-focused", candidate === field));
  focusPacket = buildFocus(field);
  render();
}

function renderOffers(view) {
  const list = $("#offer-list");
  list.textContent = "";
  if (view.actionChips.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Agent proposals will appear here as clickable offers.";
    list.append(empty);
    return;
  }

  for (const chip of view.actionChips) {
    const offer = offers.find((candidate) => candidate.offerId === chip.offerId);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "offer-chip";
    const copy = document.createElement("span");
    const strong = document.createElement("strong");
    strong.textContent = chip.label;
    const detail = document.createElement("span");
    detail.textContent = `${offer.capabilityId} · ${offer.targetId}`;
    copy.append(strong, detail);
    button.append(copy);
    button.addEventListener("click", (event) => executeOffer(event, offer));
    list.append(button);
  }
}

function renderReceipts() {
  const list = $("#receipt-list");
  list.textContent = "";
  for (const receipt of receipts.slice(-4).reverse()) {
    const item = document.createElement("li");
    item.className = receipt.status === "failed" ? "receipt-failed" : "";
    const status = document.createElement("strong");
    status.textContent = receipt.status === "verified" ? "Verified: " : "Failed: ";
    item.append(status, receipt.verificationSummary);
    list.append(item);
  }
  $("#receipt-count").textContent = String(receipts.length);
}

function render() {
  const view = buildPanelViewModel({ session, focusPacket, offers, capabilityLevel });
  $("#mode-badge").textContent = view.modeLabel;
  $("#human-label").textContent = view.humanLabel;
  $("#agent-label").textContent = view.agentLabel;
  $("#focus-label").textContent = view.focusLabel;
  $("#context-label").textContent = view.contextLabel;
  $("#capability-badge").textContent = view.capabilityLabel;
  $("#page-version").textContent = String(pageVersion);
  $("#toggle-agent").textContent =
    session.agentPresence === "paused" ? "Resume agent" : "Pause agent";

  const dot = $("#human-dot");
  dot.className = `presence-dot tone-${view.humanTone}`;
  renderOffers(view);
  renderReceipts();
}

function newOfferId() {
  offerCounter += 1;
  return `offer-${Date.now()}-${offerCounter}`;
}

function createVisibleOffer({ capabilityId, targetId, value, summary }) {
  if (session.agentPresence === "paused" || session.actionMode === "paused") {
    throw new CoworkProtocolError("SESSION_PAUSED", "Agent actions are paused");
  }
  if (!focusPacket || targetId !== focusPacket.targetId) {
    throw new CoworkProtocolError("STALE_FOCUS", "Offer target is not the current focus");
  }
  if (!focusPacket.capabilityIds.includes(capabilityId)) {
    throw new CoworkProtocolError(
      "CAPABILITY_UNAVAILABLE",
      "Capability is not available for the focused field"
    );
  }
  if (offers.length >= 3) {
    throw new CoworkProtocolError(
      "CONTEXT_BUDGET_EXCEEDED",
      "Resolve an existing offer before adding another"
    );
  }

  const offer = createActionOffer({
    offerId: newOfferId(),
    capabilityId,
    targetId,
    pageVersion,
    proposedArguments: { value },
    summary,
    effect: "mutate",
    undoAvailable: true,
    expiresAt: new Date(Date.now() + 60_000).toISOString()
  });
  offers = [...offers, offer];
  setStatus("Agent proposal added. Only a real click on the offer can authorize it.");
  render();
  return offer;
}

function valueForDemo(control) {
  if (control instanceof HTMLSelectElement) {
    return control.options[1]?.value ?? "";
  }
  if (control?.type === "email") return "lukas@example.com";
  if (control?.tagName === "TEXTAREA") return "Step-free access, please.";
  return "Lukas";
}

function addDemoOffer() {
  if (!focusPacket) {
    setStatus("Choose a field before creating an offer.");
    return;
  }
  const control = currentControl();
  const value = valueForDemo(control);
  try {
    createVisibleOffer({
      capabilityId: "form.set_value",
      targetId: focusPacket.targetId,
      value,
      summary: `Set ${focusPacket.focus.label} to ${value}`
    });
  } catch (error) {
    setStatus(`${error.code ?? "ERROR"}: ${error.message}`);
  }
}

function executeOffer(event, offer) {
  if (!event.isTrusted) {
    setStatus("HUMAN_CONFIRMATION_REQUIRED: synthetic clicks are rejected.");
    return;
  }

  try {
    const control = document.getElementById(offer.targetId.replace("form-field:", ""));
    if (!control) {
      throw new CoworkProtocolError("STALE_FOCUS", "The offered field no longer exists");
    }
    const authorization = authorizeActionOffer({
      offer,
      event: {
        origin: "human-click",
        offerId: offer.offerId,
        targetId: offer.targetId,
        pageVersion,
        arguments: offer.proposedArguments
      },
      now: new Date().toISOString()
    });
    const plan = planAuthorizedFormBuilderMutation({
      offer,
      authorization,
      currentValue: control.value
    });

    control.value = plan.nextValue;
    control.dispatchEvent(new Event("input", { bubbles: true }));
    const verified = control.value === plan.verificationExpected;
    const receipt = createActionReceipt({
      offerId: offer.offerId,
      verified,
      observedChangeIds: verified ? [`form-page-${pageVersion}`] : [],
      verificationSummary: verified
        ? `${focusedField?.dataset.label ?? "Field"} now equals ${control.value}`
        : "Expected value was not observed",
      undoAvailable: plan.undoAvailable
    });
    receipts = [...receipts, receipt];
    offers = offers.filter((candidate) => candidate.offerId !== offer.offerId);
    setStatus(
      verified
        ? "Action verified after the human click."
        : "VERIFICATION_FAILED: the action is not reported as successful."
    );
    speak(verified ? "Done and verified." : "The change could not be verified.");
    render();
  } catch (error) {
    setStatus(`${error.code ?? "ERROR"}: ${error.message}`);
  }
}

function startAway(duration) {
  if (!focusPacket) {
    setStatus("Focus a field before granting a solo lease.");
    return;
  }
  const goal = $("#lease-goal").value.trim();
  if (!goal) {
    setStatus("A solo lease needs a concrete task.");
    return;
  }
  const lease = {
    leaseId: `lease-${Date.now()}`,
    goal,
    allowedCapabilityIds: focusPacket.capabilityIds.filter((id) => id !== "form.explain_field"),
    allowedTargetIds: [focusPacket.targetId],
    maxCalls: 2,
    maxContextLevel: 2,
    pageVersion,
    expiresAt: new Date(Date.now() + 120_000).toISOString()
  };
  leaseCallsUsed = 0;
  session = transitionShowcaseSession(session, {
    type: "HUMAN_AWAY",
    duration,
    lease
  });
  setStatus("Agent Solo is active only inside the displayed two-minute field lease.");
  render();
}

function executeSoloAction({ capabilityId, targetId, value }) {
  if (!session.lease) {
    throw new CoworkProtocolError("LEASE_EXPIRED", "No solo lease is active");
  }
  const control = document.getElementById(targetId.replace("form-field:", ""));
  if (!control) {
    throw new CoworkProtocolError("STALE_FOCUS", "The leased field no longer exists");
  }

  const plan = planSoloFormBuilderMutation({
    lease: session.lease,
    now: new Date().toISOString(),
    humanPresence: session.humanPresence,
    agentPresence: session.agentPresence,
    capabilityId,
    targetId,
    pageVersion,
    callsUsed: leaseCallsUsed,
    proposedArguments: { value },
    currentValue: control.value
  });
  control.value = plan.nextValue;
  control.dispatchEvent(new Event("input", { bubbles: true }));
  const verified = control.value === plan.verificationExpected;
  const receipt = createActionReceipt({
    offerId: `lease:${session.lease.leaseId}:call-${leaseCallsUsed + 1}`,
    verified,
    observedChangeIds: verified ? [`form-page-${pageVersion}`] : [],
    verificationSummary: verified
      ? `${focusedField?.dataset.label ?? "Leased field"} updated during Agent Solo`
      : "Solo action could not be verified",
    undoAvailable: plan.undoAvailable
  });
  if (verified) leaseCallsUsed += 1;
  receipts = [...receipts, receipt];
  setStatus(
    verified
      ? "Agent Solo action verified. The page-version change now ends this lease."
      : "VERIFICATION_FAILED: Agent Solo stopped."
  );
  render();
  return receipt;
}

function returnHuman() {
  session = transitionShowcaseSession(session, {
    type: "HUMAN_RETURNED",
    receipts,
    pendingQuestion: offers.length ? "Review the remaining action offer?" : null
  });
  const summary = session.returnSummary;
  const message = `${summary.verified} verified, ${summary.failed} failed.`;
  setStatus(`Welcome back. ${message}`);
  speak(`Welcome back. ${message}`);
  render();
}

function toggleAgent() {
  session = transitionShowcaseSession(session, {
    type: session.agentPresence === "paused" ? "AGENT_RESUMED" : "AGENT_PAUSED"
  });
  setStatus(session.agentPresence === "paused" ? "Agent paused. Human Solo is active." : "Agent resumed.");
  render();
}

function collectFormValues() {
  return Object.fromEntries(
    fields.map((field) => [field.dataset.fieldId, currentControl(field)?.value ?? ""])
  );
}

function submitFormBuilderResponse() {
  fields.forEach((field) => field.classList.remove("has-error"));
  const result = createShowcaseSubmission(collectFormValues());
  if (!result.ok) {
    for (const missing of result.missing) {
      document
        .querySelector(`.form-field[data-field-id="${CSS.escape(missing.id)}"]`)
        ?.classList.add("has-error");
    }
    setStatus(`FormBuilder validation stopped export: ${result.missing.length} required field(s) missing.`);
    speak("Please complete the required fields before export.");
    return;
  }

  const serialized = JSON.stringify(result.response, null, 2);
  $("#response-json").textContent = serialized;
  $("#form-result").hidden = false;

  if (responseDownloadUrl) URL.revokeObjectURL(responseDownloadUrl);
  responseDownloadUrl = URL.createObjectURL(
    new Blob([serialized], { type: "application/json" })
  );
  const link = $("#download-response");
  link.href = responseDownloadUrl;
  link.download = "event-registration-response.json";
  setStatus("Human-owned FormBuilder submission validated and prepared for JSON download.");
  speak("The form is valid and ready to download.");
}

function configureSpeech() {
  const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  const talkButton = $("#talk");
  if (!Recognition) {
    talkButton.disabled = true;
    $("#transcript").textContent = "Speech recognition is unavailable here. Text controls remain usable.";
    return;
  }

  recognition = new Recognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.continuous = false;
  recognition.onstart = () => {
    talkButton.classList.add("is-listening");
    talkButton.textContent = "Listening…";
    $("#transcript").textContent = "Listening. Pause naturally; silence will not create a turn.";
  };
  recognition.onresult = (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript?.trim() ?? "";
    $("#transcript").textContent = transcript
      ? `You: ${transcript}`
      : "Silence detected. No model turn created.";
  };
  recognition.onerror = (event) => {
    $("#transcript").textContent =
      event.error === "no-speech"
        ? "Silence detected. No model turn created."
        : `Speech input unavailable: ${event.error}`;
  };
  recognition.onend = () => {
    talkButton.classList.remove("is-listening");
    talkButton.innerHTML = '<span aria-hidden="true">●</span> Push to talk';
  };
  talkButton.addEventListener("click", () => recognition.start());
}

async function configureWebMcp() {
  if (!document.modelContext || typeof document.modelContext.registerTool !== "function") {
    capabilityLevel = "unavailable";
    setStatus("WebMCP is unavailable in this browser. The local click-gated demo still works.");
    render();
    return;
  }

  try {
    registrationController = await registerNativeCoworkTools({
      modelContext: document.modelContext,
      readFocus: () => {
        if (!focusPacket) {
          throw new CoworkProtocolError("STALE_FOCUS", "No FormBuilder field is focused");
        }
        return focusPacket;
      },
      offerAction: createVisibleOffer,
      readPresence: () =>
        createPresenceEvent({
          humanPresence: session.humanPresence,
          agentPresence: session.agentPresence,
          leaseValid:
            session.lease !== null && Date.now() < Date.parse(session.lease.expiresAt),
          reason: session.lease?.goal ?? "Interactive Cowork session",
          changedBy: "human"
        }),
      executeSolo: executeSoloAction
    });
    capabilityLevel = "native";
    setStatus("Native WebMCP tools registered: focus, presence, offers, and lease-scoped solo execution.");
    render();
  } catch (error) {
    capabilityLevel = "unavailable";
    setStatus(`${error.code ?? "WEBMCP_ERROR"}: ${error.message}`);
    render();
  }
}

for (const field of fields) {
  field.addEventListener("pointerenter", () => {
    if (session.attentionMode === "pointer") setFocus(field);
  });
  field.addEventListener("focusin", () => {
    if (session.attentionMode === "selection") setFocus(field);
  });
  field.addEventListener("click", () => {
    if (session.attentionMode === "pinned") setFocus(field);
  });
  const control = currentControl(field);
  control?.addEventListener("select", () => {
    if (session.attentionMode === "selection") setFocus(field);
  });
  control?.addEventListener("input", () => {
    pageVersion += 1;
    if (focusedField === field) focusPacket = buildFocus(field);
    if (session.changeCausality) {
      setStatus(`Change ${pageVersion} observed on ${field.dataset.label}; no automatic model turn was created.`);
    }
    render();
  });
}

$("#attention-mode").addEventListener("change", (event) => {
  session = { ...session, attentionMode: event.target.value };
  if (session.attentionMode === "off") {
    focusPacket = null;
    focusedField = null;
    fields.forEach((field) => field.classList.remove("is-focused"));
    setStatus("Attention is off. No page context is sent.");
  } else if (focusedField) {
    focusPacket = buildFocus(focusedField);
  }
  render();
});

$("#change-causality").addEventListener("change", (event) => {
  session = { ...session, changeCausality: event.target.checked };
  setStatus(event.target.checked ? "Change and causality lens enabled." : "Change and causality lens disabled.");
});

$("#action-mode").addEventListener("change", (event) => {
  session = { ...session, actionMode: event.target.value };
  setStatus(`Action mode changed to ${event.target.selectedOptions[0].text}.`);
});

$("#expand-context").addEventListener("click", () => {
  try {
    const routed = routeContextSignal({
      signal: "focus",
      changed: focusPacket !== null,
      currentLevel: 2,
      requestedLevel: 3,
      reason: "Human allowed one related context step"
    });
    setStatus(
      routed
        ? "One related context level is allowed for the next turn only."
        : "Nothing changed, so no context packet was created."
    );
  } catch (error) {
    setStatus(`${error.code}: ${error.message}`);
  }
});

$("#demo-offer").addEventListener("click", addDemoOffer);
$("#away-short").addEventListener("click", () => startAway("short"));
$("#away-long").addEventListener("click", () => startAway("long"));
$("#return-human").addEventListener("click", returnHuman);
$("#toggle-agent").addEventListener("click", toggleAgent);
$("#stop-speech").addEventListener("click", () => {
  recognition?.stop();
  window.speechSynthesis?.cancel();
});
$("#demo-form").addEventListener("submit", (event) => {
  event.preventDefault();
  submitFormBuilderResponse();
});

window.addEventListener("beforeunload", () => {
  registrationController?.abort();
  if (responseDownloadUrl) URL.revokeObjectURL(responseDownloadUrl);
});

configureSpeech();
render();
configureWebMcp();
