import { createLegacyHostCompanion } from "../../../packages/bridge/src/index.js";
import { CoworkProtocolError } from "../../../packages/core/src/index.js";
import { describeDomTarget, normalizeCompanionRequest } from "./protocol.js";

const ROOT_ID = "cowork-browser-companion-root";
const RESPONSE_SOURCE = "cowork-browser-companion";
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

function createSurface(documentLike) {
  const root = documentLike.createElement("div");
  root.id = ROOT_ID;
  root.style.position = "fixed";
  root.style.right = "18px";
  root.style.bottom = "18px";
  root.style.zIndex = "2147483647";
  const shadow = root.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .panel {
        box-sizing: border-box;
        width: min(340px, calc(100vw - 36px));
        border: 1px solid #d9b45b;
        border-radius: 18px;
        background: #fffdf7;
        color: #172033;
        box-shadow: 0 16px 44px rgb(36 29 16 / 22%);
        font: 600 14px/1.4 system-ui, sans-serif;
        padding: 14px;
      }
      .eyebrow { color: #8a5a05; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; }
      .status { margin: 5px 0 0; }
      .offer { margin-top: 12px; }
      button {
        width: 100%;
        border: 0;
        border-radius: 12px;
        background: #075985;
        color: white;
        cursor: pointer;
        font: 700 14px/1.3 system-ui, sans-serif;
        padding: 11px 12px;
        text-align: left;
      }
      button:focus-visible { outline: 3px solid #f59e0b; outline-offset: 3px; }
      .detail { color: #475569; font-size: 12px; font-weight: 500; margin-top: 5px; }
    </style>
    <section class="panel" aria-label="Cowork Browser Companion">
      <div class="eyebrow">Cowork fallback</div>
      <p class="status" role="status">Enabled · point at a control</p>
      <div class="detail">No WebMCP required · bounded context only</div>
      <div class="offer"></div>
    </section>`;
  documentLike.documentElement.append(root);
  return {
    root,
    status: shadow.querySelector(".status"),
    offer: shadow.querySelector(".offer")
  };
}

export function installBrowserCompanion({ document, window, runtime }) {
  if (!document || !window || !runtime) {
    throw new TypeError("Browser companion requires document, window and extension runtime");
  }

  let enabled = false;
  let surface = null;
  let companion = null;
  let currentElement = null;
  let pointer = { x: Math.round(window.innerWidth / 2), y: Math.round(window.innerHeight / 2) };
  let pageVersion = 0;
  let lastVisualDelivery = null;
  let lastTrustedHumanClick = false;
  const stableElements = new Map();

  const mutationObserver = new MutationObserver((records) => {
    if (!enabled) return;
    if (records.some((record) => !surface?.root.contains(record.target))) {
      pageVersion += 1;
    }
  });
  mutationObserver.observe(document.documentElement, {
    attributes: true,
    childList: true,
    subtree: true
  });

  function updateStatus(text) {
    if (surface) surface.status.textContent = text;
  }

  function targetAtFocus() {
    const active = semanticTarget(document.activeElement, surface?.root);
    if (active && document.activeElement !== document.body) return active;
    return currentElement ?? semanticTarget(
      document.elementFromPoint(pointer.x, pointer.y),
      surface?.root
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
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.coworkOfferId = offer.offerId;
        button.textContent = offer.summary;
        button.addEventListener("click", async (event) => {
          if (!event.isTrusted) {
            updateStatus("Ignored an untrusted synthetic click");
            return;
          }
          lastTrustedHumanClick = true;
          try {
            const result = await companion.host.confirmAction({
              offerId: offer.offerId,
              event: {
                origin: "human-click",
                offerId: offer.offerId,
                targetId: offer.targetId,
                pageVersion: offer.pageVersion,
                arguments: offer.proposedArguments
              },
              now: new Date().toISOString()
            });
            updateStatus(result.verified ? "Verified after your click" : "Verification failed");
            button.remove();
          } catch (error) {
            updateStatus(codeOnly(error).code);
          }
        });
        surface.offer.replaceChildren(button);
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

  function setEnabled(nextEnabled) {
    enabled = nextEnabled;
    currentElement = null;
    stableElements.clear();
    lastVisualDelivery = null;
    lastTrustedHumanClick = false;
    if (enabled) {
      surface ??= createSurface(document);
      surface.root.hidden = false;
      companion = createCompanion();
      updateStatus("Enabled · point at a control");
    } else {
      if (surface) surface.root.hidden = true;
      companion = null;
    }
    return state();
  }

  function state() {
    return {
      protocolVersion: "0.1",
      enabled,
      mode: enabled ? "legacy-host-companion" : "off",
      pageVersion,
      webMcpRequired: false,
      extensionTransport: true,
      browserWideAttachment: true,
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
      const candidate = semanticTarget(event.target, surface?.root);
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
    try {
      const result = await companion.agent[request.method](request.arguments);
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
      sendResponse(setEnabled(!enabled));
      return false;
    }
    if (message?.type === "cowork:get-state") {
      sendResponse(state());
      return false;
    }
    return false;
  });

  return { state, setEnabled, consumeVisualRegion };
}
