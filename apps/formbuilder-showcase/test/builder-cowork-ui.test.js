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

// --- The same reach the panel's own model has: a field with answer choices.
// A label cannot carry choices, and an agent that tries writes the question
// "How many kids do you have? (1, 2, 3)" instead of asking it. ---

test("an agent offers a field with answer choices by sending JSON instead of a label", () => {
  const { cowork, controller, point } = fakeStudio();
  point(null, "click");
  const offer = cowork.offerFromAgent({
    capabilityId: "form-add-field",
    targetId: BUILDER_CANVAS_TARGET_ID,
    value: JSON.stringify({
      paletteId: "checkbox-single",
      label: "How many kids do you have?",
      options: ["1", "2", "3", "8 or more"],
      required: true
    }),
    summary: "Add the number-of-children question"
  });
  const { field } = offer.proposedArguments;
  assert.equal(field.label, "How many kids do you have?");
  assert.equal(field.type, "Checkbox (Single)");
  assert.deepEqual(field.options, ["1", "2", "3", "8 or more"]);
  assert.equal(field.required, true);
  assert.equal(controller.getElements().length, 0, "an offer alone changes nothing");

  const receipt = cowork.applyOffer(offer.offerId);
  assert.equal(receipt.status, "verified");
  assert.deepEqual(controller.getElements()[0].options, ["1", "2", "3", "8 or more"]);
});

test("unusable answer choices cost the choices, not the field, and the summary says why", () => {
  const { cowork, point } = fakeStudio();
  point(null, "click");
  const offer = cowork.offerFromAgent({
    capabilityId: "form-add-field",
    targetId: BUILDER_CANVAS_TARGET_ID,
    value: JSON.stringify({ paletteId: "text-short", label: "Your name", options: ["a", "b"] }),
    summary: "Add a name field."
  });
  assert.equal(offer.proposedArguments.field.label, "Your name");
  assert.equal(offer.proposedArguments.field.options, undefined);
  assert.match(offer.summary, /this field type has none/);

  assert.throws(
    () =>
      cowork.offerFromAgent({
        capabilityId: "form-add-field",
        targetId: BUILDER_CANVAS_TARGET_ID,
        value: JSON.stringify({ paletteId: "checkbox-single" }),
        summary: "x"
      }),
    { code: "INVALID_ARGUMENTS" }
  );
});

test("a JSON patch rewrites a field's choices, and may never touch its id or type", () => {
  const field = createField("checkbox-single", { label: "Kids", options: ["Yes", "No"] });
  const { cowork, controller, point } = fakeStudio(insertField([], field));
  point(field.id);
  const focus = cowork.readFocusPacket();

  assert.throws(
    () =>
      cowork.offerFromAgent({
        capabilityId: "form-update-field",
        targetId: focus.targetId,
        value: JSON.stringify({ type: "Textfeld (Kurz)", label: "Kids" }),
        summary: "x"
      }),
    { code: "INVALID_ARGUMENTS" }
  );

  const offer = cowork.offerFromAgent({
    capabilityId: "form-update-field",
    targetId: focus.targetId,
    value: JSON.stringify({ label: "How many kids?", options: ["1", "2", "3 or more"], required: true }),
    summary: "Rewrite the choices"
  });
  assert.equal(controller.getElements()[0].label, "Kids", "inert before the click");
  const receipt = cowork.applyOffer(offer.offerId);
  assert.equal(receipt.status, "verified");
  const updated = controller.getElements()[0];
  assert.equal(updated.label, "How many kids?");
  assert.deepEqual(updated.options, ["1", "2", "3 or more"]);
  assert.equal(updated.required, true);
});

// --- Where an agent learns the formats. The tool schema says a paletteId is
// a string; it cannot say which string a "how often does this happen" question
// needs. The canvas context is where that is answered. ---

test("the canvas context tells an agent which field types exist and what each is for", () => {
  const { cowork, point } = fakeStudio();
  point(null, "click");
  const context = cowork.requestContext({ reason: "What can I build here?" });
  const related = JSON.parse(context.relatedContext);
  assert.equal(related.fieldTypes.length, 8);
  assert.ok(
    related.fieldTypes.some((line) => line.startsWith("checkbox-single (Choose one, takes options):")),
    `no option-bearing type described: ${JSON.stringify(related.fieldTypes)}`
  );
  assert.ok(
    related.fieldTypes.every((line) => /: \w/.test(line)),
    "every type states what it is for"
  );
  assert.match(related.title, /Family survey/);
});

test("a crowded canvas drops labels rather than handing back half a JSON object", () => {
  const many = Array.from({ length: 40 }, (_, index) =>
    createField("text-short", { label: `Question number ${index} about something quite long` })
  );
  const { cowork, point } = fakeStudio(many.reduce((list, field) => insertField(list, field), []));
  point(null, "click");
  const context = cowork.requestContext({ reason: "What is on this form?" });
  assert.ok(context.relatedContext.length <= 1200, `context was ${context.relatedContext.length}`);
  const related = JSON.parse(context.relatedContext); // the point: still parses
  assert.equal(related.fieldCount, 40, "the true count survives even when the labels do not");
  assert.equal(related.fieldTypes.length, 8, "the formats are never the part that gets dropped");
  assert.ok(related.labels.length < 40, "labels are what yields to the budget");
});
