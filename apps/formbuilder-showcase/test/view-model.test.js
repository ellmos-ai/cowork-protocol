import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildPanelViewModel,
  buildReceiptViewModels,
  nextActionOfferExpiry,
  prepareVisibleActionOffer
} from "../src/view-model.js";
import { createShowcaseSession, transitionShowcaseSession } from "../src/session.js";
import { CoworkProtocolError } from "../../../packages/core/src/index.js";

test("invalid visible offers throw the protocol's real error type", () => {
  assert.throws(
    () =>
      prepareVisibleActionOffer({
        capabilityId: "form.explain_field",
        targetId: "form-field:full-name",
        proposedArguments: { value: "hidden mutation" },
        summary: "Explain this field",
        expiresAt: "2026-08-30T10:02:00.000Z"
      }),
    (error) =>
      error instanceof CoworkProtocolError &&
      error.code === "CAPABILITY_UNAVAILABLE"
  );
});

test("clear offers reject a non-empty value instead of silently changing it", () => {
  assert.throws(
    () =>
      prepareVisibleActionOffer({
        capabilityId: "form.clear_value",
        targetId: "form-field:full-name",
        proposedArguments: { value: "Lukas" },
        summary: "Clear this field"
      }),
    (error) =>
      error instanceof CoworkProtocolError && error.code === "INVALID_ARGUMENTS"
  );
});

test("visible offers reject values too long for meaningful human review", () => {
  assert.throws(
    () =>
      prepareVisibleActionOffer({
        capabilityId: "form.set_value",
        targetId: "form-field:notes",
        proposedArguments: { value: "x".repeat(351) },
        summary: "Set notes"
      }),
    (error) =>
      error instanceof CoworkProtocolError && error.code === "INVALID_ARGUMENTS"
  );
});

test("the panel view model exposes mode, token budget and at most three action chips", () => {
  const initial = createShowcaseSession();
  assert.deepEqual(
    buildPanelViewModel({
      session: initial,
      focusPacket: null,
      offers: [],
      capabilityLevel: "unavailable"
    }),
    {
      modeLabel: "Cowork",
      humanTone: "green",
      humanLabel: "Human present",
      agentLabel: "Agent active",
      capabilityLabel: "WebMCP unavailable",
      focusLabel: "Point to or select a form field",
      contextLabel: "No context sent",
      soloAllowed: false,
      actionChips: []
    }
  );

  const away = transitionShowcaseSession(initial, {
    type: "HUMAN_AWAY",
    duration: "long",
    lease: {
      leaseId: "lease-1",
      expiresAt: "2026-08-30T10:02:00.000Z"
    },
    now: "2026-08-30T10:00:00.000Z"
  });
  const focusPacket = {
    focus: { label: "Full Name" },
    metrics: { contextCharacters: 14 }
  };
  const offers = [
    {
      offerId: "1",
      pageVersion: 1,
      capabilityId: "form.set_value",
      targetId: "form-field:name",
      proposedArguments: { value: "Lukas" },
      summary: "Set the name",
      expiresAt: "2026-08-30T10:02:00.000Z"
    },
    {
      offerId: "2",
      pageVersion: 1,
      capabilityId: "form.clear_value",
      targetId: "form-field:name",
      proposedArguments: { value: "" },
      summary: "Clear the field",
      expiresAt: "2026-08-30T10:02:00.000Z"
    },
    {
      offerId: "3",
      pageVersion: 1,
      capabilityId: "form.set_value",
      targetId: "form-field:name",
      proposedArguments: { value: "Ada" },
      summary: "Set another value",
      expiresAt: "2026-08-30T10:02:00.000Z"
    },
    {
      offerId: "4",
      pageVersion: 1,
      capabilityId: "form.set_value",
      targetId: "form-field:name",
      proposedArguments: { value: "Must not be rendered" },
      summary: "Must not be rendered",
      expiresAt: "2026-08-30T10:02:00.000Z"
    }
  ];

  const view = buildPanelViewModel({
    session: away,
    focusPacket,
    offers,
    capabilityLevel: "native",
    now: "2026-08-30T10:01:00.000Z",
    pageVersion: 1
  });
  assert.equal(view.modeLabel, "Agent solo");
  assert.equal(view.humanTone, "red");
  assert.equal(view.capabilityLabel, "Native WebMCP");
  assert.equal(view.focusLabel, "Full Name");
  assert.equal(view.contextLabel, "14 context characters");
  assert.deepEqual(
    view.actionChips.map((chip) => chip.offerId),
    ["1", "2", "3"]
  );
});

test("action chips expose the exact proposed value and exclude read-only capabilities", () => {
  const view = buildPanelViewModel({
    session: createShowcaseSession(),
    focusPacket: {
      focus: { label: "Full Name" },
      metrics: { contextCharacters: 12 }
    },
    offers: [
      {
        offerId: "explain-1",
        capabilityId: "form.explain_field",
        targetId: "form-field:full-name",
        proposedArguments: { value: "hidden mutation" },
        summary: "Explain this field"
      },
      {
        offerId: "set-1",
        pageVersion: 1,
        capabilityId: "form.set_value",
        targetId: "form-field:full-name",
        proposedArguments: { value: "Lukas" },
        summary: "Set the name",
        expiresAt: "2026-08-30T10:02:00.000Z"
      }
    ],
    capabilityLevel: "native",
    now: "2026-08-30T10:01:00.000Z",
    pageVersion: 1
  });

  assert.deepEqual(view.actionChips, [
    {
      offerId: "set-1",
      label: "Set the name",
      capabilityId: "form.set_value",
      targetId: "form-field:full-name",
      proposedValue: "Lukas"
    }
  ]);
});

test("action modes expose only the rights they actually enforce", () => {
  const offer = {
    offerId: "set-1",
    pageVersion: 1,
    capabilityId: "form.set_value",
    targetId: "form-field:full-name",
    proposedArguments: { value: "Lukas" },
    summary: "Set the name",
    expiresAt: "2026-08-30T10:02:00.000Z"
  };
  const build = (actionMode) =>
    buildPanelViewModel({
      session: { ...createShowcaseSession(), actionMode },
      focusPacket: null,
      offers: [offer],
      capabilityLevel: "native",
      now: "2026-08-30T10:01:00.000Z",
      pageVersion: 1
    });

  assert.equal(build("suggest").actionChips.length, 1);
  assert.equal(build("suggest").soloAllowed, false);
  assert.equal(build("delegated").actionChips.length, 0);
  assert.equal(build("delegated").soloAllowed, true);
  assert.equal(build("explain").actionChips.length, 0);
  assert.equal(build("explain").soloAllowed, false);
  assert.equal(build("paused").actionChips.length, 0);
  assert.equal(build("paused").soloAllowed, false);
});

test("expired or stale action offers are absent from the human authorization surface", () => {
  const offer = {
    capabilityId: "form.set_value",
    targetId: "form-field:full-name",
    proposedArguments: { value: "Lukas" },
    summary: "Set the name",
    expiresAt: "2026-08-30T10:02:00.000Z"
  };
  const view = buildPanelViewModel({
    session: createShowcaseSession(),
    focusPacket: null,
    offers: [
      {
        ...offer,
        offerId: "expired",
        pageVersion: 2,
        expiresAt: "2026-08-30T10:00:00.000Z"
      },
      {
        ...offer,
        offerId: "stale",
        pageVersion: 1,
        expiresAt: "2026-08-30T10:02:00.000Z"
      },
      {
        ...offer,
        offerId: "current",
        pageVersion: 2,
        expiresAt: "2026-08-30T10:02:00.000Z"
      }
    ],
    capabilityLevel: "native",
    now: "2026-08-30T10:01:00.000Z",
    pageVersion: 2
  });

  assert.deepEqual(view.actionChips.map(({ offerId }) => offerId), ["current"]);
});

test("the authorization surface exposes the next offer expiry for timer scheduling", () => {
  assert.equal(
    nextActionOfferExpiry([
      { expiresAt: "2026-08-30T10:03:00.000Z" },
      { expiresAt: "invalid" },
      { expiresAt: "2026-08-30T10:02:00.000Z" }
    ]),
    Date.parse("2026-08-30T10:02:00.000Z")
  );
  assert.equal(nextActionOfferExpiry([]), null);
});

test("malformed stored offers are pruned without breaking the authorization surface", () => {
  const view = buildPanelViewModel({
    session: createShowcaseSession(),
    focusPacket: null,
    offers: [
      {
        offerId: "malformed",
        pageVersion: 2,
        capabilityId: "form.set_value",
        targetId: "form-field:full-name",
        proposedArguments: { value: 42 },
        summary: "Invalid stored offer",
        expiresAt: "2026-08-30T10:02:00.000Z"
      },
      {
        offerId: "current",
        pageVersion: 2,
        capabilityId: "form.set_value",
        targetId: "form-field:full-name",
        proposedArguments: { value: "Lukas" },
        summary: "Set the name",
        expiresAt: "2026-08-30T10:02:00.000Z"
      }
    ],
    capabilityLevel: "native",
    now: "2026-08-30T10:01:00.000Z",
    pageVersion: 2
  });

  assert.deepEqual(view.actionChips.map(({ offerId }) => offerId), ["current"]);
});

test("receipt views expose one compact human feedback state per result", () => {
  const views = buildReceiptViewModels({
    receipts: [
      {
        offerId: "offer-1",
        status: "verified",
        verificationSummary: "Name now equals Lukas"
      },
      {
        offerId: "offer-2",
        status: "failed",
        verificationSummary: "Expected value was not observed"
      }
    ],
    feedbackEvents: [
      {
        relatedOfferId: "offer-1",
        verdict: "accepted",
        adjustment: ""
      }
    ]
  });

  assert.deepEqual(views, [
    {
      offerId: "offer-2",
      status: "failed",
      statusLabel: "Failed",
      verificationSummary: "Expected value was not observed",
      feedback: null
    },
    {
      offerId: "offer-1",
      status: "verified",
      statusLabel: "Verified",
      verificationSummary: "Name now equals Lukas",
      feedback: {
        verdict: "accepted",
        verdictLabel: "Good",
        adjustment: ""
      }
    }
  ]);
});
