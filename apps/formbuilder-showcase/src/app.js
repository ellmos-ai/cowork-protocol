import {
  authorizeActionOffer,
  CoworkProtocolError,
  createActionOffer,
  createFeedbackEvent,
  createPresenceEvent,
  createActionReceipt,
  resolveBridgeState
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
  createConversationInbox,
  createConversationTurn
} from "../../../packages/conversation/src/index.js";
import { discoverHttpModelTransport } from "../../../packages/model-transport/src/browser.js";
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
import {
  BRIDGE_COPY,
  BRIDGE_ICON,
  REFERENCE_UI_PROVIDER_ID,
  createSpeaker,
  createStepIcon,
  STATUS_STEPS,
  statusForWorkModeChoice,
  workModeChoices
} from "../../../packages/reference-ui/src/index.js";
import {
  createShowcaseSubmission,
  SHOWCASE_SCHEMA
} from "./formbuilder-use-case.js";
import { initBuilderStudio } from "./builder-view.js";
import { initBuilderCowork } from "./builder-cowork-ui.js";
import {
  adoptSessionState,
  buildLeaseExpiryEffect,
  createShowcaseSession,
  nextActorStatus,
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
  prepareVisibleActionOffer,
  workModeChoiceId
} from "./view-model.js";
import { createRecognitionSession } from "./speech-controller.js";
import { replyToShowcaseTurn } from "./local-conversation.js";
import { createModelSeat } from "./model-seat.js";
import { adviseCommentForHumanChange } from "./advisor-comment.js";
import { startCompanionAgentRelay } from "./companion-agent-relay.js";

const SESSION_ID = "formbuilder-showcase";
const EMBEDDED_SURFACE_ID = "formbuilder:embedded";
const DETACHED_SURFACE_ID = "formbuilder:document-pip";
// This demo lease is intentionally fixed (one focused field, a short window)
// - it is the fixed-form counterpart to the Builder's own configurable
// Delegate dialog (goal/call-budget/duration as human inputs), not the same
// mechanism. Named here, once, so the microcopy describing it (GAP-04
// microcopy) can never drift from what it actually grants.
const LEASE_MAX_CALLS = 2;
const LEASE_DURATION_MS = 120_000;
// The Studio canvas is a different job than one focused demo field:
// drafting a set of questions needs a bigger call budget than the
// two-attempt demo lease. Same clock, same handover buttons, same
// receipts - only the budget differs, and the panel says which one is in
// force.
const BUILDER_GRANT_MAX_CALLS = 6;
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
// GAP-04 microcopy: describe the real configured grant, not a string that
// could silently drift from the constants above. render() picks the line that
// matches the canvas the human is actually on.
const DEMO_LEASE_MICROCOPY =
  `This field-scoped demo lease lasts ${Math.round(LEASE_DURATION_MS / 60_000)} minutes, permits at most ${LEASE_MAX_CALLS} attempts, and ends after a verified page change.`;
const BUILDER_LEASE_MICROCOPY =
  `On the Studio canvas the same buttons mint a canvas-scoped grant: ${Math.round(LEASE_DURATION_MS / 60_000)} minutes and at most ${BUILDER_GRANT_MAX_CALLS} drafts. ` +
  `Handing over while you watch drafts one per click; stepping away lets the model spend the budget.`;
$("#lease-microcopy").textContent = DEMO_LEASE_MICROCOPY;
// Every visible word about presence, area, role and mode comes from
// packages/reference-ui; this surface never writes its own status labels.
$("#status-steps").replaceChildren(
  ...STATUS_STEPS.map((step) => {
    const item = document.createElement("span");
    item.append(createStepIcon(step.icon, document), step.label);
    item.title = step.question;
    return item;
  })
);

// --- The bridge ------------------------------------------------------------
// This panel is a bridge, and a bridge has a place. With nothing on it the
// page shows the mark, the sentence and the model seat - the seat is where a
// model arrives, so it stays; instruments that would refuse every press do
// not. The extension's Side Panel is the same bridge and says the same words.
$("#bridge-mark").replaceChildren(createStepIcon(BRIDGE_ICON, document));
// When an agent last called one of this page's nine Cowork tools.
let lastAgentActivityAt = null;
// Arrival and departure are transitions, so only this surface sees them.
let bridgeState = null;
let bridgeStage = null;
let bridgeStageUntil = 0;
const BRIDGE_ARRIVAL_MS = 1400;
const BRIDGE_DEPARTURE_MS = 4000;

function noteAgentActivity() {
  lastAgentActivityAt = Date.now();
}

/**
 * Every native Cowork tool call is an agent reaching this bridge. Wrapping the
 * handlers in one place beats stamping each of the nine: a tool added later
 * cannot forget to report that someone crossed.
 */
function reportAgentActivity(handlers) {
  return Object.fromEntries(
    Object.entries(handlers).map(([name, handler]) => [
      name,
      typeof handler === "function"
        ? (...args) => {
            noteAgentActivity();
            return handler(...args);
          }
        : handler
    ])
  );
}

function renderBridge() {
  const next = resolveBridgeState({
    companionConnected: session.surface?.kind === "desktop",
    // This page draws its own bridge, so it is never the one stepping aside.
    pageOwnsBridge: false,
    seatOccupied: modelSeat.resolve().kind !== "none",
    agentLastSeenAt: lastAgentActivityAt,
    // render() refreshes the live offers just above this call.
    offerPending: offers.length > 0,
    now: Date.now()
  });
  if (bridgeState !== next) {
    if (bridgeState === "resting" && next === "crossing") {
      bridgeStage = "arriving";
      bridgeStageUntil = Date.now() + BRIDGE_ARRIVAL_MS;
    } else if (bridgeState === "crossing" && next === "resting") {
      bridgeStage = "leaving";
      bridgeStageUntil = Date.now() + BRIDGE_DEPARTURE_MS;
    } else {
      bridgeStage = null;
      bridgeStageUntil = 0;
    }
    bridgeState = next;
    if (bridgeStage) setTimeout(render, bridgeStageUntil - Date.now() + 40);
  }
  const stage = Date.now() < bridgeStageUntil ? bridgeStage : bridgeState;
  coworkPanel.dataset.bridge = stage;
  $("#bridge-message").textContent =
    stage === "arriving"
      ? BRIDGE_COPY.arriving
      : stage === "leaving"
        ? BRIDGE_COPY.left
        : stage === "companion"
          ? BRIDGE_COPY.companion
          : stage === "crossing"
            ? BRIDGE_COPY.crossing
            : BRIDGE_COPY.resting;
}

// --- Folded sections -------------------------------------------------------
// The panel answers six questions at once, and a reader arriving at it meets
// all six. Each section is a native <details>: the ones that carry the live
// state stay open, the two that only matter once something happened start
// closed and open themselves when it does. What the reader folds by hand is
// remembered; what the panel opens for them is help for this sitting, not a
// preference, so it is never written back.
const FOLD_STORAGE_KEY = "cowork-panel-folds";

function readStoredFolds() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(FOLD_STORAGE_KEY) ?? "{}");
    return stored !== null && typeof stored === "object" ? stored : {};
  } catch {
    // A corrupted or unreadable entry costs the memory, never the panel.
    return {};
  }
}

function rememberFold(fold) {
  try {
    window.localStorage.setItem(
      FOLD_STORAGE_KEY,
      JSON.stringify({ ...readStoredFolds(), [fold.id]: fold.open })
    );
  } catch {
    // Storage can be denied; the fold still works for this sitting.
  }
}

const storedFolds = readStoredFolds();
for (const fold of coworkPanel.querySelectorAll(".section-fold")) {
  if (typeof storedFolds[fold.id] === "boolean") fold.open = storedFolds[fold.id];
  // Only a summary the reader actually pressed writes the state back - a
  // toggle event alone cannot tell a hand from the panel's own hand.
  fold.querySelector("summary").addEventListener("click", () => {
    fold.dataset.pressed = "1";
  });
  fold.addEventListener("toggle", () => {
    if (fold.dataset.pressed !== "1") return;
    delete fold.dataset.pressed;
    rememberFold(fold);
  });
}

function revealFold(foldId) {
  const fold = document.getElementById(foldId);
  if (fold !== null && !fold.open) fold.open = true;
}

let renderedReceiptCount = 0;

const [, AREA_STEP, ROLE_STEP] = STATUS_STEPS;
$("#work-mode-heading-text").textContent = ROLE_STEP.label;
$("#work-mode-select-label").textContent = ROLE_STEP.question;
// The offered modes depend on the live state (doubling only where the two
// are on different areas), so the option list is rebuilt on every render.
let renderedWorkModeChoices = [];
function renderWorkModeChoices(workMode) {
  const choices = workModeChoices(workMode);
  const unchanged =
    choices.length === renderedWorkModeChoices.length &&
    choices.every((choice, index) => choice.id === renderedWorkModeChoices[index].id);
  if (!unchanged) {
    renderedWorkModeChoices = choices;
    $("#work-mode").replaceChildren(
      ...choices.map((choice) => new Option(choice.label, choice.id))
    );
  }
  return choices;
}
const workModeLabel = (choiceId) =>
  renderedWorkModeChoices.find((choice) => choice.id === choiceId)?.label ?? String(choiceId);

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
let advisorComment = null; // GAP-06: latest advisor comment on a human change, or null; render() gates its display.
let pageVersion = 1;
let capabilityLevel = "unavailable";
let registrationController = null;
// The page runs its own tools. Held here so the Companion relay can run the
// same callbacks for a local agent that WebMCP runs for a browser agent.
let coworkToolHandlers = {};
let offerCounter = 0;
let changeCounter = 0;
let recognitionSession = null;
let leaseCallsUsed = 0;
let responseDownloadUrl = null;
let pendingChangeCause = null;
let leaseExpiryTimer = null;
let offerExpiryTimer = null;
let conversationBusy = false;
let modelWorkingField = null;
let modelWorkingTimer = null;
let detachedSurfaceWindow = null;
let companionReplicaSnapshot = null;
let companionConnection = null;
let companionRelayStop = null;
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
  session = adoptSessionState(companionReplicaSnapshot.state);
  showCompanionConversation(session.lastConversation);
  render();
  return readCurrentSessionSnapshot();
}

// While the Companion holds the model seat the human types over there, so the
// page must show that conversation - including a turn that failed, which
// otherwise vanishes and leaves the page looking like nothing was asked.
function showCompanionConversation(lastConversation) {
  if (!lastConversation) return;
  const speaker = lastConversation.status === "responded"
    ? "Model"
    : lastConversation.status === "pending"
      ? "Model"
      : `Model failed (${lastConversation.status})`;
  const said = lastConversation.status === "pending"
    ? "Working from the shared bounded context… a local model that has to load takes a moment."
    : lastConversation.assistant;
  $("#transcript").textContent = `You: ${lastConversation.human}
${speaker}: ${said}`;
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

function fieldLabelForTarget(targetId) {
  const fieldId = String(targetId ?? "").replace("form-field:", "");
  return fields.find((field) => field.dataset.fieldId === fieldId)?.dataset.label ?? null;
}

// The area each partner claims is observed, never configured: the human is
// on the field the attention lens points at, the model on the field its
// lease covers. The wording for it lives in packages/reference-ui.
function currentAreas(state) {
  // An empty model seat means no model is here - not one that advises. The
  // seat is the only source for this, so the figures, the relay and the work
  // mode can never imply an advisor that does not exist. Applied on the tick
  // where the seat CHANGES (this is the one caller, so tracking it here is
  // safe): a human who parks the model on "away" keeps that choice, and
  // "away" stays a real option in ACTOR_STATUS_CYCLE.
  const seatIsEmpty = modelSeat.resolve().kind === "none";
  const seatChanged = seatWasEmpty !== null && seatWasEmpty !== seatIsEmpty;
  seatWasEmpty = seatIsEmpty;
  return {
    human: {
      ...state.human,
      area: state.human.availability === "here" ? focusPacket?.focus?.label ?? null : null
    },
    model: {
      ...state.model,
      ...(seatIsEmpty ? { availability: "away" } : seatChanged ? { availability: "here" } : {}),
      area: state.lease
        ? fieldLabelForTarget(state.lease.allowedTargetIds?.[0]) ?? state.lease.goal
        : null
    }
  };
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
    // The Companion owns the shared session, so this surface authors no delta.
    // What it must not do is drop what already happened here: a human clicked
    // an offer on this page and the field changed. Reflecting that locally
    // keeps the receipt and its verdicts visible; the Companion's next delta
    // still wins, because adoptSessionState() replaces this state wholesale.
    session = nextSession;
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
// One Demo switch, one seat: who answers here is decided in model-seat.js and
// shown in the panel's "Model seat" section. Demo off + nothing connected
// means nothing is proposed - the seat never falls back to the script silently.
const modelSeat = createModelSeat({
  injected:
    typeof injectedHostModelTransport?.sendTurn === "function"
      ? injectedHostModelTransport
      : null,
  discovered: discoveredHostModelTransport,
  demoReply: replyToShowcaseTurn,
  storage: { local: window.localStorage, session: window.sessionStorage },
  pageProtocol: window.location.protocol
});
const conversationClient = createConversationClient({
  sendTurn: (turn) => modelSeat.sendTurn(turn)
});
const conversationInbox = createConversationInbox();
let conversationTransportLabel = modelSeat.resolve().transportLabel;
let extensionAttached = false;
let seatWasEmpty = null;
let builderCowork = null;
// The Studio canvas is this panel's second attention target:
// `{ fieldId, label }` while the human points at a Builder field, null
// while they are on the demo form. Only one of the two is ever set.
let builderFocus = null;
// --- Two canvases, one panel. The workspace shows exactly one of them, so the
// panel can never report attention on a surface nobody can see, and the human
// picks where to test. The Studio opens first: designing a form is the
// product, the sample form is the fixed fixture the WebMCP proof reads. ---
const WORKSPACE_AREAS = Object.freeze({
  studio: { tab: "#workspace-tab-studio", panel: "#workspace-panel-studio", name: "Studio canvas" },
  sample: { tab: "#workspace-tab-sample", panel: "#workspace-panel-sample", name: "Sample form" }
});
const WORKSPACE_STORAGE_KEY = "cowork-workspace-area";
let activeWorkspace = "studio";
try {
  const storedWorkspace = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
  if (storedWorkspace !== null && Object.hasOwn(WORKSPACE_AREAS, storedWorkspace)) {
    activeWorkspace = storedWorkspace;
  }
} catch {
  // Private windows and blocked site data are fine: the Studio opens first.
}
const REPLY_STATUS_BY_TRANSPORT = Object.freeze({
  "Connected model bridge": "Connected model reply received through the bounded conversation bridge.",
  "Direct model": "Direct model reply received through the bounded conversation turn.",
  "WebMCP agent reply": "WebMCP agent reply received for the latest bounded human turn.",
  "Local demo helper": "Local demo reply created from the bounded conversation turn.",
  "No model connected": "No model is connected: the turn was published for a WebMCP agent only, nothing was proposed."
});
const MODEL_SEAT_HELP = Object.freeze({
  demo: "Demo mode is on: a disclosed scripted helper answers and proposes fixed values. Nothing here comes from a language model. Switch it off to use your own model.",
  host: "A same-origin model host answers (npm run start:model). Endpoint, model ID and key stay in that server process.",
  injected: "An injected page transport answers.",
  none: "No model is connected and Demo mode is off. Nothing will be proposed and conversation turns get a plain system reply. Connect your model below, open the Desktop Companion, or switch Demo mode on.",
  companion: "The Desktop Companion owns the model seat for this session; continue in its window."
});

function describeModelSeatHelp(seat, companionConnected) {
  if (companionConnected) return MODEL_SEAT_HELP.companion;
  if (seat.kind === "direct") {
    return `Direct browser connection to ${seat.model} at ${new URL(seat.endpoint).host}. Replies are real model output; a failed call is shown as an error and never replaced by the script.`;
  }
  return MODEL_SEAT_HELP[seat.kind] ?? "";
}

function renderModelSeat() {
  const seat = modelSeat.resolve();
  const companionConnected = session.surface?.kind === "desktop";
  const badgeLabel = companionConnected ? "Desktop Companion" : seat.label;
  const tone = companionConnected ? "live" : seat.tone;
  const headerBadge = $("#model-badge");
  headerBadge.textContent = `Model: ${badgeLabel}`;
  headerBadge.dataset.tone = tone;
  const seatBadge = $("#model-seat-badge");
  seatBadge.textContent = badgeLabel;
  seatBadge.dataset.tone = tone;
  $("#demo-mode").checked = seat.kind === "demo";
  $("#demo-mode").disabled = companionConnected;
  $("#demo-offer").hidden = seat.kind !== "demo";
  const direct = modelSeat.directConfig();
  $("#model-disconnect-button").hidden = direct === null;
  $("#model-test-button").disabled = companionConnected || seat.kind === "demo" || seat.kind === "none";
  $("#model-connect-button").textContent = direct === null ? "Use this model" : "Update";
  if (direct !== null) {
    if ($("#model-endpoint").value.trim() === "") $("#model-endpoint").value = direct.endpoint;
    if ($("#model-id").value.trim() === "") $("#model-id").value = direct.model;
  }
  $("#model-seat-help").textContent = describeModelSeatHelp(seat, companionConnected);
  // On the Studio canvas the demo button proposes a field instead of a value.
  $("#demo-offer").textContent =
    builderFocus === null ? "Create local demo offer" : "Model suggests a field";
}

function describeFailure(error) {
  return error.code ? `${error.code}: ${error.message}` : error.message;
}

/**
 * Says how to turn WebMCP on in the browser actually being used. The feature
 * names come from the smokes that launch Chrome with them; the flag page entry
 * is described as a search, because its label is not ours to promise.
 */
function renderWebMcpHelp() {
  const native = capabilityLevel === "native";
  const state = $("#webmcp-help-state");
  state.textContent = native ? "Native WebMCP" : "off";
  state.dataset.tone = native ? "live" : "off";
  const brands = navigator.userAgentData?.brands?.map((brand) => brand.brand).join(" ") ?? navigator.userAgent;
  const isEdge = /Edg/i.test(brands);
  const isChrome = !isEdge && /Chrome|Chromium/i.test(brands);
  const chromium = isEdge || isChrome;
  const flagsPage = isEdge ? "edge://flags" : "chrome://flags";
  const exe = isEdge
    ? '"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"'
    : '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"';
  $("#webmcp-help-browser").textContent = native
    ? "This browser exposes document.modelContext, so a browser agent can discover this page's nine Cowork tools. Everything on this page also works without it."
    : chromium
      ? `Detected ${isEdge ? "Microsoft Edge" : "Chrome or another Chromium browser"}. WebMCP is an experiment and is off by default; the page works without it, only in-browser agent discovery is missing.`
      : "WebMCP is a Chromium experiment. Use Chrome or Edge 150 or newer to try it; this page works without it either way.";
  const steps = chromium && !native
    ? [
        `Open ${flagsPage}, search for WebMCP, enable the WebMCP and WebMCP Testing entries, then restart the browser.`,
        `If the flags are not offered, start the browser from a command line with the features switched on: ${exe} --enable-features=WebMCP,WebMCPTesting`,
        "Reload this page. The badge above reads Native WebMCP once it is on."
      ]
    : [];
  $("#webmcp-help-steps").replaceChildren(
    ...steps.map((step) => {
      const item = document.createElement("li");
      item.textContent = step;
      return item;
    })
  );
  // Open itself once, on a first visit without WebMCP - not on every reload.
  try {
    if (!native && window.localStorage.getItem("cowork-webmcp-help-seen") === null) {
      $("#webmcp-help").open = true;
      window.localStorage.setItem("cowork-webmcp-help-seen", "1");
    }
  } catch {
    // Private windows and blocked site data are fine: the disclosure just
    // stays closed until someone opens it.
  }
}

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

/** A button that carries an icon has its words in a label node; writing the
 *  button's own textContent would take the icon with them. */
function setButtonLabel(selector, text) {
  $(selector).querySelector(".button-label").textContent = text;
}

async function openInCompanion() {
  if (companionConnection) return companionConnection;
  const button = $("#open-companion");
  button.disabled = true;
  setButtonLabel("#open-companion", "Connecting…");
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
    // A local agent's tool calls wait on the Companion until this page pulls
    // them: the Companion stays the session authority and never reaches in.
    companionRelayStop = startCompanionAgentRelay({
      link,
      linkSessionId: acknowledgement.linkSessionId,
      handlers: coworkToolHandlers,
      syncDeltas: () => pullAllCompanionDeltas()
    });
    session = adoptSessionState(companionReplicaSnapshot.state);
    let visibilityWarning = null;
    try {
      await reportCompanionSurfaceVisibility(document.visibilityState);
    } catch (error) {
      visibilityWarning =
        `${error.code ?? "COMPANION_SYNC_ERROR"}: initial page visibility is unknown`;
    }
    // The Companion window is the session authority from here on, and it is
    // the one that speaks. Cut a sentence the page had started.
    speaker.silence();
    coworkPanel.classList.add("is-companion-connected");
    setButtonLabel("#open-companion", "Connected");
    setStatus(
      visibilityWarning ??
        "Desktop Companion connected. This page is now a synchronized protocol replica."
    );
    render();
    return companionConnection;
  } catch (error) {
    button.disabled = false;
    setButtonLabel("#open-companion", "Desktop Companion");
    setStatus(
      `${error.code ?? "COMPANION_UNAVAILABLE"}: ${error.message} — start it with "npm run start:companion-host" (surface http://127.0.0.1:47831/cowork/v1/ui), then try again.`
    );
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

/** Back from the Companion to the embedded panel. The page is its own
 *  session authority again, from its own last revision; the Companion keeps
 *  its copy and nothing here reaches into it. Before this, the only way
 *  back was reloading the page. */
function leaveCompanion() {
  if (!companionConnection) return;
  companionRelayStop?.();
  companionRelayStop = null;
  companionConnection = null;
  companionReplicaSnapshot = null;
  session = sessionAuthority.readState();
  if (session.surface?.kind !== "embedded") {
    claimSurface({
      surfaceId: EMBEDDED_SURFACE_ID,
      kind: "embedded",
      reason: "Left the Desktop Companion"
    });
  }
  coworkPanel.classList.remove("is-companion-connected");
  setStatus("Left the Desktop Companion. This page owns its session again; the Companion keeps its own copy.");
  render();
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

// One session, one voice, one speaker: while the Companion window holds the
// session it does the talking, so the two windows never answer over each
// other in two different voices. The chosen voice is never announced in the
// transcript or the console.
const speaker = createSpeaker({
  synthesis: window.speechSynthesis,
  isEnabled: () =>
    $("#speak-output").checked && session.surface?.kind !== "desktop"
});

function speak(message, options) {
  speaker.speak(message, options);
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
  return "";
}

function endModelWorking({ delay = 0 } = {}) {
  if (modelWorkingTimer !== null) clearTimeout(modelWorkingTimer);
  const clear = () => {
    modelWorkingField?.classList.remove("is-model-working");
    modelWorkingField = null;
    modelWorkingTimer = null;
  };
  if (delay > 0) modelWorkingTimer = setTimeout(clear, delay);
  else clear();
}

function beginModelWorking(field = focusedField) {
  endModelWorking();
  if (!field) return;
  modelWorkingField = field;
  modelWorkingField.classList.add("is-model-working");
}

function flashModelWorking(field = focusedField) {
  beginModelWorking(field);
  endModelWorking({ delay: 900 });
}

function focusKind(attentionMode = session.attentionMode) {
  if (attentionMode === "pinned") return "pinned";
  if (attentionMode === "selection") return "selection";
  return "pointer";
}

function buildFocus(field, attentionMode = session.attentionMode) {
  if (!field || attentionMode === "off") return null;
  const control = currentControl(field);
  const selectedText = ["pointer", "selection"].includes(attentionMode)
    ? selectedTextFor(control)
    : "";
  if (attentionMode === "selection" && selectedText === "") return null;
  return buildFormBuilderFocus({
    sessionId: "formbuilder-showcase",
    pageVersion,
    fieldId: field.dataset.fieldId,
    label: field.dataset.label,
    controlKind: field.dataset.controlKind,
    selectedText,
    focusKind: focusKind(attentionMode)
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
  // Two canvases, one lens: pointing at the demo form releases the Studio
  // target so the area readout never names two places at once.
  builderCowork?.clearFocus();
  const nextFocusPacket = buildFocus(field);
  if (nextFocusPacket === null) {
    focusedField = null;
    focusPacket = null;
    fields.forEach((candidate) => candidate.classList.remove("is-focused"));
    render();
    return;
  }
  const unchanged =
    focusedField === field &&
    JSON.stringify(focusPacket) === JSON.stringify(nextFocusPacket);
  focusedField = field;
  fields.forEach((candidate) => candidate.classList.toggle("is-focused", candidate === field));
  focusPacket = nextFocusPacket;
  if (unchanged) {
    render();
    return;
  }
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
  if (view.actionChips.length === 0 && (builderCowork?.pendingOffers().length ?? 0) === 0) {
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

  // The Studio canvas offers into the same list: one panel, one place where a
  // model proposal waits for a real click, whichever canvas it came from.
  for (const offer of builderCowork?.pendingOffers() ?? []) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "offer-chip";
    const copy = document.createElement("span");
    const strong = document.createElement("strong");
    strong.textContent = offer.summary;
    const detail = document.createElement("span");
    detail.textContent = `Studio canvas \u00b7 ${builderCowork.describeOffer(offer)}`;
    copy.append(strong, detail);
    button.append(copy);
    button.addEventListener("click", (event) => executeBuilderOffer(event, offer.offerId));
    list.append(button);
  }
}

function executeBuilderOffer(event, offerId) {
  if (!event.isTrusted) {
    setStatus("HUMAN_CONFIRMATION_REQUIRED: synthetic clicks are rejected.");
    return;
  }
  try {
    const receipt = builderCowork.applyOffer(offerId);
    setStatus(
      receipt.status === "verified"
        ? `Model suggestion verified after your click: ${receipt.verificationSummary}`
        : `VERIFICATION_FAILED: ${receipt.verificationSummary}`
    );
  } catch (error) {
    setStatus(describeFailure(error));
  }
  render();
}

/** The Studio canvas writes into the same receipt list. Its newest entry
 *  carries the verdict buttons while a return or a directive still owes one
 *  (GAP-05) - the same Good/Adjust/Different the demo form's receipts use. */
function renderBuilderReceipts(list) {
  const builderReceipts = builderCowork?.readReceipts() ?? [];
  const awaitsVerdict = (builderCowork?.readAwaitingFeedback() ?? null) !== null;
  const newestFirst = builderReceipts.slice(-4).reverse();
  newestFirst.forEach((receipt, index) => {
    const item = document.createElement("li");
    item.className = receipt.status === "failed" ? "receipt-failed" : "";
    const status = document.createElement("strong");
    status.textContent = receipt.status === "verified" ? "Verified: " : "Failed: ";
    item.append(status, receipt.verificationSummary);
    if (index === 0 && awaitsVerdict) item.append(buildBuilderFeedbackControls());
    list.append(item);
  });
}

function buildBuilderFeedbackControls() {
  const controls = document.createElement("div");
  controls.className = "feedback-controls";
  controls.setAttribute("role", "group");
  controls.setAttribute("aria-label", "Evaluate the Studio canvas result");
  const buttons = document.createElement("div");
  buttons.className = "feedback-buttons";
  for (const [label, verdict] of [
    ["Good", "accepted"],
    ["Adjust", "revise"],
    ["Different", "rejected"]
  ]) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.verdict = verdict;
    button.textContent = label;
    button.addEventListener("click", (event) => {
      if (!event.isTrusted) {
        setStatus("HUMAN_CONFIRMATION_REQUIRED: synthetic feedback clicks are rejected.");
        return;
      }
      try {
        builderCowork.recordFeedback(verdict);
        // The return highlights were the stale state the human kept seeing:
        // once the verdict is in, that round is over.
        builderCowork.clearReturnHighlights();
        setStatus("Feedback recorded for the Studio canvas.");
      } catch (error) {
        setStatus(describeFailure(error));
      }
      render();
    });
    buttons.append(button);
  }
  controls.append(buttons);
  return controls;
}

function renderReceipts() {
  const list = $("#receipt-list");
  list.textContent = "";
  renderBuilderReceipts(list);
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
  $("#receipt-count").textContent = String(
    receipts.length + (builderCowork?.readReceipts().length ?? 0)
  );
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
      now,
      ...currentAreas(session)
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
  $("#embedded-mode-chip").textContent = view.modeLabel;
  $("#human-label").textContent = view.humanLabel;
  $("#agent-label").textContent = view.modelLabel;
  $("#embedded-relay-label").textContent = view.modeLabel;
  $("#embedded-relay-detail").textContent = view.modeDetail;
  $("#embedded-relay-core").setAttribute("aria-label", view.modeLabel);
  coworkPanel.dataset.humanState = view.humanState;
  coworkPanel.dataset.modelState = view.modelState;
  coworkPanel.dataset.relayState = view.relayState;
  renderBridge();
  $("#focus-label").textContent = view.focusLabel;
  $("#context-label").textContent = view.contextLabel;
  $("#capability-badge").textContent = view.capabilityLabel;
  $("#capability-badge").dataset.tone = capabilityLevel === "native" ? "live" : "off";
  renderWebMcpHelp();
  $("#capability-badge").title =
    capabilityLevel === "native"
      ? "This browser exposes document.modelContext; the page registered its nine native Cowork tools."
      : "This browser does not expose document.modelContext (chrome://flags → WebMCP). The page still works; only in-browser agent discovery is off.";
  $("#model-transport-badge").textContent = conversationTransportLabel;
  renderModelSeat();
  $("#page-version").textContent = String(pageVersion);
  $("#session-revision").textContent = String(readCurrentSessionSnapshot().revision);
  const companionConnected = session.surface?.kind === "desktop";
  // Both surface buttons keep their icon: only the label node changes, and
  // the button's textContent stays the label alone, as the smokes read it.
  setButtonLabel(
    "#detach-cowork",
    session.surface?.kind === "document-pip" ? "Dock in page" : "Detach"
  );
  $("#detach-cowork").disabled = companionConnected;
  $("#detach-cowork").setAttribute(
    "aria-pressed",
    String(session.surface?.kind === "document-pip")
  );
  $("#surface-label").textContent = companionConnected
    ? "Desktop Companion"
    : session.surface?.kind === "document-pip"
      ? "Detached"
      : extensionAttached
        ? "Embedded · Extension attached"
        : "Embedded";
  $("#open-companion").disabled = companionConnected;
  setButtonLabel("#open-companion", companionConnected ? "Connected" : "Desktop Companion");
  $("#extension-note").hidden = !extensionAttached;
  $("#conversation-input").disabled = companionConnected;
  $("#send-conversation").disabled = companionConnected || conversationBusy;
  $("#talk").disabled = companionConnected;
  $("#toggle-agent").textContent =
    session.model.availability === "here" ? "Pause model" : "Resume model";
  renderWorkModeChoices(session.workMode);
  $("#work-mode").value = view.choiceId;
  $("#mode-detail").textContent = view.modeDetail;
  $("#authority-label").textContent = view.authorityLabel;
  $("#role-badge").textContent = view.roleLabel;
  $("#role-detail").textContent = view.roleDetail;
  // Naming the active canvas first: with two of them behind one switcher, the
  // work-mode areas alone no longer say where the human actually is.
  $("#area-label").textContent =
    `${AREA_STEP.label}: ${WORKSPACE_AREAS[activeWorkspace].name} · ${view.areaLabel}`;
  // The Studio canvas has no focus packet of its own - its capabilities are
  // structural (add/update/move a field), not form.set_value - so the lens
  // names its target here instead of through the shared view model.
  if (builderFocus !== null) {
    $("#focus-label").textContent = `Pointing at: ${builderFocus.label} (Studio canvas)`;
    $("#area-label").textContent = `${AREA_STEP.label}: ${builderFocus.label} (Studio canvas)`;
  }
  const builderGrant = builderCowork?.readActiveGrant() ?? null;
  $("#lease-microcopy").textContent =
    builderGrant !== null
      ? `Studio delegation running: "${builderGrant.goal}" - ${builderCowork.readCallsUsed()}/${builderGrant.maxCalls} draft(s) used. Press "I'm back" to end it and see what changed.`
      : builderFocus !== null
        ? BUILDER_LEASE_MICROCOPY
        : DEMO_LEASE_MICROCOPY;

  const humanHere = view.humanState.startsWith("here");
  const modelHere = view.modelState.startsWith("here");
  const humanSeat = $("#human-seat");
  humanSeat.classList.toggle("is-active", humanHere);
  humanSeat.classList.toggle("is-away", !humanHere);
  humanSeat.dataset.presenceTone = view.humanTone;
  humanSeat.setAttribute("aria-pressed", String(humanHere));
  const modelSeatButton = $("#model-seat");
  modelSeatButton.classList.toggle("is-active", modelHere);
  modelSeatButton.classList.toggle("is-paused", !modelHere);
  modelSeatButton.setAttribute("aria-pressed", String(modelHere));
  renderOffers(view);
  renderReceipts();
  // Handoff and Verified receipts start folded; they unfold the moment they
  // have something to say, and stay where the reader leaves them afterwards.
  if (session.lease !== null || builderGrant !== null || !humanHere) revealFold("fold-handoff");
  const receiptCount = $("#receipt-list").childElementCount;
  if (receiptCount > renderedReceiptCount) revealFold("fold-receipts");
  renderedReceiptCount = receiptCount;
  // GAP-06: a silent advisory line, gated live on the current work mode (not
  // only at the moment the comment was created) so putting the model on
  // standby - or handing it the click right - hides it immediately, even for
  // a comment shown earlier.
  const advisorVisible = advisorComment !== null && session.workMode.model.canPropose;
  $("#advisor-comment").hidden = !advisorVisible;
  if (advisorVisible) $("#advisor-comment").textContent = advisorComment;
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
  const speaker = transportLabel === "WebMCP agent reply" ? "Agent" : modelSeat.resolve().speaker;
  $("#transcript").textContent = `You: ${turn.transcript}\n${speaker}: ${reply.message}`;
  setStatus(
    createdOffers > 0
      ? `${createdOffers} model suggestion${createdOffers === 1 ? "" : "s"} added as click-gated offer${createdOffers === 1 ? "" : "s"}.`
      : rejectedOffers > 0
        ? "The reply was shown, but its action offer was outside the current focus or action rights."
        : REPLY_STATUS_BY_TRANSPORT[transportLabel] ??
          "Reply received for the bounded conversation turn."
  );
  // Keyed on the turn, so a reply that reaches this surface twice - the page
  // route and the relay both present one - is announced once.
  speak(reply.speak || reply.message, { once: `turn:${turn.turnId}` });
  render();
  return { visibleOffers: createdOffers, rejectedOffers };
}

async function sendConversationTurn(transcriptInput) {
  if (conversationBusy) return;
  if (companionConnection !== null) {
    setStatus("The Desktop Companion owns the shared model seat. Continue in its movable window.");
    return;
  }
  const input = $("#conversation-input");
  const sendButton = $("#send-conversation");
  const transcript = typeof transcriptInput === "string" ? transcriptInput.trim() : "";
  if (transcript === "") {
    $("#transcript").textContent = "Silence detected. No model turn created.";
    return;
  }
  if (builderFocus !== null) {
    await sendBuilderTurn(transcript, input);
    return;
  }

  conversationBusy = true;
  beginModelWorking();
  sendButton.disabled = true;
  sendButton.setAttribute("aria-busy", "true");
  $("#transcript").textContent = `You: ${transcript}\n${modelSeat.resolve().speaker}: Thinking with bounded context…`;
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

    const activeSeat = modelSeat.resolve();
    if (activeSeat.publishesToInbox) {
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
      transportLabel: activeSeat.transportLabel,
      contextHumanTurnId
    });
  } catch (error) {
    $("#transcript").textContent = `Conversation unavailable: ${error.message}`;
    setStatus(`${error.code ?? "CONVERSATION_ERROR"}: ${error.message}`);
  } finally {
    conversationBusy = false;
    endModelWorking({ delay: 650 });
    sendButton.disabled = false;
    sendButton.setAttribute("aria-busy", "false");
  }
}

/**
 * A bounded turn about the pointed-at Studio field. A recognized instruction
 * authorizes directly (GAP-02: the words are the click); anything else asks
 * the seat for one proposed field, which lands in the panel's offer list and
 * still needs a real click.
 */
async function sendBuilderTurn(transcript, input) {
  if (!builderProposalsAllowed()) return;
  const speaker = modelSeat.resolve().speaker;
  try {
    const receipt = builderCowork.directive(transcript);
    if (receipt !== null) {
      input.value = "";
      $("#transcript").textContent = `You: ${transcript}\n${speaker}: ${receipt.verificationSummary}`;
      setStatus(
        receipt.status === "verified"
          ? `Done: ${receipt.verificationSummary}. Waiting for your verdict below.`
          : `VERIFICATION_FAILED: ${receipt.verificationSummary}`
      );
      render();
      return;
    }
    conversationBusy = true;
    beginModelWorking();
    render();
    $("#transcript").textContent = `You: ${transcript}\n${speaker}: Thinking with bounded context\u2026`;
    const summary = await builderCowork.suggestField(transcript);
    input.value = "";
    $("#transcript").textContent = `You: ${transcript}\n${speaker}: ${summary}`;
    setStatus("Model proposal added for the Studio canvas. Only a real click on the offer can authorize it.");
  } catch (error) {
    $("#transcript").textContent = `You: ${transcript}\n${speaker}: ${error.message}`;
    setStatus(describeFailure(error));
  } finally {
    conversationBusy = false;
    endModelWorking({ delay: 650 });
    render();
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
  if (!session.workMode.model.canPropose) {
    throw new CoworkProtocolError(
      "SESSION_PAUSED",
      "The model is not advising here, so it cannot propose an action"
    );
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
  if (!conversationBusy) flashModelWorking(focusedField);
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

/** The same gate createVisibleOffer() applies to the demo form: a model on
 *  standby proposes nothing, whichever canvas the human is pointing at. */
function builderProposalsAllowed() {
  if (session.workMode.model.canPropose) return true;
  setStatus("SESSION_PAUSED: the model is not advising here, so it cannot propose an action.");
  render();
  return false;
}

/** cowork_offer_action while the human points at the Studio: the same
 *  proposal gate as createVisibleOffer(), then the Builder bridge's own inert
 *  offer, shown in the one offer list until a real click. */
function createVisibleStudioOffer(input) {
  if (!session.workMode.model.canPropose) {
    throw new CoworkProtocolError(
      "SESSION_PAUSED",
      "The model is not advising here, so it cannot propose an action"
    );
  }
  if (!builderCowork) throw new CoworkProtocolError("STALE_FOCUS", "No FormBuilder field is focused");
  const offer = builderCowork.offerFromAgent(input);
  setStatus("Agent proposal added to the Studio. Only a real click on the offer can authorize it.");
  render();
  return offer;
}

function addDemoOffer() {
  if (builderFocus !== null) {
    if (!builderProposalsAllowed()) return;
    builderCowork
      .suggestField()
      .then((summary) => {
        setStatus(`${summary}. Only a real click on the offer can authorize it.`);
        render();
      })
      .catch((error) => setStatus(describeFailure(error)));
    return;
  }
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
  if (!session.workMode.model.canPropose) {
    setStatus("SESSION_PAUSED: the model is not advising, so there is no proposal to authorize.");
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
    speak(verified ? "Done and verified." : "The change could not be verified.", {
      once: `receipt:${receipt.offerId}:${receipt.status}`
    });
    render();
  } catch (error) {
    setStatus(`${error.code ?? "ERROR"}: ${error.message}`);
  }
}

// The one grant this panel can mint: the fixed demo lease over the focused
// field. Both handover buttons use it - staying or leaving changes who is
// present, never what the model is allowed to do.
function mintDemoLease() {
  if (session.model.availability !== "here") {
    setStatus("SESSION_PAUSED: bring the model back in before handing the work over.");
    return null;
  }
  if (!focusPacket) {
    setStatus("Point at a field before handing a job over.");
    return null;
  }
  const goal = $("#lease-goal").value.trim();
  if (!goal) {
    setStatus("A handed-over job needs a concrete task.");
    return null;
  }
  const now = Date.now();
  return {
    leaseId: `lease-${now}`,
    // GAP-01: a lease is a delegation grant now, not merely a scoped
    // capability list - authorizeSoloAction() requires a real human origin.
    // Both callers are reachable only from real button/actor clicks - their
    // handlers check event.isTrusted - so "human-click" is accurate here.
    origin: "human-click",
    goal,
    allowedCapabilityIds: focusPacket.capabilityIds.filter((id) => id !== "form.explain_field"),
    allowedTargetIds: [focusPacket.targetId],
    maxCalls: LEASE_MAX_CALLS,
    maxContextLevel: 2,
    pageVersion,
    expiresAt: new Date(now + LEASE_DURATION_MS).toISOString()
  };
}

/** One grant, one session lease: the panel's presence machine sees the Studio
 *  grant exactly as it sees the demo lease, so the area readout and the expiry
 *  clock stay true for both canvases. */
function adoptBuilderGrantAsLease(grant, humanPresence) {
  const lease = { ...grant, leaseId: grant.grantId, maxContextLevel: 2 };
  leaseCallsUsed = 0;
  if (humanPresence === "present") {
    const status = statusForWorkModeChoice("sparring-model", session);
    commitSession(
      "work-handed-over",
      transitionShowcaseSession(
        { ...session, lease, leaseCallsUsed: 0 },
        { type: "SET_STATUS", human: status.human, model: status.model }
      ),
      { causeRefs: [`lease:${lease.leaseId}`] }
    );
    return;
  }
  const at = new Date().toISOString();
  commitSession(
    "human-away",
    transitionShowcaseSession(session, {
      type: "HUMAN_AWAY",
      duration: humanPresence === "afk-long" ? "long" : "short",
      lease,
      area: lease.goal,
      now: at
    }),
    { causeRefs: [`lease:${lease.leaseId}`], at }
  );
}

/**
 * The Studio canvas hands over through the very same buttons: the text in
 * "Job to hand over" becomes the grant's goal. Staying and watching draws one
 * draft per click; stepping away lets the model spend the whole budget. What
 * the model may do is decided by the grant, never by who is present (GAP-01).
 */
async function builderHandover({ humanPresence, batch }) {
  if (session.model.availability !== "here") {
    setStatus("SESSION_PAUSED: bring the model back in before handing the work over.");
    return;
  }
  const goal = $("#lease-goal").value.trim();
  if (!goal) {
    setStatus("A handed-over job needs a concrete task.");
    return;
  }
  try {
    let grant = builderCowork.readActiveGrant();
    if (grant === null) {
      grant = builderCowork.startGrant({
        goal,
        maxCalls: BUILDER_GRANT_MAX_CALLS,
        durationMs: LEASE_DURATION_MS
      });
      adoptBuilderGrantAsLease(grant, humanPresence);
    }
    const drafted = batch
      ? await builderCowork.draftBatch(humanPresence)
      : (await builderCowork.draftOne(humanPresence))
        ? 1
        : 0;
    setStatus(
      drafted === 0
        ? `Nothing was drafted under "${grant.goal}": the budget of ${grant.maxCalls} is spent or the grant has expired.`
        : `The model drafted ${drafted} field${drafted === 1 ? "" : "s"} on the Studio canvas under your grant (${builderCowork.readCallsUsed()}/${grant.maxCalls} used).`
    );
  } catch (error) {
    setStatus(describeFailure(error));
  }
  render();
}

// Returns whether the job was actually handed over: mintDemoLease() refuses
// without a pointed-at field and a stated goal, and the caller has to know
// that rather than assume it worked.
function startAway(duration) {
  if (builderFocus !== null || builderCowork?.readActiveGrant()) {
    void builderHandover({
      humanPresence: duration === "long" ? "afk-long" : "afk-short",
      batch: true
    });
    return true;
  }
  const lease = mintDemoLease();
  if (lease === null) return false;
  const at = new Date().toISOString();
  leaseCallsUsed = 0;
  commitSession(
    "human-away",
    transitionShowcaseSession(session, {
      type: "HUMAN_AWAY",
      duration,
      lease,
      area: fieldLabelForTarget(lease.allowedTargetIds[0]) ?? lease.goal,
      now: at
    }),
    { causeRefs: [`lease:${lease.leaseId}`], at }
  );
  setStatus("The model works alone only inside the displayed two-minute field lease.");
  render();
  return true;
}

// Hand the job over and stay: the everyday case - you say what to do, the
// model executes inside the grant, you watch and advise.
function handOverWhileWatching() {
  if (builderFocus !== null || builderCowork?.readActiveGrant()) {
    void builderHandover({ humanPresence: "present", batch: false });
    return true;
  }
  const lease = mintDemoLease();
  if (lease === null) return false;
  const status = statusForWorkModeChoice("sparring-model", session);
  leaseCallsUsed = 0;
  commitSession(
    "work-handed-over",
    transitionShowcaseSession(
      { ...session, lease, leaseCallsUsed: 0 },
      { type: "SET_STATUS", human: status.human, model: status.model }
    ),
    { causeRefs: [`lease:${lease.leaseId}`] }
  );
  render();
  setStatus(`${$("#mode-detail").textContent} ${$("#authority-label").textContent}.`);
  return true;
}

function executeSoloAction({ capabilityId, targetId, value }) {
  if (!session.workMode.model.canExecute) {
    throw new CoworkProtocolError(
      "SESSION_PAUSED",
      "Solo work requires the click right; hand the work over first"
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
  // GAP-03: ending a Studio grant returns a bounded delta - what changed while
  // the model worked - and highlights those fields on the canvas.
  let builderDelta = null;
  if (builderCowork?.readActiveGrant()) {
    try {
      builderDelta = builderCowork.endGrant();
    } catch (error) {
      setStatus(describeFailure(error));
    }
  }
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
      area: focusPacket?.focus?.label ?? null,
      pendingQuestion: offers.length ? "Review the remaining action offer?" : null
    })
  );
  const summary = session.returnSummary;
  const message =
    builderDelta !== null
      ? `${builderDelta.summary} ${builderDelta.verifiedCount} verified, ${builderDelta.failedCount} failed.`
      : `${summary.verified} verified, ${summary.failed} failed.`;
  setStatus(`Welcome back. ${message}`);
  speak(`Welcome back. ${message}`);
  render();
}

function toggleAgent() {
  const transitionType =
    session.model.availability === "here" ? "AGENT_PAUSED" : "AGENT_RESUMED";
  commitSession(
    transitionType === "AGENT_RESUMED" ? "agent-resumed" : "agent-paused",
    transitionShowcaseSession(session, { type: transitionType })
  );
  setStatus(
    session.model.availability === "here"
      ? "Model back in. It advises again."
      : `Model on standby. ${workModeLabel(workModeChoiceId(session.workMode))}.`
  );
  render();
}

// One figure, one actor, four states: here-acting, here-observing, standby,
// away. The cycle starts from the *resolved* status, so a model whose
// authority the conflict rule already took moves on from what is displayed.
function cycleActorStatus(side) {
  const requested = { ...nextActorStatus(session.workMode[side]), area: session[side].area };
  commitSession(
    `${side}-status-changed`,
    transitionShowcaseSession(session, { type: "SET_STATUS", [side]: requested }),
    { payload: { side, ...requested } }
  );
  const resolved = session.workMode[side];
  setStatus(
    resolved.availability === requested.availability && resolved.role === requested.role
      ? `${workModeLabel(workModeChoiceId(session.workMode))}.`
      : "Both cannot act at once here. The hand on the mouse keeps the click right."
  );
  render();
}

// Choosing "sparring-model" in the work-mode select is a wish: it says what
// the human would like and still snaps back without a grant. Pressing the
// model's seat is not a wish, it is the gesture - a trusted click by the
// person who holds the authority, on the actor they are handing the job to.
// So the seat mints the grant the "Hand over, I'll watch" button mints, and
// the next press takes the job back. The select keeps its snap-back; nothing
// here weakens the rule that the model executes only inside a grant.
function cycleModelCockpit() {
  if (session.workMode.model.canExecute) {
    returnHuman();
    return;
  }
  const requested = nextActorStatus(session.workMode.model);
  if (requested.availability === "here" && requested.role === "executing") {
    // This step is reached from standby or away, so the model has to come in
    // before anything can be handed to it - both handover paths refuse a model
    // that is not here. Doing it first also gives the honest fallback for free:
    // if no grant can be minted we are already on advising, which is where the
    // status cycle was heading anyway, and the reason stays on screen.
    commitSession("model-status-changed", transitionShowcaseSession(session, {
      type: "SET_STATUS",
      model: { availability: "here", role: "advising", area: session.model.area }
    }));
    const handedOver = session.workMode.human.availability === "here"
      ? handOverWhileWatching()
      : startAway(session.humanPresence === "afk-long" ? "long" : "short");
    if (handedOver) return;
    const reason = $("#system-status").textContent;
    render();
    setStatus(`${reason} The model is advising instead.`);
    return;
  }
  cycleActorStatus("model");
}

function cycleHumanCockpit() {
  cycleActorStatus("human");
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
  // The button keeps its icon: only this label node ever changes.
  const talkLabel = talkButton.querySelector(".button-label");
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
      talkLabel.textContent = "Listening…";
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
      talkLabel.textContent = "Push to talk";
    }
  });
  talkButton.addEventListener("click", () => recognitionSession.start());
}

async function configureWebMcp() {
  try {
    // Two canvases, one lens, one set of tools: the sample form answers while
    // the human points there, the Studio answers while the human points there.
    coworkToolHandlers = {
      readFocus: () => {
        if (focusPacket) return focusPacket;
        const studioFocus = builderCowork?.readFocusPacket() ?? null;
        if (studioFocus !== null) return studioFocus;
        throw new CoworkProtocolError("STALE_FOCUS", "No FormBuilder field is focused");
      },
      requestContext: (input) => {
        if (focusPacket) return requestRelatedContext(input);
        if (!builderCowork) throw new CoworkProtocolError("STALE_FOCUS", "No FormBuilder field is focused");
        return builderCowork.requestContext(input);
      },
      offerAction: (input) => (focusPacket ? createVisibleOffer(input) : createVisibleStudioOffer(input)),
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
    };
    if (!document.modelContext || typeof document.modelContext.registerTool !== "function") {
      capabilityLevel = "unavailable";
      setStatus("WebMCP is unavailable in this browser. The local click-gated demo still works.");
      render();
      return;
    }
    registrationController = await registerNativeCoworkTools({
      modelContext: document.modelContext,
      ...reportAgentActivity(coworkToolHandlers)
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
    if (session.attentionMode === "pointer") setFocus(field);
  });
  field.addEventListener("click", () => {
    if (["pointer", "pinned"].includes(session.attentionMode)) setFocus(field);
  });
  const control = currentControl(field);
  control?.addEventListener("select", () => {
    if (["pointer", "selection"].includes(session.attentionMode)) setFocus(field);
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
    // GAP-06: the model watches and comments on a human's own change while it
    // is only advising (Explain-mode) - never on its own actions, never while
    // paused. Latest-only: this always overwrites, never accumulates.
    const schemaField = schemaFields.get(field.dataset.fieldId);
    const nextAdvisorComment = adviseCommentForHumanChange({
      change,
      advising: session.workMode.model.canPropose,
      label: schemaField?.label,
      required: schemaField?.required === true,
      emptyRequiredOtherCount: [...schemaFields.values()].filter(
        (candidate) =>
          candidate.id !== field.dataset.fieldId && candidate.required && !observedValues.get(candidate.id)
      ).length
    });
    // Latest-only in both directions: a later change that draws no comment
    // also clears the earlier one, so a stale count never resurfaces.
    advisorComment = nextAdvisorComment;
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
    endModelWorking();
    focusPacket = null;
    focusedField = null;
    fields.forEach((field) => field.classList.remove("is-focused"));
    // Off means off on both canvases, not just the demo form.
    builderCowork?.clearFocus();
    setStatus("Attention is off. No page context is sent.");
  } else if (focusedField) {
    focusPacket = buildFocus(focusedField, nextSession.attentionMode);
    if (focusPacket === null) {
      focusedField = null;
      fields.forEach((field) => field.classList.remove("is-focused"));
    }
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

$("#work-mode").addEventListener("change", (event) => {
  const choiceId = event.target.value;
  const picked = statusForWorkModeChoice(choiceId, session);
  commitSession(
    "work-mode-changed",
    transitionShowcaseSession(session, {
      type: "SET_STATUS",
      human: picked.human,
      model: picked.model
    }),
    { payload: { choiceId } }
  );
  const resolved = workModeChoiceId(session.workMode);
  setStatus(
    resolved === choiceId
      ? `${workModeLabel(choiceId)}.`
      : `${workModeLabel(choiceId)} is not in force: ${workModeLabel(resolved)}. ` +
        (session.workMode.authorityLapsed
          ? "A model executes only inside a granted job - hand one over below."
          : "Both execute at once only on different areas.")
  );
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
$("#demo-mode").addEventListener("change", (event) => {
  const seat = modelSeat.setDemo(event.target.checked);
  conversationTransportLabel = seat.transportLabel;
  setStatus(
    seat.kind === "demo"
      ? "Demo mode on: the scripted helper answers. No model is involved."
      : seat.kind === "none"
        ? "Demo mode off and no model connected: nothing will be proposed until you connect one."
        : `Demo mode off: ${seat.label} answers.`
  );
  render();
});
$("#model-connect-button").addEventListener("click", () => {
  try {
    const seat = modelSeat.connectDirect({
      endpoint: $("#model-endpoint").value,
      model: $("#model-id").value,
      apiKey: $("#model-key").value
    });
    conversationTransportLabel = seat.transportLabel;
    setStatus(
      `Direct model configured: ${seat.model} at ${new URL(seat.endpoint).host}. Not verified yet — use Test or send a turn; failures are shown as errors.`
    );
  } catch (error) {
    setStatus(`${error.code ?? "MODEL_SEAT_ERROR"}: ${error.message}`);
  }
  render();
});
$("#model-test-button").addEventListener("click", async () => {
  const button = $("#model-test-button");
  button.disabled = true;
  setStatus("Testing the connected model with one bounded turn…");
  try {
    const reply = await modelSeat.probe(
      createConversationTurn({
        transcript:
          "Reply with one short sentence confirming you received this bounded Cowork turn. Propose no offers.",
        focusPacket: null,
        presence: {
          humanPresence: session.humanPresence,
          agentPresence: session.agentPresence,
          mode: session.effectiveMode
        }
      })
    );
    setStatus(`Model test succeeded: ${String(reply?.message ?? "").slice(0, 160)}`);
  } catch (error) {
    setStatus(`Model test failed — ${error.code ?? "MODEL_ERROR"}: ${error.message}`);
  } finally {
    button.disabled = false;
    render();
  }
});
$("#model-disconnect-button").addEventListener("click", () => {
  const seat = modelSeat.disconnectDirect();
  conversationTransportLabel = seat.transportLabel;
  $("#model-key").value = "";
  setStatus(
    seat.kind === "none"
      ? "Direct model disconnected. No model is connected now."
      : `Direct model disconnected. ${seat.label} answers.`
  );
  render();
});
window.addEventListener("message", (event) => {
  if (
    event.source !== window ||
    event.data?.source !== "cowork-extension-native-request" ||
    extensionAttached
  ) {
    return;
  }
  extensionAttached = true;
  $("#extension-note").textContent =
    "Browser extension attached (Native route): it reads focus here and proposes into this panel; your clicks stay here. The side panel mirrors this panel, it does not replace it.";
  setStatus("Browser extension attached through the native page bridge.");
  render();
});
$("#detach-cowork").addEventListener("click", () => {
  void detachCoworkSurface();
});
$("#open-companion").addEventListener("click", () => {
  void openInCompanion();
});
$("#leave-companion").addEventListener("click", leaveCompanion);
$("#conversation-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void sendConversationTurn($("#conversation-input").value);
});
$("#hand-over").addEventListener("click", (event) => {
  if (event.isTrusted) handOverWhileWatching();
});
$("#away-short").addEventListener("click", (event) => {
  if (event.isTrusted) startAway("short");
});
$("#away-long").addEventListener("click", (event) => {
  if (event.isTrusted) startAway("long");
});
$("#return-human").addEventListener("click", returnHuman);
$("#toggle-agent").addEventListener("click", toggleAgent);
$("#human-seat").addEventListener("click", cycleHumanCockpit);
$("#model-seat").addEventListener("click", cycleModelCockpit);
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

// FormBuilder Studio (Build/Fill/Export) is a separate, cowork-free product
// surface (see builder-view.js); this is its only integration point with the
// Cowork Protocol machinery above, and it renders nothing of its own: the one
// panel serves both canvases. See ../INTEGRATION.md.
const builderController = initBuilderStudio(document);
builderCowork = initBuilderCowork({
  root: document,
  controller: builderController,
  modelSeat,
  attentionOn: () => session.attentionMode !== "off",
  onFocusChange(focus) {
    builderFocus = focus;
    if (focus !== null && focusedField !== null) {
      // The lens points at one place at a time; releasing the demo field here
      // (rather than through setFocus) keeps the two handlers from bouncing.
      focusedField = null;
      focusPacket = null;
      fields.forEach((candidate) => candidate.classList.remove("is-focused"));
    }
    render();
  }
});

// --- The workspace switcher (see WORKSPACE_AREAS above). Hiding a canvas
// releases its focus with it: a panel still pointing at a hidden field would
// be reporting attention nobody can act on. ---
const workspaceOrder = Object.keys(WORKSPACE_AREAS);

function selectWorkspace(area, { moveFocus = false } = {}) {
  activeWorkspace = area;
  for (const [id, entry] of Object.entries(WORKSPACE_AREAS)) {
    $(entry.tab).setAttribute("aria-selected", String(id === area));
    $(entry.panel).hidden = id !== area;
  }
  if (area === "studio") {
    focusedField = null;
    focusPacket = null;
    fields.forEach((field) => field.classList.remove("is-focused"));
  } else {
    builderCowork.clearFocus();
  }
  try {
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, area);
  } catch {
    // Private windows and blocked site data: the choice just is not remembered.
  }
  if (moveFocus) $(WORKSPACE_AREAS[area].tab).focus();
  render();
}

for (const [id, entry] of Object.entries(WORKSPACE_AREAS)) {
  const tab = $(entry.tab);
  tab.addEventListener("click", () => selectWorkspace(id));
  tab.addEventListener("keydown", (event) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = (workspaceOrder.indexOf(id) + step + workspaceOrder.length) % workspaceOrder.length;
    selectWorkspace(workspaceOrder[next], { moveFocus: true });
  });
}
selectWorkspace(activeWorkspace);

renderModelSeat();
