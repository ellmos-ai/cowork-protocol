import assert from "node:assert/strict";
import { test } from "node:test";

import {
  authorizeActionOffer,
  CoworkProtocolError,
  createActionOffer,
  createActionReceipt,
  digestArguments
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
      expiresAt: "2026-08-30T10:01:00.000Z",
      metrics: {
        summaryCharacters: 17,
        summaryIncludedCharacters: 17
      }
    }
  );
});

test("action-offer summaries are bounded in the core even without host schema validation", () => {
  const offer = createActionOffer({
    offerId: "offer-long-summary",
    capabilityId: "form.set_value",
    targetId: "field.name",
    pageVersion: 4,
    proposedArguments: { value: "Lukas" },
    summary: "x".repeat(201),
    effect: "mutate",
    undoAvailable: true,
    expiresAt: "2026-08-30T10:01:00.000Z"
  });

  assert.equal(offer.summary, `${"x".repeat(199)}…`);
  assert.deepEqual(offer.metrics, {
    summaryCharacters: 201,
    summaryIncludedCharacters: 200
  });
});

test("bounded protocol text never ends with half of a Unicode surrogate pair", () => {
  const offer = createActionOffer({
    offerId: "offer-unicode-summary",
    capabilityId: "form.set_value",
    targetId: "field.name",
    pageVersion: 4,
    proposedArguments: { value: "Lukas" },
    summary: `${"x".repeat(198)}😀z`,
    effect: "mutate",
    undoAvailable: true,
    expiresAt: "2026-08-30T10:01:00.000Z"
  });

  assert.equal(offer.summary, `${"x".repeat(198)}…`);
  assert.deepEqual(offer.metrics, {
    summaryCharacters: 201,
    summaryIncludedCharacters: 199
  });
});

test("argument digests reject values that JSON would silently discard or rewrite", () => {
  for (const value of [
    undefined,
    () => "hidden",
    { value: undefined },
    [undefined],
    { value: Number.NaN },
    { value: -0 }
  ]) {
    assert.throws(
      () => digestArguments(value),
      (error) =>
        error instanceof CoworkProtocolError && error.code === "INVALID_ARGUMENTS"
    );
  }
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
    (error) => error instanceof CoworkProtocolError && error.code === code
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
