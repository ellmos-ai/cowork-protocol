import assert from "node:assert/strict";
import { test } from "node:test";

import { classifyBuilderDirective } from "../src/builder-directive-classifier.js";

test("classifies a required directive", () => {
  const plan = classifyBuilderDirective("Make this required", { fieldId: "q3", fieldIndex: 2, required: false });
  assert.deepEqual(plan, {
    capabilityId: "form-update-field",
    steps: [{ proposedArguments: { fieldId: "q3", patch: { required: true } } }]
  });
});

test("classifies an optional directive and recognizes 'not required' too", () => {
  const plan = classifyBuilderDirective("This one is optional", { fieldId: "q3", fieldIndex: 2, required: true });
  assert.deepEqual(plan, {
    capabilityId: "form-update-field",
    steps: [{ proposedArguments: { fieldId: "q3", patch: { required: false } } }]
  });
  const plan2 = classifyBuilderDirective("it's not required", { fieldId: "q3", fieldIndex: 2, required: true });
  assert.equal(plan2.steps[0].proposedArguments.patch.required, false);
});

test("returns null when the requested state already holds - no redundant call", () => {
  assert.equal(
    classifyBuilderDirective("make it required", { fieldId: "q3", fieldIndex: 2, required: true }),
    null
  );
  assert.equal(
    classifyBuilderDirective("make it optional", { fieldId: "q3", fieldIndex: 2, required: false }),
    null
  );
});

test("classifies a single up/down move", () => {
  const up = classifyBuilderDirective("move it up", { fieldId: "q3", fieldIndex: 2, required: false });
  assert.deepEqual(up, {
    capabilityId: "form-move-field",
    steps: [{ proposedArguments: { fieldId: "q3", direction: "up" } }]
  });
  const down = classifyBuilderDirective("move this down please", { fieldId: "q3", fieldIndex: 2, required: false });
  assert.equal(down.steps[0].proposedArguments.direction, "down");
});

test("classifies 'make this the first question' as a bounded sequence of one-step moves", () => {
  const plan = classifyBuilderDirective("make this the first question", {
    fieldId: "q3",
    fieldIndex: 3,
    required: false
  });
  assert.equal(plan.capabilityId, "form-move-field");
  assert.equal(plan.steps.length, 3);
  assert.ok(plan.steps.every((step) => step.proposedArguments.direction === "up"));
});

test("already-first field produces no steps for 'make this the first question'", () => {
  const plan = classifyBuilderDirective("make this the first question", {
    fieldId: "q1",
    fieldIndex: 0,
    required: false
  });
  assert.equal(plan, null);
});

test("returns null for unrecognized or empty input", () => {
  assert.equal(classifyBuilderDirective("what does this field do", { fieldId: "q3", fieldIndex: 2 }), null);
  assert.equal(classifyBuilderDirective("", { fieldId: "q3", fieldIndex: 2 }), null);
  assert.equal(classifyBuilderDirective(undefined, { fieldId: "q3", fieldIndex: 2 }), null);
});

test("'later' and 'earlier' without 'move' stay informational - no field moves on small talk", () => {
  const context = { fieldId: "q3", fieldIndex: 3, required: false };
  assert.equal(classifyBuilderDirective("I'll fill this in later", context), null);
  assert.equal(classifyBuilderDirective("earlier today we discussed this", context), null);
  assert.equal(classifyBuilderDirective("move it earlier", context).steps[0].proposedArguments.direction, "up");
  assert.equal(classifyBuilderDirective("move this one later", context).steps[0].proposedArguments.direction, "down");
});
