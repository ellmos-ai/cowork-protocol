import { createLegacyHostCompanion } from "../../../packages/bridge/src/index.js";
import {
  CoworkProtocolError,
  resolveWorkMode,
  toLegacyPresence
} from "../../../packages/core/src/index.js";
import { buildWorkModePresentation } from "../../../packages/reference-ui/src/index.js";
import { describeDomTarget, normalizeCompanionRequest } from "./protocol.js";
import { createNativePageClient } from "./native-page-client.js";
import { nextAvailableStatus } from "./cockpit-presentation.js";

const RESPONSE_SOURCE = "cowork-browser-companion";
// How long an agent stays "on the bridge" after its last tool call. A slow
// model turn plus a tool round trip runs tens of seconds, so anything much
// shorter would keep throwing a working agent off mid-turn; anything much
// longer leaves a full panel standing in front of a person whose agent
// stopped answering. A standing offer holds the bridge open past this, because
// an offer waiting for a click is an agent still waiting for an answer.
export const AGENT_IDLE_TIMEOUT_MS = 90_000;
const TARGET_SELECTOR = [
  "input",
  "textarea",
  "select",
  "button",
  "a[href]",
  "[role]",
  "[contenteditable='true']"
].join(",");

function codeOnly(error) {
  return {
    code:
      typeof error?.code === "string" && /^[A-Z0-9_:-]{1,64}$/.test(error.code)
        ? error.code
        : "COMPANION_REQUEST_FAILED"
  };
}

function semanticTarget(rawTarget, root) {
  if (!(rawTarget instanceof Element) || root?.contains(rawTarget)) return null;
  return rawTarget.closest(TARGET_SELECTOR) ?? rawTarget;
}

function regionText(element) {
  const region = element.closest(
    "fieldset,form,section,article,main,aside,nav,[role='group'],[role='region']"
  );
  return (region ?? element.parentElement ?? element).innerText ?? "";
}

function accessibilityText(element, documentLike) {
  const region = element.closest(
    "fieldset,form,section,article,main,aside,nav,[role='group'],[role='region']"
  ) ?? element.parentElement ?? documentLike.body;
  return [...region.querySelectorAll(TARGET_SELECTOR)]
    .slice(0, 30)
    .map((candidate) => {
      const target = describeDomTarget(candidate, documentLike);
      return `${target.role}: ${target.label}`;
    })
    .join("\n");
}

export function installBrowserCompanion({
  document,
  window,
  runtime,
  agentIdleTimeoutMs = AGENT_IDLE_TIMEOUT_MS,
  now = () => Date.now()
}) {
  if (!document || !window || !runtime) {
    throw new TypeError("Browser companion requires document, window and extension runtime");
  }
  if (!Number.isFinite(agentIdleTimeoutMs) || agentIdleTimeoutMs <= 0) {
    throw new TypeError("Browser companion requires a positive agent idle timeout");
  }

  let enabled = false;
  let companion = null;
  let currentElement = null;
  let pointer = { x: Math.round(window.innerWidth / 2), y: Math.round(window.innerHeight / 2) };
  let pageVersion = 0;
  let lastVisualDelivery = null;
  let lastTrustedHumanClick = false;
  let statusText = "Off";
  let pendingOffer = null;
  let pendingOfferContract = null;
  let runtimeMode = "off";
  let nativeDiscovery = null;
  let toolsRegistered = false;
  // When an agent last spoke to this bridge. Panel controls are the human's
  // own hand and never count: an empty bridge must stay empty while you click.
  let lastAgentActivityAt = null;
  // Three status variables per actor: who is here, what they are working on,
  // and whether they execute or advise. The work mode, the click right and
  // the 0.1 presence values on the wire are all derived from these.
  let human = { availability: "here", role: "executing" };
  let model = { availability: "away", role: "advising" };
  // No Session Authority in this extension mints a grant, so the model's
  // authority record is absent - it can advise, never execute. Leaving is
  // gated on the same record.
  let soloLeaseValid = false;
  let contextLevel = 0;
  let focusLabel = "Point to a page control";
  let focusDetail = "No page content requested yet";
  const stableElements = new Map();
  const nativePageClient = createNativePageClient({ window });

  const mutationObserver = new MutationObserver((records) => {
    if (!enabled) return;
    if (records.length > 0) pageVersion += 1;
  });
  mutationObserver.observe(document.documentElement, {
    attributes: true,
    childList: true,
    subtree: true
  });

  // Which page, task or field the two are on. One relayed page means one
  // shared area - this extension cannot confine two workers to different
  // areas, so it never offers doubling.
  function currentArea() {
    if (!enabled) return null;
    const title = typeof document.title === "string" ? document.title.trim() : "";
    return title === "" ? window.location?.hostname ?? "this page" : title.slice(0, 60);
  }

  function actors() {
    const area = currentArea();
    return {
      human: { ...human, area },
      model: { ...model, area: model.availability === "away" ? null : area }
    };
  }

  function workMode() {
    return resolveWorkMode({
      ...actors(),
      // The grant is the only authority record. A present human is not one.
      modelAuthorityValid: soloLeaseValid
    });
  }

  function publishSurfaceState() {
    try {
      const request = runtime.sendMessage({
        type: "cowork:surface-state",
        state: state()
      });
      request?.catch?.(() => {});
    } catch {
      // The relay remains usable if no Side Panel listener is currently alive.
    }
  }

  function updateStatus(text) {
    statusText = text;
    publishSurfaceState();
  }

  function targetAtFocus() {
    const active = semanticTarget(document.activeElement, null);
    if (active && document.activeElement !== document.body) return active;
    return currentElement ?? semanticTarget(
      document.elementFromPoint(pointer.x, pointer.y),
      null
    );
  }

  function createCompanion() {
    return createLegacyHostCompanion({
      sessionId: `extension:${crypto.randomUUID()}`,
      getTargetSnapshot: async ({ lens }) => {
        const element = targetAtFocus();
        if (!element) {
          throw new CoworkProtocolError(
            "LEGACY_TARGET_REQUIRED",
            "Point at or focus a page target first"
          );
        }
        const target = describeDomTarget(element, document);
        if (target.stableId) stableElements.set(target.stableId, element);
        focusLabel = target.label;
        focusDetail = target.role;
        contextLevel = 0;
        updateStatus(`${lens === "selection" ? "Selected" : "Pointing at"}: ${target.label}`);
        return { pageVersion, target };
      },
      getNearbySemanticText: async () => regionText(targetAtFocus()),
      getAccessibilityRegionText: async () => accessibilityText(targetAtFocus(), document),
      requestVisualRegion: async ({ request }) => {
        const response = await runtime.sendMessage({
          type: "cowork:capture-visible-tab",
          request,
          viewport: { width: window.innerWidth, height: window.innerHeight }
        });
        if (!response?.ok) {
          const error = new CoworkProtocolError(
            response?.code ?? "VISUAL_PROVIDER_UNAVAILABLE",
            "The extension could not capture the bounded pointer region"
          );
          throw error;
        }
        lastVisualDelivery = response.result;
        return response.result;
      },
      presentActionOffer: async ({ offer }) => {
        pendingOfferContract = offer;
        pendingOffer = {
          offerId: offer.offerId,
          summary: offer.summary
        };
        updateStatus("Offer waiting for your approval");
      },
      executeAuthorizedAction: async ({ offer }) => {
        if (pageVersion !== offer.pageVersion) {
          throw new CoworkProtocolError(
            "STALE_PAGE_VERSION",
            "The page changed before the action was authorized"
          );
        }
        const element = stableElements.get(offer.targetId.replace(/^legacy-dom:/, ""));
        const value = offer.proposedArguments?.value;
        if (
          !element?.isConnected ||
          !["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName) ||
          typeof value !== "string"
        ) {
          throw new CoworkProtocolError(
            "CAPABILITY_UNAVAILABLE",
            "The stable value target is no longer available"
          );
        }
        element.value = value;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        if (element.value !== value) {
          return { verified: false };
        }
        pageVersion += 1;
        return { verified: true, observedValue: element.value, pageVersion };
      }
    });
  }

  function createNativeCompanion(discovery) {
    const toolNames = new Set(discovery.tools.map(({ name }) => name));
    async function execute(toolName, input = {}) {
      if (!toolNames.has(toolName)) {
        throw new CoworkProtocolError(
          "NATIVE_COWORK_TOOL_UNAVAILABLE",
          `The page does not expose ${toolName}`
        );
      }
      return nativePageClient.executeTool(toolName, input);
    }
    return {
      agent: {
        readFocus: () => execute("cowork_read_focus"),
        requestContext: (input) => execute("cowork_request_context", {
          reason:
            typeof input?.reason === "string" && input.reason.trim() !== ""
              ? input.reason.slice(0, 200)
              : "The bounded focus packet needs one related context level."
        }),
        offerAction: (input) => execute("cowork_offer_action", {
          capabilityId: input.capabilityId,
          targetId: input.targetId,
          value: input.value ?? input.proposedArguments?.value,
          summary: input.summary
        })
      }
    };
  }

  async function confirmPendingOffer({ offerId, humanGesture }) {
    if (humanGesture !== true || pendingOffer?.offerId !== offerId || !companion) {
      throw new CoworkProtocolError(
        "HUMAN_CONFIRMATION_REQUIRED",
        "The current Side Panel offer requires an explicit human click"
      );
    }
    lastTrustedHumanClick = true;
    const offer = pendingOfferContract;
    const result = await companion.host.confirmAction({
      offerId,
      event: {
        origin: "human-click",
        offerId,
        targetId: offer.targetId,
        pageVersion: offer.pageVersion,
        arguments: offer.proposedArguments
      },
      now: new Date().toISOString()
    });
    pendingOffer = null;
    pendingOfferContract = null;
    updateStatus(result.verified ? "Verified after your click" : "Verification failed");
    return state();
  }

  function recordFocus(result) {
    focusLabel = result?.target?.label ?? result?.label ?? result?.targetId ?? "Focused control";
    focusDetail = result?.capabilityLevel
      ? `${result.capabilityLevel} · ${(result.capabilityIds ?? []).length} capabilities`
      : result?.target?.role ?? "Bounded page focus";
    contextLevel = 0;
    updateStatus(`Focused: ${focusLabel}`);
    return state();
  }

  async function readCurrentFocus() {
    if (!enabled || !companion) {
      throw new CoworkProtocolError("COMPANION_DISABLED", "Start Cowork before reading focus");
    }
    return recordFocus(await companion.agent.readFocus({ lens: "pointer" }));
  }

  async function requestCurrentContext() {
    if (!enabled || !companion) {
      throw new CoworkProtocolError("COMPANION_DISABLED", "Start Cowork before requesting context");
    }
    if (contextLevel >= 3) {
      throw new CoworkProtocolError(
        "CONTEXT_LIMIT_REACHED",
        "The one-shot visual context level is already reached"
      );
    }
    const result = await companion.agent.requestContext({
      currentLevel: contextLevel,
      requestedLevel: contextLevel + 1,
      reason: "The human requested one more bounded context level from the Cockpit.",
      pointer
    });
    const returnedLevel = Number.isInteger(result?.requestedLevel)
      ? result.requestedLevel
      : Number.isInteger(result?.currentLevel)
        ? result.currentLevel
        : contextLevel + 1;
    contextLevel = Math.min(3, Math.max(contextLevel + 1, returnedLevel));
    focusDetail = contextLevel === 3
      ? "One visual lens granted"
      : "Related page semantics granted";
    updateStatus(`Context level ${contextLevel} granted`);
    return state();
  }

  // Every status sentence comes from packages/reference-ui - this surface
  // never writes status words of its own.
  function statusSentence() {
    return buildWorkModePresentation(workMode()).modeDetail;
  }

  async function cycleModelStatus() {
    const next = nextAvailableStatus(workMode().model, (candidate) =>
      // Executing needs a grant with goal, budget and expiry; this extension
      // issues none, so the model here advises or stands by.
      candidate.availability === "here" && candidate.role === "executing" && !soloLeaseValid
    );
    if (next === null || next.availability === "away") {
      // Detaching is how the seat really goes away here.
      await setEnabled(false);
      return state();
    }
    if (!enabled) await setEnabled(true);
    model = next;
    updateStatus(statusSentence());
    return state();
  }

  function cycleHumanStatus() {
    const next = nextAvailableStatus(
      workMode().human,
      // Leaving needs the same grant, so the figure cycles the two statuses it
      // really has instead of stranding you on the last one it could reach.
      (candidate) => candidate.availability !== "here" && !soloLeaseValid
    );
    if (next === null) return state();
    if (next.availability !== "here" && !soloLeaseValid) return state();
    human = next;
    updateStatus(
      human.availability === "here" && human.role === "advising" && !soloLeaseValid
        ? "Advising only: without a grant the model cannot take the click right from you."
        : statusSentence()
    );
    return state();
  }

  async function setEnabled(nextEnabled) {
    enabled = nextEnabled;
    currentElement = null;
    stableElements.clear();
    lastVisualDelivery = null;
    lastTrustedHumanClick = false;
    pendingOffer = null;
    pendingOfferContract = null;
    nativeDiscovery = null;
    toolsRegistered = false;
    lastAgentActivityAt = null;
    contextLevel = 0;
    focusLabel = "Point to a page control";
    focusDetail = "No page content requested yet";
    if (enabled) {
      model = { availability: "here", role: "advising" };
      try {
        nativeDiscovery = await nativePageClient.discover();
      } catch {
        nativeDiscovery = null;
      }
      if (nativeDiscovery?.mode === "native-cowork") {
        runtimeMode = "native-cowork";
        companion = createNativeCompanion(nativeDiscovery);
        updateStatus(`Native Cowork connected · ${nativeDiscovery.coworkToolCount} tools`);
      } else {
        // Every page without Cowork tools of its own gets the bounded bridge -
        // including one that merely has other WebMCP tools, which previously
        // produced a companion that could answer nothing.
        runtimeMode = "legacy-host-companion";
        companion = createCompanion();
        // Registered tools must never route back through the page's WebMCP,
        // or a tool would call itself; the bridge answers them directly.
        toolsRegistered = await registerPageTools();
        updateStatus(
          toolsRegistered
            ? "Cowork tools registered here · any WebMCP agent may read and propose"
            : "Fallback enabled · point at a control"
        );
      }
    } else {
      companion = null;
      runtimeMode = "off";
      model = { availability: "away", role: "advising" };
      try {
        await nativePageClient.unregisterTools();
      } catch {
        // The relay may already be gone with the page; nothing left to revoke.
      }
      toolsRegistered = false;
      updateStatus("Off");
    }
    return state();
  }

  // Puts this extension's Cowork tools on a page that has none, so any WebMCP
  // agent in this browser reaches the same bounded relay the panel uses.
  async function registerPageTools() {
    try {
      const result = await nativePageClient.registerTools();
      return Array.isArray(result?.registered) && result.registered.length > 0;
    } catch {
      return false;
    }
  }

  function state() {
    const { workMode: _workMode, ...legacyPresence } = toLegacyPresence(workMode());
    return {
      protocolVersion: "0.1",
      enabled,
      mode: runtimeMode,
      executionMode: "structured",
      pageVersion,
      webMcpRequired: false,
      webMcpAvailable: nativeDiscovery?.webMcpAvailable === true,
      coworkProtocolAvailable: nativeDiscovery?.coworkProtocolAvailable === true,
      nativeToolCount: nativeDiscovery?.tools?.length ?? 0,
      toolsRegistered,
      // The page draws its own Cowork panel, so this bridge steps aside.
      pageOwnsBridge: nativeDiscovery?.pageOwnsBridge === true,
      companionConnected: nativeDiscovery?.companionConnected === true,
      agentLastSeenAt: lastAgentActivityAt,
      agentIdleTimeoutMs,
      fallbackActive: runtimeMode === "legacy-host-companion",
      extensionTransport: true,
      browserWideAttachment: true,
      surfaceLocation: "browser-side-panel",
      // Which page this bridge is looking at, for the line it shows at rest.
      origin: window.location?.origin ?? null,
      inPageUi: false,
      statusText,
      ...actors(),
      modelAuthorityValid: soloLeaseValid,
      // 0.1 wire mirrors, derived - never set by hand.
      ...legacyPresence,
      soloLeaseValid,
      contextLevel,
      focusLabel,
      focusDetail,
      pendingOffer,
      visualRegionStored: Boolean(lastVisualDelivery),
      visualDelivery: lastVisualDelivery,
      lastTrustedHumanClick
    };
  }

  async function consumeVisualRegion(referenceId) {
    if (
      typeof referenceId !== "string" ||
      !/^pointer-region:[0-9a-f-]{36}$/i.test(referenceId)
    ) {
      throw new CoworkProtocolError(
        "INVALID_VISUAL_REFERENCE",
        "A valid pointer-region reference is required"
      );
    }
    const response = await runtime.sendMessage({
      type: "cowork:consume-visual-region",
      referenceId
    });
    if (!response?.ok) {
      throw new CoworkProtocolError(
        response?.code ?? "VISUAL_REFERENCE_UNAVAILABLE",
        "The bounded visual reference is unavailable"
      );
    }
    return response.result;
  }

  document.addEventListener(
    "pointermove",
    (event) => {
      if (!enabled) return;
      pointer = { x: event.clientX, y: event.clientY };
      const candidate = semanticTarget(event.target, null);
      if (candidate) currentElement = candidate;
    },
    { capture: true, passive: true }
  );

  window.addEventListener("message", async (event) => {
    if (event.source !== window) return;
    const request = normalizeCompanionRequest(event.data);
    if (!request) return;
    if (!enabled || !companion) {
      window.postMessage({
        source: RESPONSE_SOURCE,
        protocolVersion: "0.1",
        requestId: request.requestId,
        ok: false,
        error: { code: "COMPANION_DISABLED" }
      }, "*");
      return;
    }
    // A request that reaches this point comes from an agent, not from the
    // panel: the panel talks over the extension runtime channel instead.
    lastAgentActivityAt = now();
    try {
      // An advising model still proposes - the human clicks. Only a model on
      // standby proposes nothing.
      if (model.availability === "standby" && request.method === "offerAction") {
        throw new CoworkProtocolError(
          "SESSION_READ_ONLY",
          "A model on standby proposes nothing"
        );
      }
      const result = request.method === "readPresence"
        ? { ...actors(), modelAuthorityValid: soloLeaseValid, mode: runtimeMode }
        : await companion.agent[request.method](request.arguments);
      window.postMessage({
        source: RESPONSE_SOURCE,
        protocolVersion: "0.1",
        requestId: request.requestId,
        ok: true,
        result
      }, "*");
    } catch (error) {
      window.postMessage({
        source: RESPONSE_SOURCE,
        protocolVersion: "0.1",
        requestId: request.requestId,
        ok: false,
        error: codeOnly(error)
      }, "*");
    }
  });

  runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "cowork:toggle") {
      setEnabled(!enabled)
        .then(sendResponse)
        .catch((error) => sendResponse({ error: codeOnly(error) }));
      return true;
    }
    if (message?.type === "cowork:set-enabled") {
      setEnabled(message.enabled === true)
        .then(sendResponse)
        .catch((error) => sendResponse({ error: codeOnly(error) }));
      return true;
    }
    if (message?.type === "cowork:get-state") {
      sendResponse(state());
      return false;
    }
    if (message?.type === "cowork:read-focus") {
      readCurrentFocus()
        .then((result) => sendResponse({ ok: true, state: result }))
        .catch((error) => sendResponse({ ok: false, error: codeOnly(error) }));
      return true;
    }
    if (message?.type === "cowork:request-context") {
      requestCurrentContext()
        .then((result) => sendResponse({ ok: true, state: result }))
        .catch((error) => sendResponse({ ok: false, error: codeOnly(error) }));
      return true;
    }
    if (message?.type === "cowork:cycle-model-engagement") {
      cycleModelStatus()
        .then((result) => sendResponse({ ok: true, state: result }))
        .catch((error) => sendResponse({ ok: false, error: codeOnly(error) }));
      return true;
    }
    if (message?.type === "cowork:cycle-human-presence") {
      try {
        sendResponse({ ok: true, state: cycleHumanStatus() });
      } catch (error) {
        sendResponse({ ok: false, error: codeOnly(error) });
      }
      return false;
    }
    if (message?.type === "cowork:confirm-offer") {
      confirmPendingOffer(message)
        .then((result) => sendResponse({ ok: true, state: result }))
        .catch((error) => sendResponse({ ok: false, error: codeOnly(error) }));
      return true;
    }
    return false;
  });

  publishSurfaceState();
  return {
    state,
    setEnabled,
    request: async (method, argumentsValue = {}) => {
      if (!enabled || !companion) {
        throw new CoworkProtocolError("COMPANION_DISABLED", "Cowork Companion is disabled");
      }
      const operation = companion.agent[method];
      if (typeof operation !== "function") {
        throw new CoworkProtocolError(
          "COMPANION_METHOD_UNAVAILABLE",
          "The requested Cowork operation is unavailable"
        );
      }
      return operation(argumentsValue);
    },
    consumeVisualRegion,
    confirmPendingOffer
  };
}
