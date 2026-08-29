import {
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

export function planAuthorizedFormBuilderMutation({ offer, authorization, currentValue }) {
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
    nextValue: offer.proposedArguments.value,
    verificationExpected: offer.proposedArguments.value,
    undoAvailable: offer.undoAvailable
  };
}

export function planSoloFormBuilderMutation(input) {
  const authorization = authorizeSoloAction(input);
  return {
    authorization,
    targetId: input.targetId,
    previousValue: input.currentValue,
    nextValue: input.proposedArguments.value,
    verificationExpected: input.proposedArguments.value,
    undoAvailable: true
  };
}
