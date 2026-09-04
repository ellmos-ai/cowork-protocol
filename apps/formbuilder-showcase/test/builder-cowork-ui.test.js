// The Studio through the page's WebMCP tools (builder-cowork-ui.js): focus,
// context and an inert offer for the canvas and for one field, driven by the
// same pointer/click events the adapter listens to in the browser. No DOM:
// a fake Studio surface records the listeners, a fake controller owns the
// field list the way builder-view.js does.
import assert from "node:assert/strict";
import { test } from "node:test";

import { createField, insertField } from "../src/form-builder.mjs";
import { BUILDER_CANVAS_TARGET_ID, builderFieldTargetId } from "../src/builder-cowork.js";
import { initBuilderCowork } from "../src/builder-cowork-ui.js";

function fakeStudio(initialElements = []) {
  const listeners = new Map();
  const surface = { addEventListener: (type, handler) => listeners.set(type, handler) };
  const root = {
    querySelector: (selector) => (selector === ".builder-studio" ? surface : null),
    querySelectorAll: () => []
  };
  let elements = initialElements;
  let pageVersion = 1;
  const controller = {
    getElements: () => elements,
    getPageVersion: () => pageVersion,
    getTitle: () => "Family survey",
    onPageVersionChange: () => {},
    applyElements: (next) => {
      elements = next;
      pageVersion += 1;
    }
  };
  const cowork = initBuilderCowork({ root, controller, modelSeat: null });
  const point = (fieldId, type = "pointerover") =>
    listeners.get(type)({ type, target: { closest: () => (fieldId === null ? null : { dataset: { fieldId } }) } });
  return { cowork, controller, point };
}

test("without a lens target the three Studio tool paths fail closed with STALE_FOCUS", () => {
  const { cowork } = fakeStudio();
  assert.equal(cowork.readFocusPacket(), null);
  assert.throws(() => cowork.requestContext({ reason: "why" }), { code: "STALE_FOCUS" });
  assert.throws(
    () => cowork.offerFromAgent({ capabilityId: "form-add-field", targetId: BUILDER_CANVAS_TARGET_ID, value: "x", summary: "x" }),
    { code: "STALE_FOCUS" }
  );
});

test("a click on Studio chrome focuses the canvas: add-field is offerable there, with an optional palette prefix", () => {
  const { cowork, controller, point } = fakeStudio();
  point(null, "click");
  const focus = cowork.readFocusPacket();
  assert.equal(focus.targetId, BUILDER_CANVAS_TARGET_ID);
  assert.deepEqual(focus.capabilityIds, ["form-add-field"]);

  const context = cowork.requestContext({ reason: "Which fields exist already?" });
  assert.equal(context.level, 3);
  assert.match(context.relatedContext, /Family survey/);

  const offer = cowork.offerFromAgent({
    capabilityId: "form-add-field",
    targetId: BUILDER_CANVAS_TARGET_ID,
    value: "date: Preferred date",
    summary: "Add a date"
  });
  assert.equal(offer.proposedArguments.field.label, "Preferred date");
  assert.equal(offer.proposedArguments.field.type, "Datumsauswahl");
  assert.equal(controller.getElements().length, 0, "an offer alone changes nothing");

  const bare = cowork.offerFromAgent({
    capabilityId: "form-add-field",
    targetId: BUILDER_CANVAS_TARGET_ID,
    value: "Phone number",
    summary: "Add a phone number"
  });
  assert.equal(bare.proposedArguments.field.label, "Phone number");
  assert.equal(bare.proposedArguments.field.type, "Textfeld (Kurz)");
});

test("pointing at a Studio row focuses that field on the form-field target; an update offer stays inert until applied", () => {
  const field = createField("text-short", { label: "Email" });
  const { cowork, controller, point } = fakeStudio(insertField([], field));
  point(field.id);
  const focus = cowork.readFocusPacket();
  assert.equal(focus.targetId, builderFieldTargetId(field.id));
  assert.ok(focus.capabilityIds.includes("form-update-field"));

  const context = cowork.requestContext({ reason: "Need the field kind" });
  assert.equal(context.targetId, focus.targetId);
  assert.match(context.relatedContext, /Short answer/);

  assert.throws(
    () => cowork.offerFromAgent({ capabilityId: "form-update-field", targetId: "form-field:other", value: "x", summary: "x" }),
    { code: "STALE_FOCUS" }
  );
  assert.throws(
    () => cowork.offerFromAgent({ capabilityId: "form-add-field", targetId: focus.targetId, value: "x", summary: "x" }),
    { code: "CAPABILITY_UNAVAILABLE" }
  );
  assert.throws(
    () => cowork.offerFromAgent({ capabilityId: "form-move-field", targetId: focus.targetId, value: "sideways", summary: "x" }),
    { code: "INVALID_ARGUMENTS" }
  );

  const offer = cowork.offerFromAgent({
    capabilityId: "form-update-field",
    targetId: focus.targetId,
    value: "Work email",
    summary: "Rename to Work email"
  });
  assert.equal(cowork.pendingOffers().length, 1);
  assert.equal(controller.getElements()[0].label, "Email", "inert before the click");

  const receipt = cowork.applyOffer(offer.offerId);
  assert.equal(receipt.status, "verified");
  assert.equal(controller.getElements()[0].label, "Work email");
  assert.equal(cowork.pendingOffers().length, 0);
});

test("a canvas-scoped grant lets an agent add Studio fields with no click, inside the budget the human granted", () => {
  const { cowork, controller } = fakeStudio();
  const lease = {
    leaseId: "companion-lease-1",
    origin: "human-click",
    goal: "Draft the rest of this form",
    allowedCapabilityIds: ["form-add-field"],
    allowedTargetIds: [BUILDER_CANVAS_TARGET_ID],
    maxCalls: 2,
    pageVersion: 1,
    expiresAt: new Date(Date.now() + 120_000).toISOString()
  };

  // No grant of its own: the Studio continues the one the human already minted.
  assert.throws(() => cowork.soloAddField({ value: "First question" }), { code: "LEASE_EXPIRED" });

  const grant = cowork.adoptGrant(lease);
  assert.equal(grant.goal, lease.goal);
  assert.equal(grant.maxCalls, 2, "the adopted grant copies the budget, it does not widen it");
  assert.equal(cowork.adoptGrant(lease), grant, "adopting twice keeps the running grant");

  const first = cowork.soloAddField({ value: "date: Preferred date", humanPresence: "afk-short" });
  assert.equal(first.status, "verified");
  assert.deepEqual(
    controller.getElements().map((element) => [element.label, element.type]),
    [["Preferred date", "Datumsauswahl"]],
    "the field lands on the canvas without any click"
  );
  const second = cowork.soloAddField({ value: "How did you hear about us?" });
  assert.equal(second.status, "verified");
  assert.equal(controller.getElements().length, 2);

  // The budget is the whole authority: spent means spent, no matter who asks.
  assert.throws(() => cowork.soloAddField({ value: "One too many" }), { code: "LEASE_EXPIRED" });
  assert.equal(controller.getElements().length, 2);
});

test("a Studio solo call refuses an empty label and an expired grant", () => {
  const { cowork, controller } = fakeStudio();
  const expired = {
    leaseId: "companion-lease-2",
    origin: "human-click",
    goal: "Draft the rest of this form",
    allowedCapabilityIds: ["form-add-field"],
    allowedTargetIds: [BUILDER_CANVAS_TARGET_ID],
    maxCalls: 4,
    pageVersion: 1,
    expiresAt: new Date(Date.now() - 1).toISOString()
  };
  assert.throws(() => cowork.adoptGrant(expired), { code: "LEASE_EXPIRED" });

  cowork.adoptGrant({ ...expired, expiresAt: new Date(Date.now() + 120_000).toISOString() });
  assert.throws(() => cowork.soloAddField({ value: "   " }), { code: "INVALID_ARGUMENTS" });
  assert.equal(controller.getElements().length, 0);
});
