import assert from "node:assert/strict";
import { test } from "node:test";

import {
  authorizeActionOffer,
  createActionOffer,
  createActionReceipt
} from "../src/index.js";

test("an agent creates a visible offer but not its authorization", () => {
  assert.deepEqual(
    createActionOffer({
      offerId: "offer-visible-1",
      capabilityId: "form.set_value",
      targetId: "field.name",
      pageVersion: 4,
      proposedArguments: { value: "Lukas" },
      summary: "Set Name to Lukas",
      effect: "mutate",
      undoAvailable: true,
      expiresAt: "2026-08-30T10:01:00.000Z"
    }),
    {
      protocolVersion: "0.1",
      type: "action-offer",
      source: "agent",
      offerId: "offer-visible-1",
      capabilityId: "form.set_value",
      targetId: "field.name",
      pageVersion: 4,
      proposedArguments: { value: "Lukas" },
      summary: "Set Name to Lukas",
      effect: "mutate",
      requiresHumanConfirmation: true,
      undoAvailable: true,
      expiresAt: "2026-08-30T10:01:00.000Z"
    }
  );
});

test("an executed action is successful only when its observed result verifies", () => {
  assert.deepEqual(
    createActionReceipt({
      offerId: "offer-visible-1",
      verified: true,
      observedChangeIds: ["change-2"],
      verificationSummary: "Full name now equals Lukas",
      undoAvailable: true
    }),
    {
      protocolVersion: "0.1",
      type: "action-receipt",
      offerId: "offer-visible-1",
      status: "verified",
      observedChangeIds: ["change-2"],
      verificationSummary: "Full name now equals Lukas",
      undoAvailable: true,
      errorCode: null
    }
  );

  assert.equal(
    createActionReceipt({
      offerId: "offer-visible-2",
      verified: false,
      observedChangeIds: [],
      verificationSummary: "Expected value was not observed",
      undoAvailable: false
    }).status,
    "failed"
  );
});

const offer = {
  offerId: "offer-1",
  capabilityId: "form.set_value",
  targetId: "field.name",
  pageVersion: 4,
  proposedArguments: { value: "Lukas" },
  expiresAt: "2026-08-30T10:01:00.000Z"
};

const humanClick = {
  origin: "human-click",
  offerId: "offer-1",
  targetId: "field.name",
  pageVersion: 4,
  arguments: { value: "Lukas" }
};

function expectCode(eventOverrides, requestOverrides, code) {
  assert.throws(
    () =>
      authorizeActionOffer({
        offer,
        event: { ...humanClick, ...eventOverrides },
        now: "2026-08-30T10:00:00.000Z",
        ...requestOverrides
      }),
    { name: "CoworkProtocolError", code }
  );
}

test("only a current human click can authorize the offered action", () => {
  assert.deepEqual(
    authorizeActionOffer({
      offer,
      event: humanClick,
      now: "2026-08-30T10:00:00.000Z"
    }),
    {
      protocolVersion: "0.1",
      type: "action-authorization",
      offerId: "offer-1",
      authorizationSource: "human-click",
      authorizedArgumentsDigest:
        "42d05eae2fa0e6e39047ac7a9f3fa9e4fcc98d168a2ea081964a138a8bb42fcd",
      pageVersion: 4,
      expiresAt: "2026-08-30T10:01:00.000Z"
    }
  );

  expectCode(
    { origin: "agent-tool", humanConfirmation: true },
    {},
    "HUMAN_CONFIRMATION_REQUIRED"
  );
  expectCode({ pageVersion: 5 }, {}, "STALE_PAGE_VERSION");
  expectCode({ offerId: "offer-2" }, {}, "STALE_FOCUS");
  expectCode({ targetId: "field.email" }, {}, "STALE_FOCUS");
  expectCode({ arguments: { value: "Luisa" } }, {}, "STALE_FOCUS");
  expectCode({}, { now: "2026-08-30T10:01:00.000Z" }, "STALE_FOCUS");
  expectCode({}, { now: "not-a-date" }, "STALE_FOCUS");
});
