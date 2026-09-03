// New Cowork Protocol challenge work: a small, disclosed keyword heuristic
// that turns a few recognized spoken/typed phrases about the CURRENTLY
// FOCUSED builder field into one or more structural capability calls. This is
// the same kind of "local demo helper" local-conversation.js already is for
// the fixed demo form (a scripted stand-in, not real language understanding)
// - not a claim of natural-language intelligence. No Cowork Protocol import:
// this only classifies text into a plan; app.js/builder-cowork-ui.js decide
// whether and how to authorize it.

/**
 * Classifies a human utterance about `targetField` into zero or more
 * form-update-field/form-move-field calls. Returns null if nothing
 * recognized (the utterance stays informational, not a directive).
 * `fieldIndex` is the field's current position, needed only for "make this
 * the first question," which becomes a bounded sequence of one-step moves.
 */
export function classifyBuilderDirective(transcript, { fieldId, fieldIndex, required }) {
  const text = typeof transcript === "string" ? transcript.trim().toLowerCase() : "";
  if (text === "") return null;

  if (/\b(not required|no longer required|optional)\b/.test(text)) {
    if (required === false) return null;
    return {
      capabilityId: "form-update-field",
      steps: [{ proposedArguments: { fieldId, patch: { required: false } } }]
    };
  }
  if (/\brequired\b/.test(text)) {
    if (required === true) return null;
    return {
      capabilityId: "form-update-field",
      steps: [{ proposedArguments: { fieldId, patch: { required: true } } }]
    };
  }
  if (/\b(first question|move.*top|top of the form)\b/.test(text)) {
    const steps = Array.from({ length: Math.max(0, fieldIndex) }, () => ({
      proposedArguments: { fieldId, direction: "up" }
    }));
    return steps.length > 0 ? { capabilityId: "form-move-field", steps } : null;
  }
  // Both alternatives need the verb: "later"/"earlier" alone are small talk,
  // and under GAP-02 a recognized phrase mutates without a second click.
  if (/\bmove\b.*\b(up|earlier)\b/.test(text)) {
    return {
      capabilityId: "form-move-field",
      steps: [{ proposedArguments: { fieldId, direction: "up" } }]
    };
  }
  if (/\bmove\b.*\b(down|later)\b/.test(text)) {
    return {
      capabilityId: "form-move-field",
      steps: [{ proposedArguments: { fieldId, direction: "down" } }]
    };
  }
  return null;
}
