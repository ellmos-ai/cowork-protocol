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

// --- Builder canvas capabilities: structural edits to the field list itself,
// as opposed to a value change on one already-existing field. These reuse the
// exact same offer -> human click -> authorization -> plan -> verified receipt
// path as the value capabilities above; no new WebMCP tool is introduced.

export const BUILDER_CANVAS_TARGET_ID = "form-builder:canvas";
const BUILDER_CAPABILITY_IDS = new Set(["form-add-field", "form-update-field", "form-move-field"]);

export function builderCanvasCapabilityIds() {
  return [...BUILDER_CAPABILITY_IDS];
}

export function buildFormBuilderCanvasFocus({ sessionId, pageVersion, fieldCount }) {
  if (!Number.isInteger(fieldCount) || fieldCount < 0) {
    throw new CoworkProtocolError(
      "CONNECTOR_DEGRADED",
      "Native FormBuilder canvas focus requires a non-negative field count"
    );
  }
  return buildFocusPacket({
    sessionId,
    source: "human-pinned",
    capabilityLevel: "native",
    targetId: BUILDER_CANVAS_TARGET_ID,
    pageVersion,
    focusKind: "pinned",
    label: `Form canvas (${fieldCount} field${fieldCount === 1 ? "" : "s"})`,
    selectedText: "",
    capabilityIds: builderCanvasCapabilityIds()
  });
}

function assertBuilderAuthorizationMatchesOffer(offer, authorization) {
  const proposedDigest = digestArguments(offer.proposedArguments);
  if (
    authorization.offerId !== offer.offerId ||
    authorization.pageVersion !== offer.pageVersion ||
    authorization.authorizedArgumentsDigest !== proposedDigest
  ) {
    throw new CoworkProtocolError(
      "HUMAN_CONFIRMATION_REQUIRED",
      "Builder mutation does not match the human authorization"
    );
  }
}

function assertPlainObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CoworkProtocolError("INVALID_ARGUMENTS", message);
  }
}

function assertNonEmptyString(value, message) {
  if (typeof value !== "string" || value.length === 0) {
    throw new CoworkProtocolError("INVALID_ARGUMENTS", message);
  }
}

/**
 * Verifies a human-authorized offer against the current builder field list and
 * returns a plan describing exactly one structural operation to apply. This
 * function only validates and describes the operation; the caller (the app,
 * which owns the field-list model) applies it and verifies the result, the
 * same separation `planAuthorizedFormBuilderMutation` uses for value changes.
 */
export function planAuthorizedBuilderFieldMutation({ offer, authorization, currentElements }) {
  if (!BUILDER_CAPABILITY_IDS.has(offer.capabilityId)) {
    throw new CoworkProtocolError(
      "CAPABILITY_UNAVAILABLE",
      `Capability cannot mutate the FormBuilder canvas: ${offer.capabilityId}`
    );
  }
  if (offer.targetId !== BUILDER_CANVAS_TARGET_ID) {
    throw new CoworkProtocolError("STALE_FOCUS", "Builder mutations must target the form canvas");
  }
  assertBuilderAuthorizationMatchesOffer(offer, authorization);
  if (!Array.isArray(currentElements)) {
    throw new CoworkProtocolError("INVALID_ARGUMENTS", "Current builder elements must be a list");
  }

  const args = offer.proposedArguments;
  assertPlainObject(args, "Builder mutation arguments must be an object");

  if (offer.capabilityId === "form-add-field") {
    const field = args.field;
    assertPlainObject(field, "form-add-field requires a field object");
    assertNonEmptyString(field.id, "form-add-field requires a stable field id");
    assertNonEmptyString(field.type, "form-add-field requires a field type");
    if (currentElements.some((element) => element.id === field.id)) {
      throw new CoworkProtocolError("INVALID_ARGUMENTS", `Duplicate field id: ${field.id}`);
    }
    const index = args.index === undefined ? currentElements.length : args.index;
    if (!Number.isInteger(index) || index < 0 || index > currentElements.length) {
      throw new CoworkProtocolError("INVALID_ARGUMENTS", "form-add-field index is out of range");
    }
    return { operation: "add-field", field, index, undoAvailable: offer.undoAvailable };
  }

  if (offer.capabilityId === "form-update-field") {
    assertNonEmptyString(args.fieldId, "form-update-field requires a fieldId");
    assertPlainObject(args.patch, "form-update-field requires a patch object");
    if (Object.hasOwn(args.patch, "id") || Object.hasOwn(args.patch, "type")) {
      throw new CoworkProtocolError("INVALID_ARGUMENTS", "form-update-field cannot patch id or type");
    }
    if (!currentElements.some((element) => element.id === args.fieldId)) {
      throw new CoworkProtocolError("STALE_FOCUS", `Field no longer exists: ${args.fieldId}`);
    }
    return {
      operation: "update-field",
      fieldId: args.fieldId,
      patch: args.patch,
      undoAvailable: offer.undoAvailable
    };
  }

  // form-move-field
  assertNonEmptyString(args.fieldId, "form-move-field requires a fieldId");
  if (args.direction !== "up" && args.direction !== "down") {
    throw new CoworkProtocolError("INVALID_ARGUMENTS", "form-move-field direction must be up or down");
  }
  const currentIndex = currentElements.findIndex((element) => element.id === args.fieldId);
  if (currentIndex === -1) {
    throw new CoworkProtocolError("STALE_FOCUS", `Field no longer exists: ${args.fieldId}`);
  }
  const targetIndex = args.direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= currentElements.length) {
    throw new CoworkProtocolError(
      "INVALID_ARGUMENTS",
      "form-move-field cannot move past the canvas boundary"
    );
  }
  return {
    operation: "move-field",
    fieldId: args.fieldId,
    direction: args.direction,
    undoAvailable: offer.undoAvailable
  };
}
