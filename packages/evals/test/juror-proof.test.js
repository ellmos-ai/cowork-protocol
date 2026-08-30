import assert from "node:assert/strict";
import { test } from "node:test";

import { runJurorProof } from "../src/juror-proof.js";

test("the juror proof exercises human authorization, scoped solo work and the real FormBuilder export", () => {
  const proof = runJurorProof();
  const steps = Object.fromEntries(proof.steps.map((step) => [step.id, step]));

  assert.equal(proof.proofVersion, "cowork-juror-proof-v2");
  assert.equal(proof.browserClaim, false);
  assert.equal(proof.hostTokenClaim, false);
  assert.deepEqual(proof.summary, { passed: 7, failed: 0 });

  assert.equal(steps.focus.evidence.targetId, "form-field:full-name");
  assert.equal(steps.focus.evidence.contextCharacters <= 350, true);
  assert.deepEqual(steps.focus.evidence.capabilityIds, [
    "form.explain_field",
    "form.set_value",
    "form.clear_value"
  ]);

  assert.equal(steps["context-request"].evidence.targetId, "form-field:full-name");
  assert.equal(steps["context-request"].evidence.level, 3);
  assert.equal(steps["context-request"].evidence.oneShot, true);
  assert.equal(steps["context-request"].evidence.includedContextCharacters <= 1200, true);

  assert.equal(steps["offer-only"].evidence.valueBeforeHumanClick, "Ada Lovelace");
  assert.equal(
    steps["offer-only"].evidence.syntheticAuthorizationRejected,
    "HUMAN_CONFIRMATION_REQUIRED"
  );

  assert.equal(steps["human-click"].evidence.authorizationSource, "human-click");
  assert.equal(steps["human-click"].evidence.nextValue, "Lukas Geiger");

  assert.equal(steps["verified-feedback"].evidence.receiptStatus, "verified");
  assert.equal(steps["verified-feedback"].evidence.changeCause, "offer:proof-offer-1");
  assert.equal(steps["verified-feedback"].evidence.feedbackVerdict, "accepted");

  assert.equal(steps["agent-solo"].evidence.authorizationSource, "solo-lease");
  assert.equal(steps["agent-solo"].evidence.remainingCalls, 1);
  assert.equal(steps["agent-solo"].evidence.nextValue, "lukas@example.com");

  assert.equal(steps.export.evidence.schema, "formularerstellen-response-v1");
  assert.equal(steps.export.evidence.answerCount, 4);
});
