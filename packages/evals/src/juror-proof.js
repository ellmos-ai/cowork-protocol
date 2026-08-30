import {
  authorizeActionOffer,
  CoworkProtocolError,
  createActionOffer,
  createActionReceipt,
  createFeedbackEvent
} from "../../core/src/index.js";
import {
  buildFormBuilderFocus,
  planAuthorizedFormBuilderMutation,
  planSoloFormBuilderMutation
} from "../../formbuilder-connector/src/index.js";
import { createShowcaseSubmission } from "../../../apps/formbuilder-showcase/src/formbuilder-use-case.js";
import { observeControlChange } from "../../../apps/formbuilder-showcase/src/interaction-log.js";

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
      "export",
      formResult.ok === true && formResult.response.schema === "formularerstellen-response-v1",
      {
        schema: formResult.ok ? formResult.response.schema : null,
        answerCount: formResult.ok ? formResult.response.responses.length : 0
      }
    )
  ];

  return {
    proofVersion: "cowork-juror-proof-v1",
    browserClaim: false,
    hostTokenClaim: false,
    steps,
    summary: {
      passed: steps.filter((step) => step.pass).length,
      failed: steps.filter((step) => !step.pass).length
    }
  };
}
