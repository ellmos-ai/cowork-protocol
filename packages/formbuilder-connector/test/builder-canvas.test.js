import assert from "node:assert/strict";
import { test } from "node:test";

import { authorizeActionOffer, createActionOffer } from "../../core/src/index.js";
import {
  BUILDER_CANVAS_TARGET_ID,
  buildFormBuilderCanvasFocus,
  buildFormBuilderFieldFocus,
  builderCanvasCapabilityIds,
  builderFieldTargetId,
  planAuthorizedBuilderFieldMutation
} from "../src/index.js";

function authorizedOffer({ capabilityId, targetId, proposedArguments, pageVersion = 3 }) {
  const offer = createActionOffer({
    offerId: `offer-${capabilityId}`,
    capabilityId,
    targetId,
    pageVersion,
    proposedArguments,
    summary: "Builder suggestion",
    effect: "mutate",
    undoAvailable: true,
    expiresAt: "2026-08-31T10:01:00.000Z"
  });
  const authorization = authorizeActionOffer({
    offer,
    event: {
      origin: "human-click",
      offerId: offer.offerId,
      targetId: offer.targetId,
      pageVersion,
      arguments: proposedArguments
    },
    now: "2026-08-31T10:00:00.000Z"
  });
  return { offer, authorization };
}

test("buildFormBuilderCanvasFocus exposes only the canvas-scoped capability", () => {
  const focus = buildFormBuilderCanvasFocus({ sessionId: "s", pageVersion: 1, fieldCount: 2 });
  assert.equal(focus.targetId, BUILDER_CANVAS_TARGET_ID);
  assert.deepEqual(focus.capabilityIds, ["form-add-field"]);
  assert.equal(focus.focus.label, "Form canvas (2 fields)");
  assert.deepEqual(builderCanvasCapabilityIds(), ["form-add-field", "form-update-field", "form-move-field"]);
});

test("buildFormBuilderCanvasFocus rejects a missing or invalid field count", () => {
  assert.throws(
    () => buildFormBuilderCanvasFocus({ sessionId: "s", pageVersion: 1, fieldCount: -1 }),
    { name: "CoworkProtocolError", code: "CONNECTOR_DEGRADED" }
  );
});

// --- GAP-00: one addressable builder field, not just the whole canvas. ---

test("builderFieldTargetId is the same form-field: convention the fixed demo form uses", () => {
  assert.equal(builderFieldTargetId("abc123"), "form-field:abc123");
  assert.throws(() => builderFieldTargetId(""), { name: "CoworkProtocolError", code: "CONNECTOR_DEGRADED" });
});

test("buildFormBuilderFieldFocus exposes exactly the two field-scoped capabilities, not form-add-field", () => {
  const focus = buildFormBuilderFieldFocus({
    sessionId: "s",
    pageVersion: 3,
    fieldId: "field-3",
    label: "Question three"
  });
  assert.equal(focus.targetId, "form-field:field-3");
  assert.equal(focus.focus.label, "Question three");
  assert.deepEqual(focus.capabilityIds, ["form.explain_field", "form-update-field", "form-move-field"]);
});

test("form-add-field plans an insert at the requested index for a human-authorized offer", () => {
  const field = { id: "new-field", type: "Textfeld (Kurz)", label: "Email" };
  const { offer, authorization } = authorizedOffer({
    capabilityId: "form-add-field",
    targetId: BUILDER_CANVAS_TARGET_ID,
    proposedArguments: { field, index: 1 }
  });
  const plan = planAuthorizedBuilderFieldMutation({
    offer,
    authorization,
    currentElements: [{ id: "existing", type: "Textfeld (Kurz)", label: "Name" }]
  });
  assert.deepEqual(plan, { operation: "add-field", field, index: 1, undoAvailable: true });
});

test("form-add-field rejects an offer that does not target the canvas", () => {
  const field = { id: "new-field", type: "Textfeld (Kurz)", label: "Email" };
  const { offer, authorization } = authorizedOffer({
    capabilityId: "form-add-field",
    targetId: builderFieldTargetId("existing"),
    proposedArguments: { field }
  });
  assert.throws(
    () => planAuthorizedBuilderFieldMutation({ offer, authorization, currentElements: [] }),
    { name: "CoworkProtocolError", code: "STALE_FOCUS" }
  );
});

test("form-add-field rejects a duplicate id and an out-of-range index", () => {
  const existing = { id: "existing", type: "Textfeld (Kurz)", label: "Name" };
  const duplicate = authorizedOffer({
    capabilityId: "form-add-field",
    targetId: BUILDER_CANVAS_TARGET_ID,
    proposedArguments: { field: { ...existing } }
  });
  assert.throws(
    () =>
      planAuthorizedBuilderFieldMutation({
        offer: duplicate.offer,
        authorization: duplicate.authorization,
        currentElements: [existing]
      }),
    { name: "CoworkProtocolError", code: "INVALID_ARGUMENTS" }
  );

  const outOfRange = authorizedOffer({
    capabilityId: "form-add-field",
    targetId: BUILDER_CANVAS_TARGET_ID,
    proposedArguments: { field: { id: "new", type: "Textfeld (Kurz)", label: "X" }, index: 9 }
  });
  assert.throws(
    () =>
      planAuthorizedBuilderFieldMutation({
        offer: outOfRange.offer,
        authorization: outOfRange.authorization,
        currentElements: [existing]
      }),
    { name: "CoworkProtocolError", code: "INVALID_ARGUMENTS" }
  );
});

test("form-update-field targets the exact addressable field, plans a patch and rejects patching id or type", () => {
  const existing = { id: "existing", type: "Textfeld (Kurz)", label: "Name", required: false };
  const { offer, authorization } = authorizedOffer({
    capabilityId: "form-update-field",
    targetId: builderFieldTargetId("existing"),
    proposedArguments: { fieldId: "existing", patch: { required: true } }
  });
  const plan = planAuthorizedBuilderFieldMutation({ offer, authorization, currentElements: [existing] });
  assert.deepEqual(plan, {
    operation: "update-field",
    fieldId: "existing",
    patch: { required: true },
    undoAvailable: true
  });

  const forbidden = authorizedOffer({
    capabilityId: "form-update-field",
    targetId: builderFieldTargetId("existing"),
    proposedArguments: { fieldId: "existing", patch: { type: "Datumsauswahl" } }
  });
  assert.throws(
    () =>
      planAuthorizedBuilderFieldMutation({
        offer: forbidden.offer,
        authorization: forbidden.authorization,
        currentElements: [existing]
      }),
    { name: "CoworkProtocolError", code: "INVALID_ARGUMENTS" }
  );
});

test("form-update-field rejects an offer whose targetId does not name the field it patches", () => {
  const existing = { id: "existing", type: "Textfeld (Kurz)", label: "Name" };
  // Points at a *different* field than the one the arguments name - this is
  // exactly the GAP-00 hole: without this check, one canvas-wide target could
  // silently authorize a mutation to any field named in the arguments.
  const { offer, authorization } = authorizedOffer({
    capabilityId: "form-update-field",
    targetId: builderFieldTargetId("someone-else"),
    proposedArguments: { fieldId: "existing", patch: { label: "Hijacked" } }
  });
  assert.throws(
    () => planAuthorizedBuilderFieldMutation({ offer, authorization, currentElements: [existing] }),
    { name: "CoworkProtocolError", code: "STALE_FOCUS" }
  );
});

test("form-update-field fails closed when the target field no longer exists", () => {
  const { offer, authorization } = authorizedOffer({
    capabilityId: "form-update-field",
    targetId: builderFieldTargetId("gone"),
    proposedArguments: { fieldId: "gone", patch: { label: "New label" } }
  });
  assert.throws(
    () => planAuthorizedBuilderFieldMutation({ offer, authorization, currentElements: [] }),
    { name: "CoworkProtocolError", code: "STALE_FOCUS" }
  );
});

test("form-move-field targets the exact addressable field and fails closed at the boundary", () => {
  const elements = [
    { id: "a", type: "Textfeld (Kurz)", label: "A" },
    { id: "b", type: "Textfeld (Kurz)", label: "B" }
  ];
  const { offer, authorization } = authorizedOffer({
    capabilityId: "form-move-field",
    targetId: builderFieldTargetId("b"),
    proposedArguments: { fieldId: "b", direction: "up" }
  });
  assert.deepEqual(planAuthorizedBuilderFieldMutation({ offer, authorization, currentElements: elements }), {
    operation: "move-field",
    fieldId: "b",
    direction: "up",
    undoAvailable: true
  });

  const boundary = authorizedOffer({
    capabilityId: "form-move-field",
    targetId: builderFieldTargetId("a"),
    proposedArguments: { fieldId: "a", direction: "up" }
  });
  assert.throws(
    () =>
      planAuthorizedBuilderFieldMutation({
        offer: boundary.offer,
        authorization: boundary.authorization,
        currentElements: elements
      }),
    { name: "CoworkProtocolError", code: "INVALID_ARGUMENTS" }
  );
});

test("a builder offer without a matching human click cannot produce a plan", () => {
  const field = { id: "new-field", type: "Textfeld (Kurz)", label: "Email" };
  const offer = createActionOffer({
    offerId: "offer-unauthorized",
    capabilityId: "form-add-field",
    targetId: BUILDER_CANVAS_TARGET_ID,
    pageVersion: 3,
    proposedArguments: { field },
    summary: "Add Email",
    effect: "mutate",
    undoAvailable: true,
    expiresAt: "2026-08-31T10:01:00.000Z"
  });
  // A forged authorization for a *different* offer must not authorize this one.
  const otherOffer = createActionOffer({
    offerId: "offer-other",
    capabilityId: "form-add-field",
    targetId: BUILDER_CANVAS_TARGET_ID,
    pageVersion: 3,
    proposedArguments: { field: { id: "different", type: "Textfeld (Kurz)", label: "Other" } },
    summary: "Add Other",
    effect: "mutate",
    undoAvailable: true,
    expiresAt: "2026-08-31T10:01:00.000Z"
  });
  const authorization = authorizeActionOffer({
    offer: otherOffer,
    event: {
      origin: "human-click",
      offerId: otherOffer.offerId,
      targetId: otherOffer.targetId,
      pageVersion: 3,
      arguments: otherOffer.proposedArguments
    },
    now: "2026-08-31T10:00:00.000Z"
  });
  assert.throws(
    () => planAuthorizedBuilderFieldMutation({ offer, authorization, currentElements: [] }),
    { name: "CoworkProtocolError", code: "HUMAN_CONFIRMATION_REQUIRED" }
  );
});

test("a stale page version fails closed even with a correctly shaped authorization", () => {
  const field = { id: "new-field", type: "Textfeld (Kurz)", label: "Email" };
  const offer = createActionOffer({
    offerId: "offer-stale",
    capabilityId: "form-add-field",
    targetId: BUILDER_CANVAS_TARGET_ID,
    pageVersion: 5,
    proposedArguments: { field },
    summary: "Add Email",
    effect: "mutate",
    undoAvailable: true,
    expiresAt: "2026-08-31T10:01:00.000Z"
  });
  assert.throws(
    () =>
      authorizeActionOffer({
        offer,
        event: {
          origin: "human-click",
          offerId: offer.offerId,
          targetId: offer.targetId,
          pageVersion: 6, // the canvas changed after the offer was shown
          arguments: { field }
        },
        now: "2026-08-31T10:00:00.000Z"
      }),
    { name: "CoworkProtocolError", code: "STALE_PAGE_VERSION" }
  );
});

test("a read-only or unknown capability cannot mutate the canvas or a field", () => {
  const { offer, authorization } = authorizedOffer({
    capabilityId: "form.explain_field",
    targetId: BUILDER_CANVAS_TARGET_ID,
    proposedArguments: {}
  });
  assert.throws(
    () => planAuthorizedBuilderFieldMutation({ offer, authorization, currentElements: [] }),
    { name: "CoworkProtocolError", code: "CAPABILITY_UNAVAILABLE" }
  );
});
