import assert from "node:assert/strict";
import { test } from "node:test";

import { validateModelHostBrowserObservation } from "../scripts/model-host-browser-smoke-lib.mjs";

function validObservation() {
  return {
    browserVersion: "Chrome/152",
    transportLabel: "Connected model bridge",
    packetCharacters: 517,
    receivedTurn: {
      type: "conversation-turn",
      protocolVersion: "0.1",
      transcript: "Suggest a name",
      focus: { targetId: "form-field:full-name" },
      presence: { humanPresence: "present", agentPresence: "active", mode: "cowork" },
      metrics: {
        sourceTranscriptCharacters: 14,
        includedTranscriptCharacters: 14,
        omittedTranscriptCharacters: 0
      }
    },
    visibleOfferValue: "Grace Hopper",
    valueBeforeHumanClick: "",
    valueAfterHumanClick: "Grace Hopper",
    receiptText: "Applied and verified",
    browserRequestKeys: ["protocolVersion", "turn"],
    authorizationHeaderPresent: false
  };
}

test("a real browser model-host observation proves bounded click-gated plumbing only", () => {
  assert.deepEqual(validateModelHostBrowserObservation(validObservation()), {
    modelHostClaim: true,
    externalModelClaim: false,
    connectedModelClaim: false,
    browserVersion: "Chrome/152",
    packetCharacters: 517,
    clickGatedOffer: true,
    browserCredentials: false
  });
});

test("the model-host proof fails if page context or an action crosses the boundary early", () => {
  assert.throws(
    () =>
      validateModelHostBrowserObservation({
        ...validObservation(),
        receivedTurn: { ...validObservation().receivedTurn, pageHtml: "<main>secret</main>" }
      }),
    /exact bounded turn/
  );
  assert.throws(
    () =>
      validateModelHostBrowserObservation({
        ...validObservation(),
        valueBeforeHumanClick: "Grace Hopper"
      }),
    /human click/
  );
});
