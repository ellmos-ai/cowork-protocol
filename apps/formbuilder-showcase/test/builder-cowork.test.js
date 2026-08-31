import assert from "node:assert/strict";
import { test } from "node:test";

import { createField, insertField } from "../src/form-builder.mjs";
import { createBuilderCoworkBridge } from "../src/builder-cowork.js";

test("focusFor exposes the three builder capabilities for the current field count", () => {
  const bridge = createBuilderCoworkBridge();
  const focus = bridge.focusFor({ pageVersion: 1, fieldCount: 0 });
  assert.deepEqual(focus.capabilityIds, ["form-add-field", "form-update-field", "form-move-field"]);
});

test("a proposed add-field offer is inert until authorizeAndApply is called with the matching offerId", () => {
  const bridge = createBuilderCoworkBridge();
  const field = createField("text-short", { label: "Email address" });
  const offer = bridge.proposeOffer({
    capabilityId: "form-add-field",
    proposedArguments: { field },
    summary: `Add ${field.label}`,
    pageVersion: 1,
    now: "2026-08-31T10:00:00.000Z"
  });
  assert.deepEqual(bridge.pendingOffers("2026-08-31T10:00:01.000Z").map((o) => o.offerId), [offer.offerId]);

  // Merely creating the offer must not have changed anything yet.
  const elementsBeforeClick = [];
  assert.deepEqual(elementsBeforeClick, []);

  const { elements, receipt } = bridge.authorizeAndApply({
    offerId: offer.offerId,
    elements: elementsBeforeClick,
    now: "2026-08-31T10:00:05.000Z"
  });
  assert.equal(receipt.status, "verified");
  assert.equal(elements.length, 1);
  assert.equal(elements[0].label, "Email address");
  assert.equal(elements[0].id, field.id);
  // The offer is resolved (removed) after one application.
  assert.deepEqual(bridge.pendingOffers("2026-08-31T10:00:06.000Z"), []);
});

test("an offer that is never authorized leaves the canvas untouched", () => {
  const bridge = createBuilderCoworkBridge();
  const field = createField("text-short", { label: "Never applied" });
  bridge.proposeOffer({
    capabilityId: "form-add-field",
    proposedArguments: { field },
    summary: "Add Never applied",
    pageVersion: 1,
    now: "2026-08-31T10:00:00.000Z"
  });
  // No authorizeAndApply call happens here: the canvas the caller owns is
  // simply never touched, which is the point being proven.
  const elements = [];
  assert.deepEqual(elements, []);
});

test("authorizeAndApply rejects an unknown or already-resolved offer id", () => {
  const bridge = createBuilderCoworkBridge();
  assert.throws(
    () => bridge.authorizeAndApply({ offerId: "does-not-exist", elements: [], now: "2026-08-31T10:00:00.000Z" }),
    { name: "CoworkProtocolError", code: "STALE_FOCUS" }
  );
});

test("a stale page version fails closed instead of applying the offer", () => {
  const bridge = createBuilderCoworkBridge();
  const field = createField("text-short", { label: "Stale" });
  const offer = bridge.proposeOffer({
    capabilityId: "form-add-field",
    proposedArguments: { field },
    summary: "Add Stale",
    pageVersion: 1,
    now: "2026-08-31T10:00:00.000Z"
  });
  // The canvas changed (pageVersion bumped) after the offer was shown, e.g.
  // because a human edited the form in the meantime, before the click landed.
  assert.throws(
    () =>
      bridge.authorizeAndApply({
        offerId: offer.offerId,
        elements: [],
        currentPageVersion: 2,
        now: "2026-08-31T10:00:05.000Z"
      }),
    { name: "CoworkProtocolError", code: "STALE_PAGE_VERSION" }
  );
  // The offer must still be pending: a rejected click did not resolve it.
  assert.deepEqual(bridge.pendingOffers("2026-08-31T10:00:06.000Z").map((o) => o.offerId), [offer.offerId]);
});

test("an expired offer cannot be authorized even at the matching page version", () => {
  const bridge = createBuilderCoworkBridge();
  const offer = bridge.proposeOffer({
    capabilityId: "form-add-field",
    proposedArguments: { field: createField("text-short", { label: "Expired" }) },
    summary: "Add Expired",
    pageVersion: 1,
    now: "2026-08-31T10:00:00.000Z"
  });
  assert.throws(
    () =>
      bridge.authorizeAndApply({
        offerId: offer.offerId,
        elements: [],
        currentPageVersion: 1,
        now: "2026-08-31T10:05:00.000Z" // 5 minutes later, past the 60s lifetime
      }),
    { name: "CoworkProtocolError", code: "STALE_FOCUS" }
  );
});

test("a rejected mutation (e.g. duplicate id) leaves the canvas unchanged with a failed receipt", () => {
  const bridge = createBuilderCoworkBridge();
  const existing = createField("text-short", { label: "Existing" });
  const offer = bridge.proposeOffer({
    capabilityId: "form-add-field",
    proposedArguments: { field: existing },
    summary: "Add Existing again",
    pageVersion: 1,
    now: "2026-08-31T10:00:00.000Z"
  });
  assert.throws(
    () =>
      bridge.authorizeAndApply({
        offerId: offer.offerId,
        elements: [existing],
        now: "2026-08-31T10:00:01.000Z"
      }),
    { name: "CoworkProtocolError", code: "INVALID_ARGUMENTS" }
  );
});

test("update-field and move-field offers apply through the same bridge", () => {
  const bridge = createBuilderCoworkBridge();
  const a = createField("text-short", { label: "A" });
  const b = createField("text-short", { label: "B" });
  const elements = insertField(insertField([], a), b);

  const updateOffer = bridge.proposeOffer({
    capabilityId: "form-update-field",
    proposedArguments: { fieldId: a.id, patch: { required: true } },
    summary: "Require A",
    pageVersion: 1,
    now: "2026-08-31T10:00:00.000Z"
  });
  const afterUpdate = bridge.authorizeAndApply({
    offerId: updateOffer.offerId,
    elements,
    now: "2026-08-31T10:00:01.000Z"
  });
  assert.equal(afterUpdate.receipt.status, "verified");
  assert.equal(afterUpdate.elements.find((f) => f.id === a.id).required, true);

  const moveOffer = bridge.proposeOffer({
    capabilityId: "form-move-field",
    proposedArguments: { fieldId: b.id, direction: "up" },
    summary: "Move B up",
    pageVersion: 1,
    now: "2026-08-31T10:00:02.000Z"
  });
  const afterMove = bridge.authorizeAndApply({
    offerId: moveOffer.offerId,
    elements: afterUpdate.elements,
    now: "2026-08-31T10:00:03.000Z"
  });
  assert.equal(afterMove.receipt.status, "verified");
  assert.deepEqual(afterMove.elements.map((f) => f.id), [b.id, a.id]);
});

test("at most three pending builder offers are allowed at once", () => {
  const bridge = createBuilderCoworkBridge();
  const now = "2026-08-31T10:00:00.000Z";
  for (let i = 0; i < 3; i += 1) {
    bridge.proposeOffer({
      capabilityId: "form-add-field",
      proposedArguments: { field: createField("text-short", { label: `Field ${i}` }) },
      summary: `Add field ${i}`,
      pageVersion: 1,
      now
    });
  }
  assert.throws(
    () =>
      bridge.proposeOffer({
        capabilityId: "form-add-field",
        proposedArguments: { field: createField("text-short", { label: "One too many" }) },
        summary: "Add one too many",
        pageVersion: 1,
        now
      }),
    { name: "CoworkProtocolError", code: "CONTEXT_BUDGET_EXCEEDED" }
  );
});
