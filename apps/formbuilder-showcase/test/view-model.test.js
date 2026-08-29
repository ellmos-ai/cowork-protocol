import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildPanelViewModel,
  buildReceiptViewModels
} from "../src/view-model.js";
import { createShowcaseSession, transitionShowcaseSession } from "../src/session.js";

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
      actionChips: []
    }
  );

  const away = transitionShowcaseSession(initial, {
    type: "HUMAN_AWAY",
    duration: "long",
    lease: { leaseId: "lease-1" }
  });
  const focusPacket = {
    focus: { label: "Full Name" },
    metrics: { contextCharacters: 14 }
  };
  const offers = [
    { offerId: "1", summary: "Set the name" },
    { offerId: "2", summary: "Clear the field" },
    { offerId: "3", summary: "Explain the field" },
    { offerId: "4", summary: "Must not be rendered" }
  ];

  const view = buildPanelViewModel({
    session: away,
    focusPacket,
    offers,
    capabilityLevel: "native"
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
