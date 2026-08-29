import assert from "node:assert/strict";
import test from "node:test";

import {
  SHOWCASE_SCHEMA,
  createShowcaseSubmission
} from "../src/formbuilder-use-case.js";

test("the flagship uses the real FormBuilder web schema and stable field IDs", () => {
  assert.equal(SHOWCASE_SCHEMA.schema, "formularerstellen-form-v1");
  assert.deepEqual(
    SHOWCASE_SCHEMA.form.elements.map((field) => field.id),
    ["full-name", "email", "role", "access-needs"]
  );
});

test("the FormBuilder web engine blocks missing required values", () => {
  const result = createShowcaseSubmission({
    "full-name": "",
    email: "",
    role: "Developer",
    "access-needs": ""
  });

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.missing.map((field) => field.id),
    ["full-name", "email"]
  );
});

test("a valid human submission produces the FormBuilder response contract", () => {
  const result = createShowcaseSubmission({
    "full-name": "Lukas",
    email: "lukas@example.com",
    role: "Developer",
    "access-needs": "Step-free access"
  });

  assert.equal(result.ok, true);
  assert.equal(result.response.schema, "formularerstellen-response-v1");
  assert.equal(result.response.source_form, "Event registration");
  assert.deepEqual(
    result.response.responses.map(({ field_id, value }) => ({ field_id, value })),
    [
      { field_id: "full-name", value: "Lukas" },
      { field_id: "email", value: "lukas@example.com" },
      { field_id: "role", value: "Developer" },
      { field_id: "access-needs", value: "Step-free access" }
    ]
  );
});
