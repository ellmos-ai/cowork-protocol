import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildPanelViewModel,
  buildReceiptViewModels,
  nextActionOfferExpiry,
  prepareVisibleActionOffer,
  workModeChoiceId
} from "../src/view-model.js";
import { createShowcaseSession, transitionShowcaseSession } from "../src/session.js";

const LIVE_LEASE = Object.freeze({
  leaseId: "lease-1",
  goal: "Complete only the focused field",
  allowedTargetIds: ["form-field:full-name"],
  expiresAt: "2999-01-01T00:00:00.000Z"
});

function sessionWith(status, { granted = false } = {}) {
  const base = createShowcaseSession();
  return transitionShowcaseSession(
    granted ? { ...base, lease: LIVE_LEASE } : base,
    { type: "SET_STATUS", ...status }
  );
}
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

test("visible offer limits count Unicode code points like the WebMCP schema", () => {
  const boundary = prepareVisibleActionOffer({
    capabilityId: "form.set_value",
    targetId: "form-field:notes",
    proposedArguments: { value: "😀".repeat(350) },
    summary: "Set notes"
  });
  assert.equal(boundary.proposedValue, "😀".repeat(350));

  assert.throws(
    () =>
      prepareVisibleActionOffer({
        capabilityId: "form.set_value",
        targetId: "form-field:notes",
        proposedArguments: { value: "😀".repeat(351) },
        summary: "Set notes"
      }),
    (error) =>
      error instanceof CoworkProtocolError && error.code === "INVALID_ARGUMENTS"
  );
});

test("the panel view model reads its every word from the work-mode presentation", () => {
  const initial = createShowcaseSession();
  assert.deepEqual(
    buildPanelViewModel({
      session: initial,
      focusPacket: null,
      offers: [],
      capabilityLevel: "unavailable"
    }),
    {
      providerId: "cowork-reference-ui",
      mode: "sparring",
      authority: "human",
      modeLabel: "Sparring \u00b7 you execute",
      modeDetail: "You act, the model advises. Say the word and it swaps.",
      relayState: "watching",
      humanState: "here-executing",
      humanLabel: "You are executing",
      humanBadge: "\u25cf",
      humanTone: "green",
      humanArea: null,
      modelState: "here-advising",
      modelLabel: "Model is advising",
      modelBadge: "\u25c9",
      modelTone: "green",
      modelArea: null,
      roleLabel: "Advising",
      roleDetail: "Explains and proposes. Nothing changes without your click.",
      areaLabel: "Nothing claimed yet",
      authorityLabel: "You hold the click right",
      choiceId: "sparring-human",
      doublingAvailable: false,
      authorityLapsed: false,
      capabilityLabel: "WebMCP off in this browser",
      focusLabel: "Point to or select a form field",
      contextLabel: "No context sent",
      soloAllowed: false,
      actionChips: []
    }
  );
});

test("an advising model may propose at most three offers at once", () => {
  const offer = (offerId, value) => ({
    offerId,
    pageVersion: 1,
    capabilityId: "form.set_value",
    targetId: "form-field:name",
    proposedArguments: { value },
    summary: `Set ${value}`,
    expiresAt: "2026-08-30T10:02:00.000Z"
  });

  const view = buildPanelViewModel({
    session: createShowcaseSession(),
    focusPacket: {
      focus: { label: "Full Name" },
      metrics: { contextCharacters: 14 }
    },
    offers: [offer("1", "Lukas"), offer("2", "Ada"), offer("3", "Grace"), offer("4", "Never rendered")],
    capabilityLevel: "native",
    now: "2026-08-30T10:01:00.000Z",
    pageVersion: 1
  });

  assert.equal(view.capabilityLabel, "Native WebMCP");
  assert.equal(view.focusLabel, "Full Name");
  assert.equal(view.contextLabel, "14 context characters");
  assert.deepEqual(view.actionChips.map((chip) => chip.offerId), ["1", "2", "3"]);
});

test("a model working alone holds the click right, names its area and proposes nothing", () => {
  const away = transitionShowcaseSession(createShowcaseSession(), {
    type: "HUMAN_AWAY",
    duration: "long",
    lease: LIVE_LEASE,
    area: "Full name",
    now: "2026-08-30T10:00:00.000Z"
  });

  const view = buildPanelViewModel({
    session: away,
    focusPacket: { focus: { label: "Full Name" }, metrics: { contextCharacters: 14 } },
    offers: [
      {
        offerId: "1",
        pageVersion: 1,
        capabilityId: "form.set_value",
        targetId: "form-field:name",
        proposedArguments: { value: "Lukas" },
        summary: "Set the name",
        expiresAt: "2026-08-30T10:02:00.000Z"
      }
    ],
    capabilityLevel: "native",
    now: "2026-08-30T10:01:00.000Z",
    pageVersion: 1
  });

  assert.equal(view.mode, "model-solo");
  assert.equal(view.modeLabel, "Model works alone");
  assert.equal(view.choiceId, "model-solo");
  assert.equal(view.humanState, "away");
  assert.equal(view.humanTone, "red");
  assert.equal(view.roleLabel, "Executing");
  assert.equal(view.areaLabel, "Model: Full name");
  assert.equal(view.soloAllowed, true);
  assert.deepEqual(
    view.actionChips,
    [],
    "the partner holding the click right executes; it does not propose"
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

test("work modes expose only the rights they actually enforce", () => {
  const offer = {
    offerId: "set-1",
    pageVersion: 1,
    capabilityId: "form.set_value",
    targetId: "form-field:full-name",
    proposedArguments: { value: "Lukas" },
    summary: "Set the name",
    expiresAt: "2026-08-30T10:02:00.000Z"
  };
  const build = (session) =>
    buildPanelViewModel({
      session,
      focusPacket: null,
      offers: [offer],
      capabilityLevel: "native",
      now: "2026-08-30T10:01:00.000Z",
      pageVersion: 1
    });

  const advising = build(createShowcaseSession());
  assert.equal(advising.choiceId, "sparring-human");
  assert.equal(advising.actionChips.length, 1);
  assert.equal(advising.soloAllowed, false);

  const modelExecutes = build(
    sessionWith(
      {
        human: { availability: "here", role: "advising", area: null },
        model: { availability: "here", role: "executing", area: "Full name" }
      },
      { granted: true }
    )
  );
  assert.equal(modelExecutes.choiceId, "sparring-model");
  assert.equal(modelExecutes.actionChips.length, 0);
  assert.equal(modelExecutes.soloAllowed, true);

  const doubling = build(
    sessionWith(
      {
        human: { availability: "here", role: "executing", area: "Email address" },
        model: { availability: "here", role: "executing", area: "Full name" }
      },
      { granted: true }
    )
  );
  assert.equal(doubling.choiceId, "doubling");
  assert.equal(doubling.doublingAvailable, true);
  assert.equal(doubling.areaLabel, "You: Email address \u00b7 Model: Full name");
  assert.equal(doubling.actionChips.length, 0);
  assert.equal(doubling.soloAllowed, true);

  const standby = build(
    sessionWith({ model: { availability: "standby", role: "advising", area: null } })
  );
  assert.equal(standby.choiceId, "human-solo");
  assert.equal(standby.roleLabel, "Standing by");
  assert.equal(standby.actionChips.length, 0);
  assert.equal(standby.soloAllowed, false);

  const disconnected = build(
    sessionWith({ model: { availability: "away", role: "advising", area: null } })
  );
  assert.equal(disconnected.roleLabel, "No seat");
  assert.equal(disconnected.actionChips.length, 0);
  assert.equal(disconnected.soloAllowed, false);

  const nobody = build(
    sessionWith({
      human: { availability: "here", role: "advising", area: null },
      model: { availability: "here", role: "advising", area: null }
    })
  );
  assert.equal(nobody.choiceId, "idle");
  assert.equal(nobody.authorityLabel, "Nobody holds the click right");
});

test("the mode select shows the mode in force, not the one that was picked", () => {
  // Wanting to execute is not the same as being allowed to: without a grant
  // the model advises and nobody holds the click right.
  const ungranted = sessionWith({
    human: { availability: "here", role: "advising", area: null },
    model: { availability: "here", role: "executing", area: "Full name" }
  });
  assert.equal(workModeChoiceId(ungranted.workMode), "idle");
  assert.equal(ungranted.workMode.authorityLapsed, true);

  // Both executing on the same area: they would be in each other's way, so
  // the human keeps the click right.
  const sameArea = sessionWith(
    {
      human: { availability: "here", role: "executing", area: "Full name" },
      model: { availability: "here", role: "executing", area: "Full name" }
    },
    { granted: true }
  );
  assert.equal(workModeChoiceId(sameArea.workMode), "sparring-human");
  assert.equal(sameArea.workMode.doublingAvailable, false);
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
