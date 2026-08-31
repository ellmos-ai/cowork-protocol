function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

export function validateBrowserCompanionObservation(observed) {
  requireCondition(
    typeof observed?.browserVersion === "string" &&
      /^(Chrome|Edg)\//.test(observed.browserVersion),
    "The browser companion smoke requires a real Chromium browser version"
  );
  requireCondition(
    observed.defaultState?.enabled === false && observed.defaultState?.mode === "off",
    "The browser companion must be disabled by default"
  );
  requireCondition(
    observed.webMcpAvailable === false,
    "The fallback journey must run on a page without WebMCP"
  );
  requireCondition(
    observed.enabledState?.enabled === true &&
      observed.enabledState?.mode === "legacy-host-companion" &&
      observed.enabledState?.extensionTransport === true &&
      observed.enabledState?.browserWideAttachment === true &&
      observed.enabledState?.surfaceLocation === "browser-side-panel" &&
      observed.enabledState?.inPageUi === false &&
      observed.enabledState?.webMcpRequired === false,
    "The enabled extension must expose the legacy host companion transport"
  );
  requireCondition(
    observed.focus?.capabilityLevel === "legacy-dom" &&
      typeof observed.focus?.targetId === "string" &&
      observed.focus.targetId.startsWith("legacy-dom:") &&
      observed.focus.capabilityIds?.includes("legacy.offer_value") &&
      observed.focus.metrics?.contextCharacters <= 350,
    "The pointer lens must return one bounded stable legacy target"
  );
  const nearbyCharacters = observed.nearbyContext?.nearbySemanticText?.length;
  const accessibilityCharacters =
    observed.accessibilityContext?.accessibilityRegionText?.length;
  requireCondition(
    observed.nearbyContext?.level === 1 &&
      Number.isInteger(nearbyCharacters) &&
      nearbyCharacters > 0 &&
      nearbyCharacters <= 350,
    "The first context tier must be non-empty and bounded to 350 characters"
  );
  requireCondition(
    observed.accessibilityContext?.level === 2 &&
      Number.isInteger(accessibilityCharacters) &&
      accessibilityCharacters > 0 &&
      accessibilityCharacters <= 1200,
    "The second context tier must be non-empty and bounded to 1,200 characters"
  );
  const request = observed.visualContext?.visualRequest;
  const delivery = observed.visualContext?.visualDelivery;
  requireCondition(
    observed.visualContext?.level === 3 &&
      request?.kind === "pointer-region" &&
      request.maximumWidth <= 400 &&
      request.maximumHeight <= 400 &&
      request.maximumPixelArea <= 160000 &&
      delivery?.delivery === "extension-memory" &&
      delivery?.source === "pointer-region" &&
      delivery?.mimeType === "image/png" &&
      typeof delivery?.referenceId === "string" &&
      delivery.referenceId.startsWith("pointer-region:") &&
      delivery.width <= 400 &&
      delivery.height <= 400 &&
      delivery.pixelArea <= 160000,
    "The visual lens must produce only a stored pointer crop within the 160,000-pixel ceiling"
  );
  const visualConsumption = observed.visualConsumption;
  requireCondition(
    visualConsumption?.referenceId === delivery.referenceId &&
      visualConsumption.width === delivery.width &&
      visualConsumption.height === delivery.height &&
      visualConsumption.mimeType === "image/png" &&
      visualConsumption.dataUrlPrefix === "data:image/png;base64," &&
      visualConsumption.dataUrlCharacters > visualConsumption.dataUrlPrefix.length &&
      visualConsumption.replayCode === "VISUAL_REFERENCE_UNAVAILABLE",
    "The pointer crop must be consumable exactly once without exposing the full screenshot"
  );
  requireCondition(
    observed.offer?.valueBeforeOffer === "Draft" &&
      observed.offer?.valueBeforeHumanClick === "Draft" &&
      observed.offer?.visibleOfferCount === 1 &&
      observed.offer?.pageUiInjected === false,
    "The extension must not mutate the field before the trusted click"
  );
  requireCondition(
    observed.click?.trusted === true &&
      observed.click?.valueAfterHumanClick === "Cowork Everywhere" &&
      observed.click?.status === "Verified after your click",
    "A trusted human click must apply and verify the exact visible value"
  );
  requireCondition(
    observed.disabledState?.enabled === false &&
      observed.disabledState?.mode === "off" &&
      observed.disabledState?.inPageUi === false &&
      observed.disabledState?.pageUiAbsent === true,
    "The extension must return to an off state without injecting a page UI"
  );

  return {
    browserCompanionClaim: true,
    browserVersion: observed.browserVersion,
    defaultDisabled: true,
    extensionTransport: true,
    sidePanelSurfaceClaim: true,
    pageUiInjected: false,
    webMcpAbsent: true,
    semanticTierCharacters: [nearbyCharacters, accessibilityCharacters],
    visualCaptureClaim: true,
    visualPixelArea: delivery.pixelArea,
    visualDeliveryOneShot: true,
    clickGatedMutation: true,
    trustedHumanClick: true,
    toggleOff: true,
    modelClientClaim: false,
    externalModelClaim: false,
    hostTokenClaim: false,
    fullPageContextDelivered: false
  };
}
