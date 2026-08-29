import {
  buildResponse,
  parseSchema,
  validateRequired
} from "./form-engine.mjs";

export const SHOWCASE_SCHEMA = Object.freeze({
  schema: "formularerstellen-form-v1",
  schema_version: 1,
  form: {
    title: "Event registration",
    elements: [
      {
        id: "full-name",
        type: "Textfeld (Kurz)",
        label: "Full name",
        required: true
      },
      {
        id: "email",
        type: "Textfeld (Kurz)",
        label: "Email address",
        required: true
      },
      {
        id: "role",
        type: "Checkbox (Single)",
        label: "Role",
        options: ["Developer", "Designer", "Product"],
        required: false
      },
      {
        id: "access-needs",
        type: "Textfeld (Lang)",
        label: "Access needs",
        required: false
      }
    ]
  }
});

const parsedShowcaseSchema = parseSchema(SHOWCASE_SCHEMA);

export function createShowcaseSubmission(values) {
  const missing = validateRequired(parsedShowcaseSchema.elements, values);
  if (missing.length > 0) return { ok: false, missing };

  return {
    ok: true,
    response: buildResponse(
      parsedShowcaseSchema.title,
      parsedShowcaseSchema.elements,
      values
    )
  };
}
