import {
  buildContextExpansion,
  buildFocusPacket,
  CoworkProtocolError,
  digestArguments,
  authorizeSoloAction
} from "../../core/src/index.js";

const EDITABLE_CONTROL_KINDS = new Set([
  "text",
  "textarea",
  "date",
  "select",
  "checkbox"
]);

const MUTATING_CAPABILITY_IDS = new Set(["form.set_value", "form.clear_value"]);

function mutationValue(capabilityId, proposedArguments) {
  if (!MUTATING_CAPABILITY_IDS.has(capabilityId)) {
    throw new CoworkProtocolError(
      "CAPABILITY_UNAVAILABLE",
      `Capability cannot mutate a FormBuilder field: ${capabilityId}`
    );
  }
  const value = proposedArguments?.value;
  if (typeof value !== "string") {
    throw new CoworkProtocolError("INVALID_ARGUMENTS", "FormBuilder mutations require a string value");
  }
  if (capabilityId === "form.clear_value" && value !== "") {
    throw new CoworkProtocolError(
      "INVALID_ARGUMENTS",
      "form.clear_value requires an empty proposed value"
    );
  }
  return value;
}

function capabilitiesFor(controlKind) {
  const capabilityIds = ["form.explain_field"];
  if (EDITABLE_CONTROL_KINDS.has(controlKind)) {
    capabilityIds.push("form.set_value", "form.clear_value");
  }
  return capabilityIds;
}

export function buildFormBuilderFocus(input) {
  if (typeof input.fieldId !== "string" || input.fieldId.length === 0) {
    throw new CoworkProtocolError(
      "CONNECTOR_DEGRADED",
      "Native FormBuilder focus requires a stable field id"
    );
  }

  const focusKind = input.focusKind ?? "selection";

  return buildFocusPacket({
    sessionId: input.sessionId,
    source: `human-${focusKind}`,
    capabilityLevel: "native",
    targetId: `form-field:${input.fieldId}`,
    pageVersion: input.pageVersion,
    focusKind,
    label: input.label,
    selectedText: input.selectedText,
    capabilityIds: capabilitiesFor(input.controlKind)
  });
}

export function buildFormBuilderContextExpansion(input) {
  const expectedTargetId = `form-field:${input.fieldId}`;
  if (input.focusPacket?.targetId !== expectedTargetId) {
    throw new CoworkProtocolError(
      "STALE_FOCUS",
      "Related FormBuilder context must match the current stable field focus"
    );
  }

  const relatedContext = JSON.stringify({
    label: typeof input.label === "string" ? input.label : "",
    controlKind: typeof input.controlKind === "string" ? input.controlKind : "unknown",
    required: input.required === true,
    helpText: typeof input.helpText === "string" ? input.helpText : "",
    options: Array.isArray(input.options)
      ? input.options.filter((option) => typeof option === "string")
      : []
  });

  return buildContextExpansion({
    focusPacket: input.focusPacket,
    currentLevel: 2,
    requestedLevel: 3,
    reason: input.reason,
    relatedContext
  });
}

export function planAuthorizedFormBuilderMutation({ offer, authorization, currentValue }) {
  const nextValue = mutationValue(offer.capabilityId, offer.proposedArguments);
  const proposedDigest = digestArguments(offer.proposedArguments);
  if (
    authorization.offerId !== offer.offerId ||
    authorization.pageVersion !== offer.pageVersion ||
    authorization.authorizedArgumentsDigest !== proposedDigest
  ) {
    throw new CoworkProtocolError(
      "HUMAN_CONFIRMATION_REQUIRED",
      "Mutation does not match the human authorization"
    );
  }

  return {
    targetId: offer.targetId,
    previousValue: currentValue,
    nextValue,
    verificationExpected: nextValue,
    undoAvailable: offer.undoAvailable
  };
}

export function planSoloFormBuilderMutation(input) {
  const authorization = authorizeSoloAction(input);
  const nextValue = mutationValue(input.capabilityId, input.proposedArguments);
  return {
    authorization,
    targetId: input.targetId,
    previousValue: input.currentValue,
    nextValue,
    verificationExpected: nextValue,
    undoAvailable: true
  };
}
