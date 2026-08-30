import {
  authorizeActionOffer,
  CoworkProtocolError,
  createActionOffer,
  createFeedbackEvent,
  createPresenceEvent,
  createActionReceipt
} from "../../../packages/core/src/index.js";
import {
  buildFormBuilderContextExpansion,
  buildFormBuilderFocus,
  planAuthorizedFormBuilderMutation,
  planSoloFormBuilderMutation
} from "../../../packages/formbuilder-connector/src/index.js";
import { registerNativeCoworkTools } from "../../../packages/native-webmcp/src/index.js";
import {
  createShowcaseSubmission,
  SHOWCASE_SCHEMA
} from "./formbuilder-use-case.js";
import {
  actionModeAllows,
  buildLeaseExpiryEffect,
  createShowcaseSession,
  nextLeaseExpiryDelay,
  transitionShowcaseSession
} from "./session.js";
import {
  createChangeSnapshot,
  createFeedbackSnapshot,
  observeControlChange
} from "./interaction-log.js";
import {
  buildPanelViewModel,
  buildReceiptViewModels,
  currentActionOffers,
  nextActionOfferExpiry,
  prepareVisibleActionOffer
} from "./view-model.js";

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
let feedbackEvents = [];
let changeEvents = [];
let pageVersion = 1;
let capabilityLevel = "unavailable";
let registrationController = null;
let offerCounter = 0;
let changeCounter = 0;
let recognition = null;
let leaseCallsUsed = 0;
let responseDownloadUrl = null;
let pendingChangeCause = null;
let leaseExpiryTimer = null;
let offerExpiryTimer = null;

function setStatus(message) {
  $("#system-status").textContent = message;
}

function scheduleLeaseExpiry(nowMilliseconds) {
  clearTimeout(leaseExpiryTimer);
  const delay = nextLeaseExpiryDelay(session.lease, nowMilliseconds);
  if (delay === null) {
    leaseExpiryTimer = null;
    return;
  }
  leaseExpiryTimer = setTimeout(() => {
    leaseExpiryTimer = null;
    render();
  }, delay);
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

const observedValues = new Map(
  fields.map((field) => [field.dataset.fieldId, currentControl(field)?.value ?? ""])
);

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

function requestRelatedContext({ reason }) {
  if (!focusedField || !focusPacket) {
    throw new CoworkProtocolError(
      "STALE_FOCUS",
      "Point to, select, or pin a FormBuilder field before requesting more context"
    );
  }
  const control = currentControl(focusedField);
  const options =
    control?.tagName === "SELECT"
      ? [...control.options].map((option) => option.textContent.trim())
      : [];
  return buildFormBuilderContextExpansion({
    focusPacket,
    fieldId: focusedField.dataset.fieldId,
    label: focusedField.dataset.label,
    controlKind: control?.type ?? focusedField.dataset.controlKind,
    required: control?.required === true,
    helpText: focusedField.querySelector(".field-help")?.textContent?.trim() ?? "",
    options,
    reason
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
    detail.textContent = `${chip.capabilityId} · ${chip.targetId} · Value: ${chip.proposedValue}`;
    copy.append(strong, detail);
    button.dataset.offerValue = chip.proposedValue;
    button.append(copy);
    button.addEventListener("click", (event) => executeOffer(event, offer));
    list.append(button);
  }
}

function renderReceipts() {
  const list = $("#receipt-list");
  list.textContent = "";
  const views = buildReceiptViewModels({ receipts, feedbackEvents });
  for (const view of views) {
    const receipt = receipts.find((candidate) => candidate.offerId === view.offerId);
    const item = document.createElement("li");
    item.className = view.status === "failed" ? "receipt-failed" : "";
    const status = document.createElement("strong");
    status.textContent = `${view.statusLabel}: `;
    item.append(status, view.verificationSummary);

    if (view.feedback) {
      const recorded = document.createElement("p");
      recorded.className = "feedback-recorded";
      recorded.textContent = view.feedback.adjustment
        ? `${view.feedback.verdictLabel}: ${view.feedback.adjustment}`
        : view.feedback.verdictLabel;
      item.append(recorded);
    } else {
      const controls = document.createElement("div");
      controls.className = "feedback-controls";
      controls.setAttribute("role", "group");
      controls.setAttribute("aria-label", `Evaluate result ${view.offerId}`);

      const adjustment = document.createElement("input");
      adjustment.maxLength = 350;
      adjustment.placeholder = "Optional direction, e.g. make it lighter";
      adjustment.setAttribute("aria-label", "Optional feedback direction");

      const buttons = document.createElement("div");
      buttons.className = "feedback-buttons";
      for (const [label, verdict] of [
        ["Good", "accepted"],
        ["Adjust", "revise"],
        ["Different", "rejected"]
      ]) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.addEventListener("click", (event) =>
          recordReceiptFeedback(event, receipt, verdict, adjustment.value)
        );
        buttons.append(button);
      }
      controls.append(adjustment, buttons);
      item.append(controls);
    }
    list.append(item);
  }
  $("#receipt-count").textContent = String(receipts.length);
}

function recordReceiptFeedback(event, receipt, verdict, adjustmentInput) {
  if (!event.isTrusted) {
    setStatus("HUMAN_CONFIRMATION_REQUIRED: synthetic feedback clicks are rejected.");
    return;
  }
  if (feedbackEvents.some((feedback) => feedback.relatedOfferId === receipt.offerId)) {
    setStatus("Feedback was already recorded for this result.");
    return;
  }

  const adjustment =
    verdict === "accepted"
      ? ""
      : adjustmentInput.trim() ||
        (verdict === "revise" ? "Please adjust this result." : "Try a different approach.");
  const feedback = createFeedbackEvent({
    origin: "human-click",
    relatedOfferId: receipt.offerId,
    relatedChangeIds: receipt.observedChangeIds,
    verdict,
    adjustment,
    pageVersion: receipt.pageVersion ?? pageVersion,
    createdAt: new Date().toISOString()
  });
  feedbackEvents = [...feedbackEvents, feedback].slice(-20);
  setStatus("Human feedback recorded. The agent can read only the latest bounded event.");
  render();
}

function render() {
  const now = new Date().toISOString();
  const leaseBeforeTick = session.lease;
  session = transitionShowcaseSession(session, {
    type: "CLOCK_TICK",
    now
  });
  const expiryEffect = buildLeaseExpiryEffect(leaseBeforeTick, session.lease);
  if (expiryEffect !== null) {
    clearTimeout(leaseExpiryTimer);
    leaseExpiryTimer = null;
    leaseCallsUsed = expiryEffect.leaseCallsUsed;
    // Lease expiry outranks a same-tick handler message because it changes action rights.
    setStatus(expiryEffect.status);
  }
  scheduleLeaseExpiry(Date.parse(now));
  offers = currentActionOffers({ offers, now, pageVersion });
  clearTimeout(offerExpiryTimer);
  const nextOfferExpiry = nextActionOfferExpiry(offers);
  offerExpiryTimer =
    nextOfferExpiry === null
      ? null
      : setTimeout(
          () => render(),
          Math.max(0, nextOfferExpiry - Date.parse(now) + 10)
        );
  const view = buildPanelViewModel({
    session,
    focusPacket,
    offers,
    capabilityLevel,
    now,
    pageVersion
  });
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

function applyControlValue(control, nextValue, cause) {
  const previousChangeId = changeEvents.at(-1)?.changeId;
  pendingChangeCause = cause;
  try {
    control.value = nextValue;
    control.dispatchEvent(new Event("input", { bubbles: true }));
  } finally {
    pendingChangeCause = null;
  }
  const latest = changeEvents.at(-1);
  return latest?.changeId !== previousChangeId ? latest : null;
}

function createVisibleOffer({ capabilityId, targetId, value, summary }) {
  if (session.agentPresence === "paused" || !actionModeAllows(session.actionMode, "offer")) {
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
  const now = new Date();
  offers = currentActionOffers({
    offers,
    now: now.toISOString(),
    pageVersion
  });
  if (offers.length >= 3) {
    throw new CoworkProtocolError(
      "CONTEXT_BUDGET_EXCEEDED",
      "Resolve an existing offer before adding another"
    );
  }

  const visibleOffer = prepareVisibleActionOffer({
    capabilityId,
    targetId,
    proposedArguments: { value },
    summary
  });
  const offer = createActionOffer({
    offerId: newOfferId(),
    capabilityId: visibleOffer.capabilityId,
    targetId: visibleOffer.targetId,
    pageVersion,
    proposedArguments: { value: visibleOffer.proposedValue },
    summary,
    effect: "mutate",
    undoAvailable: true,
    expiresAt: new Date(now.getTime() + 60_000).toISOString()
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
  if (session.agentPresence === "paused" || !actionModeAllows(session.actionMode, "offer")) {
    setStatus("SESSION_PAUSED: this action mode does not allow offer execution.");
    render();
    return;
  }
  if (!event.isTrusted) {
    setStatus("HUMAN_CONFIRMATION_REQUIRED: synthetic clicks are rejected.");
    return;
  }

  try {
    const control = document.getElementById(offer.targetId.replace("form-field:", ""));
    if (!control) {
      throw new CoworkProtocolError("STALE_FOCUS", "The offered field no longer exists");
    }
    const visibleValue = event.currentTarget?.dataset.offerValue;
    if (typeof visibleValue !== "string") {
      throw new CoworkProtocolError(
        "HUMAN_CONFIRMATION_REQUIRED",
        "The human-visible offer value is unavailable"
      );
    }
    const authorization = authorizeActionOffer({
      offer,
      event: {
        origin: "human-click",
        offerId: offer.offerId,
        targetId: offer.targetId,
        pageVersion,
        arguments: { value: visibleValue }
      },
      now: new Date().toISOString()
    });
    const plan = planAuthorizedFormBuilderMutation({
      offer,
      authorization,
      currentValue: control.value
    });

    const change = applyControlValue(control, plan.nextValue, {
      source: "agent",
      refs: [`offer:${offer.offerId}`, "authorization:human-click"],
      confidence: "high"
    });
    const verified = control.value === plan.verificationExpected;
    const receipt = createActionReceipt({
      offerId: offer.offerId,
      verified,
      observedChangeIds: verified && change ? [change.changeId] : [],
      verificationSummary: verified
        ? `${focusedField?.dataset.label ?? "Field"} now equals ${control.value}`
        : "Expected value was not observed",
      undoAvailable: plan.undoAvailable,
      pageVersion
    });
    session = transitionShowcaseSession(session, { type: "RECEIPT_RECORDED", receipt });
    receipts = session.receipts;
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
  if (session.agentPresence === "paused" || !actionModeAllows(session.actionMode, "solo")) {
    setStatus("SESSION_PAUSED: switch Action rights to Delegated lease before going away.");
    return;
  }
  if (!focusPacket) {
    setStatus("Focus a field before granting a solo lease.");
    return;
  }
  const goal = $("#lease-goal").value.trim();
  if (!goal) {
    setStatus("A solo lease needs a concrete task.");
    return;
  }
  const now = Date.now();
  const lease = {
    leaseId: `lease-${now}`,
    goal,
    allowedCapabilityIds: focusPacket.capabilityIds.filter((id) => id !== "form.explain_field"),
    allowedTargetIds: [focusPacket.targetId],
    maxCalls: 2,
    maxContextLevel: 2,
    pageVersion,
    expiresAt: new Date(now + 120_000).toISOString()
  };
  leaseCallsUsed = 0;
  session = transitionShowcaseSession(session, {
    type: "HUMAN_AWAY",
    duration,
    lease,
    now: new Date(now).toISOString()
  });
  setStatus("Agent Solo is active only inside the displayed two-minute field lease.");
  render();
}

function executeSoloAction({ capabilityId, targetId, value }) {
  if (session.agentPresence === "paused" || !actionModeAllows(session.actionMode, "solo")) {
    throw new CoworkProtocolError(
      "SESSION_PAUSED",
      "Agent Solo requires the Delegated lease action mode"
    );
  }
  if (!session.lease) {
    throw new CoworkProtocolError("LEASE_EXPIRED", "No solo lease is active");
  }
  const control = document.getElementById(targetId.replace("form-field:", ""));
  if (!control) {
    throw new CoworkProtocolError("STALE_FOCUS", "The leased field no longer exists");
  }

  const activeLease = session.lease;
  const leaseId = activeLease.leaseId;
  const plan = planSoloFormBuilderMutation({
    lease: activeLease,
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
  session = transitionShowcaseSession(session, { type: "SOLO_ATTEMPT_STARTED" });
  leaseCallsUsed = session.leaseCallsUsed;
  const callNumber = leaseCallsUsed;
  const change = applyControlValue(control, plan.nextValue, {
    source: "agent",
    refs: [`lease:${leaseId}`],
    confidence: "high"
  });
  const verified = control.value === plan.verificationExpected;
  const receipt = createActionReceipt({
    offerId: `lease:${leaseId}:call-${callNumber}`,
    verified,
    observedChangeIds: verified && change ? [change.changeId] : [],
    verificationSummary: verified
      ? `${focusedField?.dataset.label ?? "Leased field"} updated during Agent Solo`
      : "Solo action could not be verified",
    undoAvailable: plan.undoAvailable,
    pageVersion
  });
  session = transitionShowcaseSession(session, { type: "RECEIPT_RECORDED", receipt });
  receipts = session.receipts;
  setStatus(
    verified
      ? "Agent Solo action verified. The page-version change now ends this lease."
      : "VERIFICATION_FAILED: Agent Solo stopped."
  );
  render();
  return receipt;
}

function returnHuman() {
  clearTimeout(leaseExpiryTimer);
  leaseExpiryTimer = null;
  offers = currentActionOffers({
    offers,
    now: new Date().toISOString(),
    pageVersion
  });
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
      requestContext: requestRelatedContext,
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
      executeSolo: executeSoloAction,
      readChanges: () =>
        createChangeSnapshot(session.changeCausality ? changeEvents : []),
      readFeedback: () => createFeedbackSnapshot(feedbackEvents)
    });
    capabilityLevel = "native";
    setStatus("Native WebMCP tools registered: focus, one-shot related context, causal changes, presence, offers, lease-scoped solo execution, and bounded feedback.");
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
    const previousValue = observedValues.get(field.dataset.fieldId) ?? "";
    const nextValue = control.value;
    if (previousValue === nextValue) return;
    observedValues.set(field.dataset.fieldId, nextValue);
    pageVersion += 1;
    if (focusedField === field) focusPacket = buildFocus(field);
    if (session.changeCausality) {
      changeCounter += 1;
      const change = observeControlChange({
        changeId: `change-${pageVersion}-${changeCounter}`,
        fieldId: field.dataset.fieldId,
        label: field.dataset.label,
        previousValue,
        nextValue,
        pageVersion,
        cause: pendingChangeCause ?? undefined
      });
      if (change) changeEvents = [...changeEvents, change].slice(-20);
      setStatus(`Change ${pageVersion} observed on ${field.dataset.label}; causes were recorded without creating a model turn.`);
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
  if (!session.changeCausality) changeEvents = [];
  setStatus(event.target.checked ? "Change and causality lens enabled." : "Change and causality lens disabled.");
});

$("#action-mode").addEventListener("change", (event) => {
  session = { ...session, actionMode: event.target.value };
  setStatus(`Action mode changed to ${event.target.selectedOptions[0].text}.`);
  render();
});

$("#expand-context").addEventListener("click", () => {
  try {
    const expansion = requestRelatedContext({
      reason: "Need the related FormBuilder field rules"
    });
    setStatus(
      `One related context level returned for this request only: ${expansion.metrics.includedContextCharacters} adapter characters.`
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
  clearTimeout(leaseExpiryTimer);
  clearTimeout(offerExpiryTimer);
  if (responseDownloadUrl) URL.revokeObjectURL(responseDownloadUrl);
});

configureSpeech();
render();
configureWebMcp();
