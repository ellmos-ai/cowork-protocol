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
  createConversationClient,
  createConversationInbox
} from "../../../packages/conversation/src/index.js";
import {
  discoverHttpModelTransport,
  selectModelTransport
} from "../../../packages/model-transport/src/browser.js";
import {
  applySessionDeltaBatch,
  createCoworkSessionAuthority,
  createSessionBriefing
} from "../../../packages/session-authority/src/index.js";
import {
  createCompanionHello,
  createHttpCompanionLink
} from "../../../packages/companion-link/src/index.js";
import { createCoworkContextManager } from "../../../packages/context-manager/src/index.js";
import {
  copyIntegrationDeclaration,
  createProtocolHostDeclaration
} from "../../../packages/integration-contract/src/index.js";
import { REFERENCE_UI_PROVIDER_ID } from "../../../packages/reference-ui/src/index.js";
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
import { createRecognitionSession } from "./speech-controller.js";
import { replyToShowcaseTurn } from "./local-conversation.js";

const SESSION_ID = "formbuilder-showcase";
const EMBEDDED_SURFACE_ID = "formbuilder:embedded";
const DETACHED_SURFACE_ID = "formbuilder:document-pip";
const integrationDeclaration = createProtocolHostDeclaration({
  hostId: "formbuilder-showcase",
  transports: ["webmcp"],
  integrationMode: "protocol-and-ui",
  pageUiProviderId: REFERENCE_UI_PROVIDER_ID
});
const coworkPanel = document.querySelector(".cowork-panel");
const panelHomeMarker = document.createComment("cowork-panel-home");
coworkPanel.before(panelHomeMarker);

const $ = (selector) =>
  document.querySelector(selector) ?? coworkPanel.querySelector(selector);
const fields = [...document.querySelectorAll(".form-field[data-field-id]")];
const schemaFields = new Map(
  SHOWCASE_SCHEMA.form.elements.map((field) => [field.id, field])
);

for (const field of fields) {
  if (!schemaFields.has(field.dataset.fieldId)) {
    throw new Error(`FormBuilder schema is missing field ${field.dataset.fieldId}`);
  }
}

let session = {
  ...createShowcaseSession(),
  modelSeat: {
    owner: "cowork",
    contextAuthority: "cowork-session"
  },
  lastConversation: null
};
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
let recognitionSession = null;
let leaseCallsUsed = 0;
let responseDownloadUrl = null;
let pendingChangeCause = null;
let leaseExpiryTimer = null;
let offerExpiryTimer = null;
let conversationBusy = false;
let detachedSurfaceWindow = null;
let companionReplicaSnapshot = null;
let companionConnection = null;
let companionSurfaceQueue = Promise.resolve();
let contextTurnCounter = 0;

const contextManager = createCoworkContextManager({ sessionId: SESSION_ID });

function nextContextTurnId(role) {
  contextTurnCounter += 1;
  return `${role}-turn-${contextTurnCounter}`;
}

function readCurrentSessionSnapshot() {
  return companionReplicaSnapshot ?? sessionAuthority.readSnapshot();
}

async function pullAllCompanionDeltas() {
  if (!companionConnection || companionReplicaSnapshot === null) {
    return readCurrentSessionSnapshot();
  }
  let hasMore = true;
  while (hasMore) {
    const batch = await companionConnection.link.pullDeltas({
      linkSessionId: companionConnection.linkSessionId,
      afterRevision: companionReplicaSnapshot.revision
    });
    companionReplicaSnapshot = applySessionDeltaBatch({
      snapshot: companionReplicaSnapshot,
      batch
    });
    hasMore = batch.hasMore;
  }
  session = companionReplicaSnapshot.state;
  render();
  return readCurrentSessionSnapshot();
}

function reportCompanionSurfaceVisibility(visibility) {
  companionSurfaceQueue = companionSurfaceQueue
    .catch(() => undefined)
    .then(async () => {
      if (!companionConnection || companionReplicaSnapshot === null) {
        return readCurrentSessionSnapshot();
      }
      await companionConnection.link.reportSurface({
        linkSessionId: companionConnection.linkSessionId,
        surfaceId: EMBEDDED_SURFACE_ID,
        visibility,
        observedRevision: companionReplicaSnapshot.revision
      });
      return pullAllCompanionDeltas();
    });
  return companionSurfaceQueue;
}

function authorityState(nextSession = session) {
  const sessionReceipts = nextSession.receipts ?? receipts;
  return {
    ...nextSession,
    focus: focusPacket,
    pageVersion,
    capabilityLevel,
    pendingOfferIds: offers.slice(-3).map((offer) => offer.offerId),
    latestChangeId: changeEvents.at(-1)?.changeId ?? null,
    latestFeedbackOfferId: feedbackEvents.at(-1)?.relatedOfferId ?? null,
    receiptSummary: {
      total: sessionReceipts.length,
      verified: sessionReceipts.filter((receipt) => receipt.status === "verified").length,
      failed: sessionReceipts.filter((receipt) => receipt.status === "failed").length
    }
  };
}

const sessionAuthority = createCoworkSessionAuthority({
  sessionId: SESSION_ID,
  initialState: authorityState(session),
  primarySurface: {
    surfaceId: EMBEDDED_SURFACE_ID,
    kind: "embedded",
    reason: "FormBuilder opened"
  }
});
session = sessionAuthority.readState();

function commitSession(kind, nextSession = session, options = {}) {
  if (companionReplicaSnapshot !== null) {
    return {
      committed: false,
      revision: companionReplicaSnapshot.revision,
      state: structuredClone(session),
      reason: "companion-is-session-authority"
    };
  }
  const result = sessionAuthority.commit({
    kind,
    nextState: authorityState(nextSession),
    sourceSurfaceId:
      options.sourceSurfaceId ?? session.surface?.primarySurfaceId ?? EMBEDDED_SURFACE_ID,
    causeRefs: options.causeRefs ?? [],
    payload: options.payload ?? null,
    at: options.at ?? new Date().toISOString(),
    recordUnchanged: options.recordUnchanged ?? false
  });
  session = result.state;
  return result;
}

function claimSurface({ surfaceId, kind, reason }) {
  if (companionReplicaSnapshot !== null) {
    throw new CoworkProtocolError(
      "COMPANION_IS_SESSION_AUTHORITY",
      "Dock or detach the Cowork surface from the active Companion"
    );
  }
  const lease = sessionAuthority.claimSurface({
    surfaceId,
    kind,
    reason,
    expectedRevision: sessionAuthority.readSnapshot().revision,
    sourceSurfaceId: session.surface?.primarySurfaceId ?? EMBEDDED_SURFACE_ID
  });
  session = sessionAuthority.readState();
  return lease;
}

const injectedHostModelTransport = window.coworkModelTransport;
const discoveredHostModelTransport =
  typeof injectedHostModelTransport?.sendTurn === "function"
    ? null
    : await discoverHttpModelTransport();
const hostModelTransport = selectModelTransport({
  injected: injectedHostModelTransport,
  discovered: discoveredHostModelTransport
});
const hasHostModelTransport = typeof hostModelTransport?.sendTurn === "function";
const conversationClient = createConversationClient({
  sendTurn: hasHostModelTransport
    ? hostModelTransport.sendTurn.bind(hostModelTransport)
    : replyToShowcaseTurn
});
const conversationInbox = createConversationInbox();
let conversationTransportLabel = hasHostModelTransport
  ? hostModelTransport.label ?? "Connected model bridge"
  : "Local demo helper";

function setStatus(message) {
  $("#system-status").textContent = message;
}

function currentSessionBriefing() {
  return createSessionBriefing({
    snapshot: readCurrentSessionSnapshot(),
    focus: focusPacket,
    summary:
      session.humanPresence === "present"
        ? "The human and model are working together in FormBuilder."
        : "The human is away; continue only inside the active solo lease.",
    pendingOfferIds: offers.map((offer) => offer.offerId),
    latestChangeIds: changeEvents.map((change) => change.changeId),
    capabilityDigest: `${capabilityLevel}:${pageVersion}`
  });
}

Object.defineProperty(window, "coworkSession", {
  configurable: true,
  value: Object.freeze({
    readSnapshot: () => readCurrentSessionSnapshot(),
    readDeltas: (afterRevision) =>
      companionReplicaSnapshot === null
        ? sessionAuthority.readDeltas({ afterRevision })
        : null,
    readBriefing: () => currentSessionBriefing(),
    readContext: () => contextManager.readContext(),
    syncFromCompanion: () => pullAllCompanionDeltas(),
    subscribe: (listener) => sessionAuthority.subscribe(listener)
  })
});

async function openInCompanion() {
  if (companionConnection) return companionConnection;
  const button = $("#open-companion");
  button.disabled = true;
  button.textContent = "Connecting…";
  const endpoint =
    new URLSearchParams(window.location.search).get("companionEndpoint") ??
    "http://127.0.0.1:47831/cowork/v1";
  try {
    const snapshot = sessionAuthority.readSnapshot();
    const link = createHttpCompanionLink({ endpoint });
    const acknowledgement = await link.join({
      hello: createCompanionHello({
        sessionId: snapshot.sessionId,
        surfaceId: snapshot.state.surface.primarySurfaceId,
        revision: snapshot.revision,
        origin: window.location.origin,
        capabilityDigest: `${capabilityLevel}:${pageVersion}`
      }),
      snapshot,
      context: contextManager.readContext()
    });
    companionReplicaSnapshot = applySessionDeltaBatch({
      snapshot,
      batch: acknowledgement.authorityDeltas
    });
    companionConnection = {
      link,
      linkSessionId: acknowledgement.linkSessionId
    };
    session = companionReplicaSnapshot.state;
    let visibilityWarning = null;
    try {
      await reportCompanionSurfaceVisibility(document.visibilityState);
    } catch (error) {
      visibilityWarning =
        `${error.code ?? "COMPANION_SYNC_ERROR"}: initial page visibility is unknown`;
    }
    coworkPanel.classList.add("is-companion-connected");
    button.textContent = "Connected";
    setStatus(
      visibilityWarning ??
        "Companion connected. This page is now a synchronized protocol replica."
    );
    render();
    return companionConnection;
  } catch (error) {
    button.disabled = false;
    button.textContent = "Open Companion";
    setStatus(`${error.code ?? "COMPANION_UNAVAILABLE"}: ${error.message}`);
    return null;
  }
}
Object.defineProperty(window, "coworkIntegration", {
  configurable: true,
  value: Object.freeze({
    readDeclaration: () => copyIntegrationDeclaration(integrationDeclaration)
  })
});

function copySurfaceStyles(targetDocument) {
  for (const styleSheet of document.styleSheets) {
    if (styleSheet.href) {
      const link = targetDocument.createElement("link");
      link.rel = "stylesheet";
      link.href = styleSheet.href;
      targetDocument.head.append(link);
      continue;
    }
    try {
      const style = targetDocument.createElement("style");
      style.textContent = [...styleSheet.cssRules].map((rule) => rule.cssText).join("\n");
      targetDocument.head.append(style);
    } catch {
      // A cross-origin stylesheet remains unavailable to the detached document.
    }
  }
}

function dockCoworkSurface({ closeDetachedWindow = false } = {}) {
  const windowToClose = detachedSurfaceWindow;
  detachedSurfaceWindow = null;
  if (coworkPanel.ownerDocument !== document && panelHomeMarker.parentNode) {
    panelHomeMarker.parentNode.insertBefore(coworkPanel, panelHomeMarker.nextSibling);
  }
  document.querySelector(".workspace")?.classList.remove("cowork-surface-detached");
  if (session.surface?.kind !== "embedded") {
    claimSurface({
      surfaceId: EMBEDDED_SURFACE_ID,
      kind: "embedded",
      reason: "Cowork surface docked back into FormBuilder"
    });
  }
  if (closeDetachedWindow && windowToClose && !windowToClose.closed) {
    windowToClose.close();
  }
  render();
}

async function detachCoworkSurface() {
  if (detachedSurfaceWindow && !detachedSurfaceWindow.closed) {
    dockCoworkSurface({ closeDetachedWindow: true });
    setStatus("Cowork surface docked back into FormBuilder with the same session.");
    return;
  }
  if (typeof window.documentPictureInPicture?.requestWindow !== "function") {
    setStatus(
      "DETACHED_SURFACE_UNAVAILABLE: this browser does not provide Document Picture-in-Picture."
    );
    return;
  }

  try {
    const detached = await window.documentPictureInPicture.requestWindow({
      width: 460,
      height: 780
    });
    detachedSurfaceWindow = detached;
    detached.document.title = "Cowork Protocol — Shared session";
    detached.document.documentElement.lang = document.documentElement.lang;
    detached.document.body.className = "cowork-detached-body";
    copySurfaceStyles(detached.document);
    document.querySelector(".workspace")?.classList.add("cowork-surface-detached");
    detached.document.body.append(coworkPanel);
    claimSurface({
      surfaceId: DETACHED_SURFACE_ID,
      kind: "document-pip",
      reason: "Human detached the Cowork surface"
    });
    detached.addEventListener(
      "pagehide",
      () => dockCoworkSurface({ closeDetachedWindow: false }),
      { once: true }
    );
    setStatus("Cowork surface detached. It is still the same session and model seat.");
    render();
  } catch (error) {
    detachedSurfaceWindow = null;
    document.querySelector(".workspace")?.classList.remove("cowork-surface-detached");
    setStatus(`DETACHED_SURFACE_ERROR: ${error.message}`);
  }
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
  commitSession("focus-changed", session, {
    payload: {
      targetId: focusPacket.targetId,
      pageVersion: focusPacket.pageVersion,
      focusKind: focusPacket.focus.kind
    }
  });
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
  commitSession("feedback-recorded", session, {
    causeRefs: [`offer:${receipt.offerId}`],
    payload: {
      relatedOfferId: receipt.offerId,
      verdict: feedback.verdict,
      relatedChangeIds: feedback.relatedChangeIds
    }
  });
  setStatus("Human feedback recorded. The agent can read only the latest bounded event.");
  render();
}

function render() {
  const now = new Date().toISOString();
  const leaseBeforeTick = session.lease;
  commitSession(
    "clock-tick",
    transitionShowcaseSession(session, {
      type: "CLOCK_TICK",
      now
    }),
    { at: now }
  );
  const expiryEffect = buildLeaseExpiryEffect(leaseBeforeTick, session.lease);
  if (expiryEffect !== null) {
    clearTimeout(leaseExpiryTimer);
    leaseExpiryTimer = null;
    leaseCallsUsed = expiryEffect.leaseCallsUsed;
    // Lease expiry outranks a same-tick handler message because it changes action rights.
    setStatus(expiryEffect.status);
  }
  scheduleLeaseExpiry(Date.parse(now));
  const offerIdsBeforeExpiry = offers.map((offer) => offer.offerId);
  offers = currentActionOffers({ offers, now, pageVersion });
  if (offers.length !== offerIdsBeforeExpiry.length) {
    commitSession("offers-expired", session, {
      payload: {
        expiredOfferIds: offerIdsBeforeExpiry.filter(
          (offerId) => !offers.some((offer) => offer.offerId === offerId)
        )
      }
    });
  }
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
  $("#model-transport-badge").textContent = conversationTransportLabel;
  $("#page-version").textContent = String(pageVersion);
  $("#session-revision").textContent = String(readCurrentSessionSnapshot().revision);
  const companionConnected = session.surface?.kind === "desktop";
  $("#detach-cowork").textContent =
    session.surface?.kind === "document-pip" ? "Dock in page" : "Detach";
  $("#detach-cowork").disabled = companionConnected;
  $("#detach-cowork").setAttribute(
    "aria-pressed",
    String(session.surface?.kind === "document-pip")
  );
  $("#surface-label").textContent = companionConnected
    ? "Companion"
    : session.surface?.kind === "document-pip"
      ? "Detached"
      : "Embedded";
  $("#open-companion").disabled = companionConnected;
  $("#open-companion").textContent = companionConnected
    ? "Connected"
    : "Open Companion";
  $("#conversation-input").disabled = companionConnected;
  $("#send-conversation").disabled = companionConnected || conversationBusy;
  $("#talk").disabled = companionConnected;
  $("#toggle-agent").textContent =
    session.agentPresence === "paused" ? "Resume agent" : "Pause agent";

  const humanSeat = $("#human-seat");
  humanSeat.classList.toggle("is-active", session.humanPresence === "present");
  humanSeat.classList.toggle("is-away", session.humanPresence !== "present");
  humanSeat.dataset.presenceTone = view.humanTone;
  const modelSeat = $("#model-seat");
  modelSeat.classList.toggle("is-active", session.agentPresence !== "paused");
  modelSeat.classList.toggle("is-paused", session.agentPresence === "paused");
  renderOffers(view);
  renderReceipts();
}

function presentConversationReply({ turn, reply, transportLabel, contextHumanTurnId }) {
  conversationTransportLabel = transportLabel;
  const providerLed = transportLabel === "WebMCP agent reply";
  contextManager.appendTurn({
    turnId: nextContextTurnId("assistant"),
    role: "assistant",
    text: reply.message,
    at: new Date().toISOString(),
    causeRefs: contextHumanTurnId ? [contextHumanTurnId] : []
  });
  commitSession("conversation-reply-presented", {
    ...session,
    modelSeat: providerLed
      ? { owner: "provider", contextAuthority: "provider-chat" }
      : { owner: "cowork", contextAuthority: "cowork-session" },
    lastConversation: {
      human: turn.transcript,
      assistant: reply.message,
      status: "responded"
    }
  }, {
    payload: {
      transport: transportLabel,
      providerLed
    }
  });
  let createdOffers = 0;
  let rejectedOffers = 0;
  for (const offer of reply.offers) {
    try {
      createVisibleOffer({
        capabilityId: offer.capabilityId,
        targetId: offer.targetId,
        value: offer.value,
        summary: offer.summary
      });
      createdOffers += 1;
    } catch {
      rejectedOffers += 1;
    }
  }
  $("#transcript").textContent = `You: ${turn.transcript}\nHelper: ${reply.message}`;
  setStatus(
    createdOffers > 0
      ? `${createdOffers} model suggestion${createdOffers === 1 ? "" : "s"} added as click-gated offer${createdOffers === 1 ? "" : "s"}.`
      : rejectedOffers > 0
        ? "The reply was shown, but its action offer was outside the current focus or action rights."
        : transportLabel === "Connected model bridge"
          ? "Connected model reply received through the bounded conversation bridge."
          : transportLabel === "WebMCP agent reply"
            ? "WebMCP agent reply received for the latest bounded human turn."
            : "Local demo reply created from the bounded conversation turn."
  );
  speak(reply.speak || reply.message);
  render();
  return { visibleOffers: createdOffers, rejectedOffers };
}

async function sendConversationTurn(transcriptInput) {
  if (conversationBusy) return;
  if (companionConnection !== null) {
    setStatus("The Companion owns the shared model seat. Continue in its movable window.");
    return;
  }
  const input = $("#conversation-input");
  const sendButton = $("#send-conversation");
  const transcript = typeof transcriptInput === "string" ? transcriptInput.trim() : "";
  if (transcript === "") {
    $("#transcript").textContent = "Silence detected. No model turn created.";
    return;
  }

  conversationBusy = true;
  sendButton.disabled = true;
  sendButton.setAttribute("aria-busy", "true");
  $("#transcript").textContent = `You: ${transcript}\nHelper: Thinking with bounded context…`;
  commitSession("conversation-turn-submitted", {
    ...session,
    modelSeat: { owner: "cowork", contextAuthority: "cowork-session" },
    lastConversation: {
      human: transcript,
      assistant: "",
      status: "pending"
    }
  }, {
    payload: { transcriptCharacters: transcript.length }
  });
  try {
    const result = await conversationClient.submit({
      transcript,
      focusPacket,
      presence: {
        humanPresence: session.humanPresence,
        agentPresence: session.agentPresence,
        mode: session.effectiveMode
      }
    });
    if (!result.sent) {
      $("#transcript").textContent =
        result.status === "agent-paused"
          ? "Agent paused. This turn stayed on the page and was not sent."
          : "Silence detected. No model turn created.";
      return;
    }

    if (!hasHostModelTransport) {
      conversationInbox.publish(result.turn);
    }
    const contextHumanTurnId = nextContextTurnId("human");
    contextManager.appendTurn({
      turnId: contextHumanTurnId,
      role: "human",
      text: result.turn.transcript,
      at: new Date().toISOString()
    });
    input.value = "";
    presentConversationReply({
      turn: result.turn,
      reply: result.reply,
      transportLabel: hasHostModelTransport
        ? "Connected model bridge"
        : "Local demo helper",
      contextHumanTurnId
    });
  } catch (error) {
    $("#transcript").textContent = `Conversation unavailable: ${error.message}`;
    setStatus(`${error.code ?? "CONVERSATION_ERROR"}: ${error.message}`);
  } finally {
    conversationBusy = false;
    sendButton.disabled = false;
    sendButton.setAttribute("aria-busy", "false");
  }
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
  commitSession("offer-presented", session, {
    causeRefs: [`offer:${offer.offerId}`],
    payload: {
      offerId: offer.offerId,
      targetId: offer.targetId,
      pageVersion: offer.pageVersion
    }
  });
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
    commitSession(
      "receipt-recorded",
      transitionShowcaseSession(session, { type: "RECEIPT_RECORDED", receipt }),
      { causeRefs: [`offer:${offer.offerId}`] }
    );
    receipts = session.receipts;
    offers = offers.filter((candidate) => candidate.offerId !== offer.offerId);
    commitSession("offer-resolved", session, {
      causeRefs: [`offer:${offer.offerId}`],
      payload: { offerId: offer.offerId, receiptStatus: receipt.status }
    });
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
  commitSession(
    "human-away",
    transitionShowcaseSession(session, {
      type: "HUMAN_AWAY",
      duration,
      lease,
      now: new Date(now).toISOString()
    }),
    { causeRefs: [`lease:${lease.leaseId}`], at: new Date(now).toISOString() }
  );
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
  commitSession(
    "solo-attempt-started",
    transitionShowcaseSession(session, { type: "SOLO_ATTEMPT_STARTED" }),
    { causeRefs: [`lease:${leaseId}`] }
  );
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
  commitSession(
    "solo-receipt-recorded",
    transitionShowcaseSession(session, { type: "RECEIPT_RECORDED", receipt }),
    { causeRefs: [`lease:${leaseId}`] }
  );
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
  commitSession(
    "human-returned",
    transitionShowcaseSession(session, {
      type: "HUMAN_RETURNED",
      receipts,
      pendingQuestion: offers.length ? "Review the remaining action offer?" : null
    })
  );
  const summary = session.returnSummary;
  const message = `${summary.verified} verified, ${summary.failed} failed.`;
  setStatus(`Welcome back. ${message}`);
  speak(`Welcome back. ${message}`);
  render();
}

function toggleAgent() {
  const transitionType =
    session.agentPresence === "paused" ? "AGENT_RESUMED" : "AGENT_PAUSED";
  commitSession(
    transitionType === "AGENT_RESUMED" ? "agent-resumed" : "agent-paused",
    transitionShowcaseSession(session, { type: transitionType })
  );
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

  recognitionSession = createRecognitionSession({
    Recognition,
    onActiveChange: (active) => {
      talkButton.disabled = active;
      talkButton.setAttribute("aria-busy", String(active));
    },
    onStart: () => {
      talkButton.classList.add("is-listening");
      talkButton.textContent = "Listening…";
      $("#transcript").textContent = "Listening. Pause naturally; silence will not create a turn.";
    },
    onResult: (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim() ?? "";
      $("#conversation-input").value = transcript;
      void sendConversationTurn(transcript);
    },
    onError: (event) => {
      $("#transcript").textContent =
        event.error === "no-speech"
          ? "Silence detected. No model turn created."
          : `Speech input unavailable: ${event.error}`;
    },
    onEnd: () => {
      talkButton.classList.remove("is-listening");
      talkButton.innerHTML = '<span aria-hidden="true">●</span> Push to talk';
    }
  });
  talkButton.addEventListener("click", () => recognitionSession.start());
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
      readFeedback: () => createFeedbackSnapshot(feedbackEvents),
      readTurn: () => conversationInbox.read(),
      replyTurn: (input) => {
        if (session.agentPresence === "paused") {
          throw new CoworkProtocolError(
            "SESSION_PAUSED",
            "Agent replies are paused while the human works solo"
          );
        }
        const pending = conversationInbox.read().latest;
        if (
          pending?.turn.focus &&
          pending.turn.focus.pageVersion !== pageVersion
        ) {
          throw new CoworkProtocolError(
            "STALE_FOCUS",
            "The page changed after this conversation turn was created"
          );
        }
        const response = conversationInbox.respond(input);
        const presentation = presentConversationReply({
          turn: pending.turn,
          reply: response.reply,
          transportLabel: "WebMCP agent reply"
        });
        return { ...response, presentation };
      }
    });
    capabilityLevel = "native";
    setStatus("Nine Native WebMCP tools registered: focus, context, causal changes, presence, offers, solo execution, feedback, conversation inbox, and bounded reply.");
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
    let change = null;
    if (session.changeCausality) {
      changeCounter += 1;
      change = observeControlChange({
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
    commitSession("page-change-observed", session, {
      causeRefs: change?.causeRefs ?? [],
      payload: {
        changeId: change?.changeId ?? null,
        targetId: focusPacket?.targetId ?? `form-field:${field.dataset.fieldId}`,
        pageVersion
      }
    });
    render();
  });
}

$("#attention-mode").addEventListener("change", (event) => {
  const nextSession = { ...session, attentionMode: event.target.value };
  if (nextSession.attentionMode === "off") {
    focusPacket = null;
    focusedField = null;
    fields.forEach((field) => field.classList.remove("is-focused"));
    setStatus("Attention is off. No page context is sent.");
  } else if (focusedField) {
    focusPacket = buildFocus(focusedField);
  }
  commitSession("attention-mode-changed", nextSession, {
    payload: { attentionMode: event.target.value }
  });
  render();
});

$("#change-causality").addEventListener("change", (event) => {
  const nextSession = { ...session, changeCausality: event.target.checked };
  if (!nextSession.changeCausality) changeEvents = [];
  commitSession("causality-mode-changed", nextSession, {
    payload: { enabled: event.target.checked }
  });
  setStatus(event.target.checked ? "Change and causality lens enabled." : "Change and causality lens disabled.");
});

$("#action-mode").addEventListener("change", (event) => {
  commitSession("action-mode-changed", { ...session, actionMode: event.target.value }, {
    payload: { actionMode: event.target.value }
  });
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
$("#detach-cowork").addEventListener("click", () => {
  void detachCoworkSurface();
});
$("#open-companion").addEventListener("click", () => {
  void openInCompanion();
});
$("#conversation-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void sendConversationTurn($("#conversation-input").value);
});
$("#away-short").addEventListener("click", () => startAway("short"));
$("#away-long").addEventListener("click", () => startAway("long"));
$("#return-human").addEventListener("click", returnHuman);
$("#toggle-agent").addEventListener("click", toggleAgent);
$("#stop-speech").addEventListener("click", () => {
  recognitionSession?.stop();
  window.speechSynthesis?.cancel();
});
$("#demo-form").addEventListener("submit", (event) => {
  event.preventDefault();
  submitFormBuilderResponse();
});

document.addEventListener("visibilitychange", () => {
  if (companionReplicaSnapshot !== null) {
    void reportCompanionSurfaceVisibility(document.visibilityState).catch((error) => {
      setStatus(`${error.code ?? "COMPANION_SYNC_ERROR"}: ${error.message}`);
    });
    return;
  }
  sessionAuthority.record({
    kind: "surface-visibility",
    sourceSurfaceId: EMBEDDED_SURFACE_ID,
    payload: { visibility: document.visibilityState }
  });
  const revisionLabel = $("#session-revision");
  if (revisionLabel) {
    revisionLabel.textContent = String(sessionAuthority.readSnapshot().revision);
  }
});

window.addEventListener("beforeunload", () => {
  registrationController?.abort();
  clearTimeout(leaseExpiryTimer);
  clearTimeout(offerExpiryTimer);
  if (responseDownloadUrl) URL.revokeObjectURL(responseDownloadUrl);
  if (detachedSurfaceWindow && !detachedSurfaceWindow.closed) {
    detachedSurfaceWindow.close();
  }
  delete window.coworkSession;
  delete window.coworkIntegration;
});

configureSpeech();
render();
configureWebMcp();
