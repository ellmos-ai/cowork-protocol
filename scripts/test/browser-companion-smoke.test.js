import assert from "node:assert/strict";
import test from "node:test";

import {
  validateBrowserCompanionObservation
} from "../browser-companion-smoke-lib.mjs";

function acceptedObservation() {
  return {
    browserVersion: "Chrome/152.0.7977.64",
    relayAbsentBeforeAction: true,
    isolatedContextsBeforeAction: 0,
    webMcpAvailable: false,
    enabledState: {
      enabled: true,
      mode: "legacy-host-companion",
      extensionTransport: true,
      browserWideAttachment: true,
      surfaceLocation: "browser-side-panel",
      inPageUi: false,
      webMcpRequired: false
    },
    focus: {
      capabilityLevel: "legacy-dom",
      targetId: "legacy-dom:id:project-title",
      capabilityIds: ["legacy.explain_target", "legacy.offer_value"],
      metrics: { contextCharacters: 13 }
    },
    nearbyContext: { level: 1, nearbySemanticText: "N".repeat(350) },
    accessibilityContext: {
      level: 2,
      accessibilityRegionText: "A".repeat(1200)
    },
    visualContext: {
      level: 3,
      visualRequest: {
        kind: "pointer-region",
        maximumWidth: 400,
        maximumHeight: 400,
        maximumPixelArea: 160000
      },
      visualDelivery: {
        referenceId: "pointer-region:fixture",
        width: 400,
        height: 400,
        pixelArea: 160000,
        mimeType: "image/png",
        delivery: "extension-memory",
        source: "pointer-region"
      }
    },
    visualConsumption: {
      referenceId: "pointer-region:fixture",
      width: 400,
      height: 400,
      mimeType: "image/png",
      dataUrlPrefix: "data:image/png;base64,",
      dataUrlCharacters: 42000,
      replayCode: "VISUAL_REFERENCE_UNAVAILABLE"
    },
    offer: {
      valueBeforeOffer: "Draft",
      valueBeforeHumanClick: "Draft",
      visibleOfferCount: 1,
      pageUiInjected: false,
      visibleOfferText: "Use Cowork Everywhere as the project title"
    },
    click: {
      trusted: true,
      valueAfterHumanClick: "Cowork Everywhere",
      status: "Verified after your click"
    },
    disabledState: {
      enabled: false,
      mode: "off",
      inPageUi: false,
      pageUiAbsent: true
    }
  };
}

test("the browser companion validator accepts the complete no-WebMCP journey", () => {
  assert.deepEqual(
    validateBrowserCompanionObservation(acceptedObservation()),
    {
      browserCompanionClaim: true,
      browserVersion: "Chrome/152.0.7977.64",
      defaultDisabled: true,
      userInitiatedActiveTabClaim: true,
      extensionTransport: true,
      sidePanelSurfaceClaim: true,
      pageUiInjected: false,
      webMcpAbsent: true,
      semanticTierCharacters: [350, 1200],
      visualCaptureClaim: true,
      visualPixelArea: 160000,
      visualDeliveryOneShot: true,
      clickGatedMutation: true,
      trustedHumanClick: true,
      toggleOff: true,
      modelClientClaim: false,
      externalModelClaim: false,
      hostTokenClaim: false,
      fullPageContextDelivered: false
    }
  );
});

test("the validator rejects overbroad pixels and mutation before a human click", () => {
  const pixels = acceptedObservation();
  pixels.visualContext.visualDelivery.pixelArea = 160001;
  assert.throws(
    () => validateBrowserCompanionObservation(pixels),
    /160,000-pixel/
  );

  const premature = acceptedObservation();
  premature.offer.valueBeforeHumanClick = "Cowork Everywhere";
  assert.throws(
    () => validateBrowserCompanionObservation(premature),
    /before the trusted click/
  );
});

test("the validator refuses a WebMCP or model-client substitution", () => {
  const webMcp = acceptedObservation();
  webMcp.webMcpAvailable = true;
  assert.throws(
    () => validateBrowserCompanionObservation(webMcp),
    /without WebMCP/
  );
});

test("the validator rejects a relay that existed before the user action", () => {
  const persistent = acceptedObservation();
  persistent.relayAbsentBeforeAction = false;
  assert.throws(
    () => validateBrowserCompanionObservation(persistent),
    /absent before the user invokes/
  );
});
