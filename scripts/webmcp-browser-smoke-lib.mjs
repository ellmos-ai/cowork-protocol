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

  const argumentKinds = [
    observed.focusExecution?.argumentKind,
    observed.contextExecution?.argumentKind
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
    executeArgumentKinds: argumentKinds
  };
}

export { EXPECTED_TOOL_NAMES };
