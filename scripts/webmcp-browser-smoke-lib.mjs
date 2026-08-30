const EXPECTED_TOOL_NAMES = Object.freeze([
  "cowork_execute_solo",
  "cowork_offer_action",
  "cowork_read_changes",
  "cowork_read_feedback",
  "cowork_read_focus",
  "cowork_read_presence",
  "cowork_request_context"
]);

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

export function validateNativeWebMcpObservation(observed) {
  requireCondition(observed && typeof observed === "object", "Browser observation is required");
  requireCondition(observed.secureContext === true, "WebMCP smoke requires a secure context");
  requireCondition(
    observed.modelContextAvailable === true &&
      observed.methods?.registerTool === "function" &&
      observed.methods?.getTools === "function" &&
      observed.methods?.executeTool === "function",
    "The native document.modelContext surface is incomplete"
  );
  requireCondition(observed.badge === "Native WebMCP", "The showcase did not report Native WebMCP");

  const toolNames = Array.isArray(observed.toolNames) ? [...observed.toolNames].sort() : [];
  requireCondition(
    JSON.stringify(toolNames) === JSON.stringify(EXPECTED_TOOL_NAMES),
    "Expected exactly the seven Cowork tools"
  );

  const focus = observed.focusExecution?.packet;
  const context = observed.contextExecution?.packet;
  const focusCharacters = focus?.metrics?.contextCharacters;
  const expandedCharacters = context?.metrics?.includedContextCharacters;
  const sourceCharacters = context?.metrics?.sourceContextCharacters;

  requireCondition(
    focus?.type === "focus" &&
      typeof focus.targetId === "string" &&
      Number.isInteger(focus.pageVersion) &&
      isNonNegativeInteger(focusCharacters) &&
      focusCharacters <= 350,
    "The native focus result is missing, stale, or over its 350-character budget"
  );
  requireCondition(
    context?.type === "context-expansion" &&
      context.targetId === focus.targetId &&
      context.pageVersion === focus.pageVersion &&
      context.oneShot === true &&
      Number.isInteger(context.currentLevel) &&
      context.level === context.currentLevel + 1 &&
      isNonNegativeInteger(expandedCharacters) &&
      expandedCharacters <= 1200 &&
      isNonNegativeInteger(sourceCharacters) &&
      sourceCharacters >= expandedCharacters,
    "The one-shot context expansion must stay within 1,200 adapter characters"
  );

  const offerExecutions = Array.isArray(observed.offerExecutions)
    ? observed.offerExecutions
    : [];
  const clickObservations = Array.isArray(observed.humanClickObservations)
    ? observed.humanClickObservations
    : [];
  requireCondition(
    offerExecutions.length === 2 && clickObservations.length === 2,
    "The browser must complete exactly two visible offer and human-click cycles"
  );

  let valueBeforeHumanClick = "";
  const seenOfferIds = new Set();
  for (let index = 0; index < offerExecutions.length; index += 1) {
    const offer = offerExecutions[index]?.packet;
    const click = clickObservations[index];
    const proposedValue = offer?.proposedArguments?.value;
    requireCondition(
      offer?.type === "action-offer" &&
        typeof offer.offerId === "string" &&
        !seenOfferIds.has(offer.offerId) &&
        offer.capabilityId === "form.set_value" &&
        offer.targetId === focus.targetId &&
        offer.pageVersion === focus.pageVersion + index &&
        typeof proposedValue === "string" &&
        proposedValue.length > 0 &&
        offer.requiresHumanConfirmation === true,
      "Each native offer must be visible, unique, target-bound, and click-gated"
    );
    seenOfferIds.add(offer.offerId);
    requireCondition(
      click?.valueBeforeHumanClick === valueBeforeHumanClick &&
        click.visibleOfferValue === proposedValue,
      "The offer must remain inert until the human click"
    );
    requireCondition(
      click.inputValueAfterClick === proposedValue &&
        typeof click.receiptStatusText === "string" &&
        click.receiptStatusText.startsWith("Verified:") &&
        click.receiptStatusText.includes(proposedValue),
      "The trusted human click must apply and verify the exact visible value"
    );
    valueBeforeHumanClick = proposedValue;
  }

  const latestOffer = offerExecutions.at(-1).packet;
  const changeSnapshot = observed.changeExecution?.packet;
  const latestChange = changeSnapshot?.latest;
  requireCondition(
    changeSnapshot?.type === "change-snapshot" &&
      changeSnapshot.totalCount === 2 &&
      changeSnapshot.omittedCount === 1 &&
      !Array.isArray(changeSnapshot.events) &&
      latestChange?.type === "change" &&
      typeof latestChange.changeId === "string" &&
      latestChange.source === "agent" &&
      latestChange.targetIds?.length === 1 &&
      latestChange.targetIds[0] === focus.targetId &&
      latestChange.pageVersion === focus.pageVersion + 2 &&
      latestChange.causeRefs?.includes(`offer:${latestOffer.offerId}`) &&
      latestChange.causeRefs?.includes("authorization:human-click") &&
      latestChange.causalityConfidence === "high",
    "The latest-only change readback must retain the trusted click cause"
  );

  const feedbackSnapshot = observed.feedbackExecution?.packet;
  const latestFeedback = feedbackSnapshot?.latest;
  requireCondition(
    feedbackSnapshot?.type === "feedback-snapshot" &&
      feedbackSnapshot.totalCount === 2 &&
      feedbackSnapshot.omittedCount === 1 &&
      !Array.isArray(feedbackSnapshot.events) &&
      latestFeedback?.type === "feedback" &&
      latestFeedback.source === "human" &&
      latestFeedback.origin === "human-click" &&
      latestFeedback.relatedOfferId === latestOffer.offerId &&
      latestFeedback.relatedChangeIds?.length === 1 &&
      latestFeedback.relatedChangeIds[0] === latestChange.changeId &&
      latestFeedback.verdict === "accepted" &&
      latestFeedback.adjustment === "" &&
      latestFeedback.pageVersion === latestChange.pageVersion,
    "The latest feedback must be click-authenticated and bound to the latest offer"
  );

  const argumentKinds = [
    observed.focusExecution?.argumentKind,
    observed.contextExecution?.argumentKind,
    ...offerExecutions.map((execution) => execution.argumentKind),
    observed.changeExecution?.argumentKind,
    observed.feedbackExecution?.argumentKind
  ];
  requireCondition(
    argumentKinds.every((kind) => kind === "object" || kind === "json-string"),
    "The browser did not execute both read-only tools"
  );
  requireCondition(
    typeof observed.browserVersion === "string" && observed.browserVersion.length > 0,
    "The browser version is required for live evidence"
  );

  return {
    browserClaim: true,
    agentClientClaim: false,
    browserVersion: observed.browserVersion,
    discoveredTools: toolNames.length,
    focusContextCharacters: focusCharacters,
    expandedContextCharacters: expandedCharacters,
    verifiedHumanClicks: clickObservations.length,
    latestChangeOmittedCount: changeSnapshot.omittedCount,
    latestFeedbackOmittedCount: feedbackSnapshot.omittedCount,
    executeArgumentKinds: argumentKinds
  };
}

export function validateBrowserHostBridgeObservation(observed) {
  requireCondition(
    observed && typeof observed === "object",
    "Browser-host bridge observation is required"
  );
  const catalog = observed.catalog;
  const capabilities = Array.isArray(catalog?.capabilities) ? catalog.capabilities : [];
  requireCondition(
    catalog?.mode === "webmcp-bridge" &&
      catalog.discovery === "host-supplied" &&
      capabilities.length === 2 &&
      Array.isArray(catalog.rejected) &&
      catalog.rejected.length === 0,
    "The bridge catalog must be explicitly host-supplied and fully classified"
  );

  const readCapability = capabilities.find(
    (capability) => capability.hostToolName === "calendar_read_slots"
  );
  const mutationCapability = capabilities.find(
    (capability) => capability.hostToolName === "calendar_book_slot"
  );
  requireCondition(
    readCapability?.capabilityId === "webmcp:calendar_read_slots" &&
      readCapability.access === "read-execute" &&
      readCapability.parameterNames?.length === 1 &&
      readCapability.parameterNames[0] === "date" &&
      JSON.stringify(readCapability).length <= 350 &&
      mutationCapability?.capabilityId === "webmcp:calendar_book_slot" &&
      mutationCapability.access === "offer-only" &&
      mutationCapability.parameterNames?.length === 2 &&
      JSON.stringify(mutationCapability).length <= 350,
    "The host catalog must expose one bounded read and one offer-only mutation"
  );

  requireCondition(
    JSON.stringify(observed.smallResult) ===
      JSON.stringify({ date: "2026-09-01", slots: ["09:00", "10:30"] }),
    "The browser host did not return the expected normalized read result"
  );

  const hostCalls = Array.isArray(observed.hostCalls) ? observed.hostCalls : [];
  requireCondition(
    hostCalls.length === 2 &&
      hostCalls.every((call) => call?.name === "calendar_read_slots") &&
      hostCalls[0]?.arguments?.date === "2026-09-01" &&
      hostCalls[1]?.arguments?.date === "large-result",
    "Mutating host tools must remain offer-only and never reach the executor"
  );

  const preview = observed.largeResult;
  requireCondition(
    preview?.protocolVersion === "0.1" &&
      preview.type === "bridge-read-preview" &&
      preview.capabilityId === readCapability.capabilityId &&
      typeof preview.preview === "string" &&
      preview.preview.length === 1200 &&
      preview.preview.endsWith("…") &&
      preview.metrics?.includedCharacters === preview.preview.length &&
      preview.metrics.sourceCharacters > preview.metrics.includedCharacters &&
      preview.metrics.truncated === true &&
      !Object.hasOwn(preview, "result"),
    "Host read previews must remain within 1,200 adapter characters"
  );

  requireCondition(
    observed.mutationError?.name === "CoworkProtocolError" &&
      observed.mutationError.code === "HUMAN_CONFIRMATION_REQUIRED",
    "The browser bridge must fail closed before a mutating host call"
  );

  return {
    browserHostClaim: true,
    foreignLiveSiteClaim: false,
    suppliedCapabilities: capabilities.length,
    readExecutions: hostCalls.length,
    previewCharacters: preview.preview.length,
    mutationAccess: mutationCapability.access
  };
}

export { EXPECTED_TOOL_NAMES };
