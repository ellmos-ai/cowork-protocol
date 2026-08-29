import {
  negotiateWebMcpCatalog,
  requestLegacyContext
} from "../../bridge/src/index.js";
import { buildFocusPacket, routeContextSignal } from "../../core/src/index.js";

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
  const expanded = routeContextSignal({
    signal: "focus",
    changed: true,
    currentLevel: 2,
    requestedLevel: 3,
    reason: "One related context step"
  });
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
        avoidedSourceCharacters: 161
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
      "context-one-step",
      { from: 2, to: 3, oneShot: true },
      { from: 2, to: expanded.level, oneShot: expanded.oneShot },
      expanded.level === 3 && expanded.oneShot === true
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
