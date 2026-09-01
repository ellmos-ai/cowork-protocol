import assert from "node:assert/strict";
import { test } from "node:test";

import { authorizeActionOffer, createActionOffer } from "../../core/src/index.js";
import {
  planAuthorizedFormBuilderMutation,
  planSoloFormBuilderMutation
} from "../src/index.js";

test("a human-authorized FormBuilder value change produces a reversible mutation plan", () => {
  const offer = createActionOffer({
    offerId: "offer-form-1",
    capabilityId: "form.set_value",
    targetId: "form-field:full-name",
    pageVersion: 2,
    proposedArguments: { value: "Lukas" },
    summary: "Set Full name to Lukas",
    effect: "mutate",
    undoAvailable: true,
    expiresAt: "2026-08-30T10:01:00.000Z"
  });
  const authorization = authorizeActionOffer({
    offer,
    event: {
      origin: "human-click",
      offerId: "offer-form-1",
      targetId: "form-field:full-name",
      pageVersion: 2,
      arguments: { value: "Lukas" }
    },
    now: "2026-08-30T10:00:00.000Z"
  });

  assert.deepEqual(
    planAuthorizedFormBuilderMutation({ offer, authorization, currentValue: "Ada" }),
    {
      targetId: "form-field:full-name",
      previousValue: "Ada",
      nextValue: "Lukas",
      verificationExpected: "Lukas",
      undoAvailable: true
    }
  );
});

test("a read-only FormBuilder capability cannot produce a mutation plan", () => {
  const offer = createActionOffer({
    offerId: "offer-explain-1",
    capabilityId: "form.explain_field",
    targetId: "form-field:full-name",
    pageVersion: 2,
    proposedArguments: { value: "hidden mutation" },
    summary: "Explain Full name",
    effect: "mutate",
    undoAvailable: true,
    expiresAt: "2026-08-30T10:01:00.000Z"
  });
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

  assert.throws(
    () => planAuthorizedFormBuilderMutation({ offer, authorization, currentValue: "Ada" }),
    { name: "CoworkProtocolError", code: "CAPABILITY_UNAVAILABLE" }
  );
});

test("an AFK FormBuilder mutation is planned only inside the human-approved solo lease", () => {
  const lease = {
    leaseId: "lease-form-1",
    origin: "human-click",
    goal: "Complete only the focused field",
    allowedCapabilityIds: ["form.set_value"],
    allowedTargetIds: ["form-field:email"],
    maxCalls: 2,
    maxContextLevel: 2,
    pageVersion: 5,
    expiresAt: "2026-08-30T10:02:00.000Z"
  };

  assert.deepEqual(
    planSoloFormBuilderMutation({
      lease,
      now: "2026-08-30T10:00:00.000Z",
      humanPresence: "afk-short",
      agentPresence: "active",
      capabilityId: "form.set_value",
      targetId: "form-field:email",
      pageVersion: 5,
      callsUsed: 0,
      proposedArguments: { value: "lukas@example.com" },
      currentValue: ""
    }),
    {
      authorization: {
        authorized: true,
        authorizationSource: "solo-lease",
        leaseId: "lease-form-1",
        remainingCalls: 1
      },
      targetId: "form-field:email",
      previousValue: "",
      nextValue: "lukas@example.com",
      verificationExpected: "lukas@example.com",
      undoAvailable: true
    }
  );
});
