import {
  boundWebMcpReadResult,
  negotiateWebMcpCatalog,
  requestLegacyContext
} from "../../bridge/src/index.js";
import {
  buildFocusPacket,
  createChangeEvent,
  createFeedbackEvent,
  routeContextSignal
} from "../../core/src/index.js";
import {
  createConversationInbox,
  createConversationTurn
} from "../../conversation/src/index.js";
import { buildFormBuilderContextExpansion } from "../../formbuilder-connector/src/index.js";
import {
  createChangeSnapshot,
  createFeedbackSnapshot
} from "../../../apps/formbuilder-showcase/src/interaction-log.js";

function focus({ label, selectedText }) {
  return buildFocusPacket({
    sessionId: "token-eval",
    source: "human-selection",
    capabilityLevel: "native",
    targetId: "form-field:eval",
    pageVersion: 1,
    focusKind: "selection",
    label,
    selectedText,
    capabilityIds: ["form.explain_field"]
  });
}

function evaluatedCase(id, expected, observed, pass) {
  return { id, expected, observed, pass };
}

export function runTokenEconomyEval() {
  const normalFocus = focus({ label: "L".repeat(500), selectedText: "" });
  const boundarySelection = focus({
    label: "L".repeat(300),
    selectedText: "S".repeat(160)
  });
  const digestSelection = focus({
    label: "L".repeat(500),
    selectedText: "S".repeat(161)
  });
  const silence = routeContextSignal({
    signal: "silence",
    changed: true,
    currentLevel: 1,
    requestedLevel: 1,
    reason: "No speech"
  });
  const unchanged = routeContextSignal({
    signal: "focus",
    changed: false,
    currentLevel: 1,
    requestedLevel: 1,
    reason: "No state delta"
  });
  const expanded = buildFormBuilderContextExpansion({
    focusPacket: normalFocus,
    fieldId: "eval",
    label: "Evaluation field",
    controlKind: "text",
    required: true,
    helpText: "H".repeat(1300),
    options: [],
    reason: "Need the related validation rule"
  });
  const conversationInbox = createConversationInbox({
    createTurnId: (sequence) => `eval-turn-${sequence}`
  });
  conversationInbox.publish(
    createConversationTurn({
      transcript: "Earlier request",
      focusPacket: normalFocus,
      presence: { humanPresence: "present", agentPresence: "active", mode: "cowork" }
    })
  );
  const conversationTurn = createConversationTurn({
    transcript: "T".repeat(500),
    focusPacket: normalFocus,
    presence: { humanPresence: "present", agentPresence: "active", mode: "cowork" }
  });
  conversationInbox.publish(conversationTurn);
  const conversationSnapshot = conversationInbox.read();
  const sourceDescription = "D".repeat(500);
  const bridgeCatalog = negotiateWebMcpCatalog({
    tools: [{
      name: "read_evaluation_record",
      description: sourceDescription,
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true }
    }]
  });
  const bridgeCapability = bridgeCatalog.capabilities[0];
  const bridgeSourceResult = { records: ["R".repeat(5000)] };
  const bridgeReadResult = boundWebMcpReadResult(
    "webmcp:read_evaluation_record",
    bridgeSourceResult
  );
  const changeSourceSummary = "C".repeat(500);
  const changeEvent = createChangeEvent({
    changeId: "change-eval-2",
    source: "agent",
    targetIds: ["form-field:eval"],
    pageVersion: 2,
    beforeDigest: "before",
    afterDigest: "after",
    shortSummary: changeSourceSummary,
    causeRefs: ["offer:eval"],
    causalityConfidence: "high",
    reversible: true
  });
  const changeSnapshot = createChangeSnapshot([
    { changeId: "change-eval-1" },
    changeEvent
  ]);
  const feedbackSourceAdjustment = "F".repeat(500);
  const feedbackEvent = createFeedbackEvent({
    origin: "human-click",
    relatedOfferId: "offer-eval",
    relatedChangeIds: ["change-eval-2"],
    verdict: "revise",
    adjustment: feedbackSourceAdjustment,
    pageVersion: 2,
    createdAt: "2026-08-30T10:00:00.000Z"
  });
  const feedbackSnapshot = createFeedbackSnapshot([
    { relatedOfferId: "offer-old" },
    feedbackEvent
  ]);
  const visualFallback = requestLegacyContext({
    currentLevel: 2,
    requestedLevel: 3,
    pointer: { x: 640, y: 360 }
  });

  const cases = [
    evaluatedCase(
      "focus-normal-350",
      { maximumContextCharacters: 350 },
      { contextCharacters: normalFocus.metrics.contextCharacters },
      normalFocus.metrics.contextCharacters <= 350
    ),
    evaluatedCase(
      "selection-160-verbatim",
      { selectedTextIncludedCharacters: 160 },
      {
        selectionKind: boundarySelection.focus.selection.kind,
        selectedTextIncludedCharacters:
          boundarySelection.metrics.selectedTextIncludedCharacters
      },
      boundarySelection.focus.selection.kind === "text" &&
        boundarySelection.metrics.selectedTextIncludedCharacters === 160
    ),
    evaluatedCase(
      "selection-161-digest",
      { selectedTextIncludedCharacters: 0 },
      {
        selectionKind: digestSelection.focus.selection.kind,
        selectedTextIncludedCharacters:
          digestSelection.metrics.selectedTextIncludedCharacters,
        avoidedSourceCharacters:
          digestSelection.metrics.selectedTextCharacters -
          digestSelection.metrics.selectedTextIncludedCharacters
      },
      digestSelection.focus.selection.kind === "digest" &&
        digestSelection.metrics.selectedTextIncludedCharacters === 0
    ),
    evaluatedCase(
      "silence-no-packet",
      { emitted: false },
      { emitted: silence !== null },
      silence === null
    ),
    evaluatedCase(
      "unchanged-no-packet",
      { emitted: false },
      { emitted: unchanged !== null },
      unchanged === null
    ),
    evaluatedCase(
      "native-context-request-1200",
      { maximumContextCharacters: 1200, from: 2, to: 3, oneShot: true },
      {
        type: expanded.type,
        from: expanded.currentLevel,
        to: expanded.level,
        oneShot: expanded.oneShot,
        sourceContextCharacters: expanded.metrics.sourceContextCharacters,
        includedContextCharacters: expanded.metrics.includedContextCharacters,
        avoidedSourceCharacters:
          expanded.metrics.sourceContextCharacters -
          expanded.metrics.includedContextCharacters
      },
      expanded.type === "context-expansion" &&
        expanded.currentLevel === 2 &&
        expanded.level === 3 &&
        expanded.oneShot === true &&
        expanded.metrics.includedContextCharacters <= 1200
    ),
    evaluatedCase(
      "conversation-turn-1200-latest",
      {
        maximumTurnCharacters: 1200,
        maximumTranscriptCharacters: 350,
        returnedTurns: 1
      },
      {
        packetCharacters: JSON.stringify(conversationTurn).length,
        includedTranscriptCharacters:
          conversationTurn.metrics.includedTranscriptCharacters,
        sourceTranscriptCharacters:
          conversationTurn.metrics.sourceTranscriptCharacters,
        returnedTurns: conversationSnapshot.latest ? 1 : 0,
        omittedTurns: conversationSnapshot.omittedCount,
        pageHtmlIncluded: Object.hasOwn(conversationTurn, "pageHtml")
      },
      JSON.stringify(conversationTurn).length <= 1200 &&
        conversationTurn.metrics.includedTranscriptCharacters === 350 &&
        conversationSnapshot.latest?.turn.transcript === conversationTurn.transcript &&
        conversationSnapshot.omittedCount === 1 &&
        !Object.hasOwn(conversationTurn, "pageHtml")
    ),
    evaluatedCase(
      "bridge-summary-350",
      { maximumSummaryCharacters: 350 },
      {
        summaryCharacters: JSON.stringify(bridgeCapability).length,
        sourceDescriptionCharacters: sourceDescription.length,
        includedDescriptionCharacters: bridgeCapability.description.length,
        avoidedSourceCharacters:
          sourceDescription.length - bridgeCapability.description.length
      },
      JSON.stringify(bridgeCapability).length <= 350 &&
        bridgeCapability.description.length === 160
    ),
    evaluatedCase(
      "bridge-read-result-1200",
      { maximumResultCharacters: 1200 },
      {
        resultKind: bridgeReadResult.type,
        sourceCharacters: bridgeReadResult.metrics.sourceCharacters,
        includedCharacters: bridgeReadResult.metrics.includedCharacters,
        avoidedSourceCharacters:
          bridgeReadResult.metrics.sourceCharacters -
          bridgeReadResult.metrics.includedCharacters
      },
      bridgeReadResult.type === "bridge-read-preview" &&
        bridgeReadResult.metrics.includedCharacters <= 1200 &&
        bridgeReadResult.metrics.truncated === true
    ),
    evaluatedCase(
      "change-latest-350",
      { maximumSummaryCharacters: 350, returnedEvents: 1 },
      {
        summaryCharacters: changeSnapshot.latest.shortSummary.length,
        sourceSummaryCharacters: changeSourceSummary.length,
        returnedEvents: changeSnapshot.latest ? 1 : 0,
        omittedEvents: changeSnapshot.omittedCount,
        avoidedSourceCharacters:
          changeSourceSummary.length - changeSnapshot.latest.shortSummary.length
      },
      changeSnapshot.latest.shortSummary.length <= 350 &&
        changeSnapshot.omittedCount === 1
    ),
    evaluatedCase(
      "feedback-latest-350",
      { maximumAdjustmentCharacters: 350, returnedEvents: 1 },
      {
        adjustmentCharacters: feedbackSnapshot.latest.adjustment.length,
        sourceAdjustmentCharacters: feedbackSourceAdjustment.length,
        returnedEvents: feedbackSnapshot.latest ? 1 : 0,
        omittedEvents: feedbackSnapshot.omittedCount,
        avoidedSourceCharacters:
          feedbackSourceAdjustment.length - feedbackSnapshot.latest.adjustment.length
      },
      feedbackSnapshot.latest.adjustment.length <= 350 &&
        feedbackSnapshot.omittedCount === 1
    ),
    evaluatedCase(
      "legacy-visual-160000",
      { maximumPixelArea: 160000, imageCaptured: false },
      {
        maximumWidth: visualFallback.visualRequest.maximumWidth,
        maximumHeight: visualFallback.visualRequest.maximumHeight,
        maximumPixelArea: visualFallback.visualRequest.maximumPixelArea,
        imageCaptured: Object.hasOwn(visualFallback, "image")
      },
      visualFallback.visualRequest.maximumPixelArea === 160000 &&
        !Object.hasOwn(visualFallback, "image")
    )
  ];

  const passed = cases.filter(({ pass }) => pass).length;
  return {
    metric: "adapter-characters",
    hostTokenClaim: false,
    cases,
    summary: {
      passed,
      failed: cases.length - passed
    }
  };
}
