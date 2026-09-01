import {
  authorizeActionOffer,
  CoworkProtocolError,
  createActionOffer,
  createActionReceipt,
  createFeedbackEvent
} from "../../core/src/index.js";
import {
  buildFormBuilderContextExpansion,
  buildFormBuilderFocus,
  planAuthorizedFormBuilderMutation,
  planSoloFormBuilderMutation
} from "../../formbuilder-connector/src/index.js";
import {
  createConversationInbox,
  createConversationTurn
} from "../../conversation/src/index.js";
import { createShowcaseSubmission } from "../../../apps/formbuilder-showcase/src/formbuilder-use-case.js";
import { observeControlChange } from "../../../apps/formbuilder-showcase/src/interaction-log.js";
import {
  BUILDER_CANVAS_TARGET_ID,
  createBuilderCoworkBridge
} from "../../../apps/formbuilder-showcase/src/builder-cowork.js";
import { createField } from "../../../apps/formbuilder-showcase/src/form-builder.mjs";

function proofStep(id, pass, evidence) {
  return { id, pass, evidence };
}

export function runJurorProof() {
  const focus = buildFormBuilderFocus({
    sessionId: "juror-proof",
    fieldId: "full-name",
    pageVersion: 1,
    focusKind: "pointer",
    label: "Full name",
    selectedText: "",
    controlKind: "text"
  });
  const contextRequest = buildFormBuilderContextExpansion({
    focusPacket: focus,
    fieldId: "full-name",
    label: "Full name",
    controlKind: "text",
    required: true,
    helpText: "Required. Used in the generated FormBuilder response.",
    options: [],
    reason: "Need the field requirement before proposing a value"
  });
  const conversationTurn = createConversationTurn({
    transcript: "Can you use a different name for this field?",
    focusPacket: focus,
    presence: {
      humanPresence: "present",
      agentPresence: "active",
      mode: "cowork"
    }
  });
  const conversationInbox = createConversationInbox({
    createTurnId: () => "proof-turn-1"
  });
  conversationInbox.publish(conversationTurn);
  const conversationRead = conversationInbox.read();
  const conversationReply = conversationInbox.respond({
    turnId: conversationRead.latest.turnId,
    message: "I can use a different name. Click the offer to approve it.",
    offers: [
      {
        capabilityId: "form.set_value",
        targetId: focus.targetId,
        value: "Ada Byron",
        summary: "Set Full name to Ada Byron"
      }
    ]
  });

  const values = {
    "full-name": "Ada Lovelace",
    email: "",
    role: "Developer",
    "access-needs": "Step-free access"
  };
  const offer = createActionOffer({
    offerId: "proof-offer-1",
    capabilityId: "form.set_value",
    targetId: focus.targetId,
    pageVersion: 1,
    proposedArguments: { value: "Lukas Geiger" },
    summary: "Set Full name to Lukas Geiger",
    effect: "mutate",
    undoAvailable: true,
    expiresAt: "2026-08-30T10:01:00.000Z"
  });

  let syntheticAuthorizationRejected = null;
  try {
    authorizeActionOffer({
      offer,
      event: {
        origin: "agent-tool",
        offerId: offer.offerId,
        targetId: offer.targetId,
        pageVersion: offer.pageVersion,
        arguments: offer.proposedArguments
      },
      now: "2026-08-30T10:00:00.000Z"
    });
  } catch (error) {
    if (error instanceof CoworkProtocolError) {
      syntheticAuthorizationRejected = error.code;
    } else {
      throw error;
    }
  }

  const valueBeforeHumanClick = values["full-name"];
  const authorization = authorizeActionOffer({
    offer,
    event: {
      origin: "human-click",
      offerId: offer.offerId,
      targetId: offer.targetId,
      pageVersion: offer.pageVersion,
      arguments: offer.proposedArguments
    },
    now: "2026-08-30T10:00:00.000Z"
  });
  const mutation = planAuthorizedFormBuilderMutation({
    offer,
    authorization,
    currentValue: valueBeforeHumanClick
  });
  values["full-name"] = mutation.nextValue;

  const change = observeControlChange({
    changeId: "proof-change-1",
    fieldId: "full-name",
    label: "Full name",
    previousValue: mutation.previousValue,
    nextValue: values["full-name"],
    pageVersion: 2,
    cause: {
      source: "agent",
      refs: [`offer:${offer.offerId}`],
      confidence: "high"
    }
  });
  const receipt = createActionReceipt({
    offerId: offer.offerId,
    verified: values["full-name"] === mutation.verificationExpected,
    observedChangeIds: [change.changeId],
    verificationSummary: "Full name matches the human-authorized value",
    undoAvailable: mutation.undoAvailable,
    pageVersion: 2
  });
  const feedback = createFeedbackEvent({
    origin: "human-click",
    relatedOfferId: offer.offerId,
    relatedChangeIds: [change.changeId],
    verdict: "accepted",
    adjustment: "",
    pageVersion: 2,
    createdAt: "2026-08-30T10:00:01.000Z"
  });

  const solo = planSoloFormBuilderMutation({
    lease: {
      leaseId: "proof-lease-1",
      origin: "human-click",
      goal: "Complete only the email field",
      allowedCapabilityIds: ["form.set_value"],
      allowedTargetIds: ["form-field:email"],
      maxCalls: 2,
      maxContextLevel: 2,
      pageVersion: 2,
      expiresAt: "2026-08-30T10:02:00.000Z"
    },
    now: "2026-08-30T10:00:30.000Z",
    humanPresence: "afk-short",
    agentPresence: "active",
    capabilityId: "form.set_value",
    targetId: "form-field:email",
    pageVersion: 2,
    callsUsed: 0,
    proposedArguments: { value: "lukas@example.com" },
    currentValue: values.email
  });
  values.email = solo.nextValue;

  // Collaborative form design: a structural canvas edit (not a value change)
  // proposed, offered, left untouched until the human's click, then applied
  // and independently verified - the same offer/click/receipt path as above,
  // carried by three new capability ids instead of a new tool.
  const builderBridge = createBuilderCoworkBridge({ sessionId: "juror-proof-builder" });
  const builderFieldsBeforeOffer = [];
  const builderFocus = builderBridge.focusFor({
    pageVersion: 1,
    fieldCount: builderFieldsBeforeOffer.length
  });
  const suggestedField = createField("text-short", { label: "Dietary requirements" });
  const builderOffer = builderBridge.proposeOffer({
    capabilityId: "form-add-field",
    targetId: BUILDER_CANVAS_TARGET_ID,
    proposedArguments: { field: suggestedField },
    summary: `Add a "${suggestedField.label}" field`,
    pageVersion: 1,
    now: "2026-08-30T10:00:40.000Z"
  });
  const builderFieldsBeforeClick = builderFieldsBeforeOffer.length;
  const builderResult = builderBridge.authorizeAndApply({
    offerId: builderOffer.offerId,
    elements: builderFieldsBeforeOffer,
    currentPageVersion: 1,
    now: "2026-08-30T10:00:41.000Z"
  });

  const formResult = createShowcaseSubmission(values);
  const steps = [
    proofStep(
      "focus",
      focus.targetId === "form-field:full-name" && focus.metrics.contextCharacters <= 350,
      {
        targetId: focus.targetId,
        contextCharacters: focus.metrics.contextCharacters,
        capabilityIds: focus.capabilityIds
      }
    ),
    proofStep(
      "context-request",
      contextRequest.targetId === focus.targetId &&
        contextRequest.level === 3 &&
        contextRequest.oneShot === true &&
        contextRequest.metrics.includedContextCharacters <= 1200,
      {
        targetId: contextRequest.targetId,
        level: contextRequest.level,
        oneShot: contextRequest.oneShot,
        includedContextCharacters:
          contextRequest.metrics.includedContextCharacters
      }
    ),
    proofStep(
      "conversation",
      JSON.stringify(conversationTurn).length <= 1200 &&
        conversationRead.latest?.turnId === "proof-turn-1" &&
        conversationRead.omittedCount === 0 &&
        conversationReply.requiresHumanConfirmation === true &&
        conversationReply.reply.offers[0]?.value === "Ada Byron",
      {
        packetCharacters: JSON.stringify(conversationTurn).length,
        returnedTurns: conversationRead.latest ? 1 : 0,
        requiresHumanConfirmation: conversationReply.requiresHumanConfirmation,
        proposedValue: conversationReply.reply.offers[0]?.value ?? null
      }
    ),
    proofStep(
      "offer-only",
      offer.requiresHumanConfirmation === true &&
        valueBeforeHumanClick === "Ada Lovelace" &&
        syntheticAuthorizationRejected === "HUMAN_CONFIRMATION_REQUIRED",
      {
        valueBeforeHumanClick,
        requiresHumanConfirmation: offer.requiresHumanConfirmation,
        syntheticAuthorizationRejected
      }
    ),
    proofStep(
      "human-click",
      authorization.authorizationSource === "human-click" && mutation.nextValue === "Lukas Geiger",
      {
        authorizationSource: authorization.authorizationSource,
        nextValue: mutation.nextValue,
        undoAvailable: mutation.undoAvailable
      }
    ),
    proofStep(
      "verified-feedback",
      receipt.status === "verified" &&
        change.causeRefs[0] === "offer:proof-offer-1" &&
        feedback.verdict === "accepted",
      {
        receiptStatus: receipt.status,
        changeCause: change.causeRefs[0],
        feedbackVerdict: feedback.verdict
      }
    ),
    proofStep(
      "agent-solo",
      solo.authorization.authorizationSource === "solo-lease" &&
        solo.authorization.remainingCalls === 1 &&
        solo.nextValue === "lukas@example.com",
      {
        authorizationSource: solo.authorization.authorizationSource,
        remainingCalls: solo.authorization.remainingCalls,
        nextValue: solo.nextValue
      }
    ),
    proofStep(
      "collaborative-form-design",
      builderFocus.capabilityIds.includes("form-add-field") &&
        builderFieldsBeforeClick === 0 &&
        builderResult.receipt.status === "verified" &&
        builderResult.elements.length === 1 &&
        builderResult.elements[0].id === suggestedField.id,
      {
        capabilityIds: builderFocus.capabilityIds,
        fieldsBeforeClick: builderFieldsBeforeClick,
        fieldsAfterClick: builderResult.elements.length,
        receiptStatus: builderResult.receipt.status
      }
    ),
    proofStep(
      "export",
      formResult.ok === true && formResult.response.schema === "formularerstellen-response-v1",
      {
        schema: formResult.ok ? formResult.response.schema : null,
        answerCount: formResult.ok ? formResult.response.responses.length : 0
      }
    )
  ];

  return {
    proofVersion: "cowork-juror-proof-v4",
    browserClaim: false,
    hostTokenClaim: false,
    steps,
    summary: {
      passed: steps.filter((step) => step.pass).length,
      failed: steps.filter((step) => !step.pass).length
    }
  };
}
