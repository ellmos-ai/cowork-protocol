// New Cowork Protocol challenge work (GAP-06): a small, disclosed heuristic
// - the same kind of scripted local helper local-conversation.js and
// builder-directive-classifier.js already are, not a claim of language
// understanding - that turns a real, already-observed human ChangeEvent into
// one bounded advisory comment. No Cowork Protocol import: this only reads
// the caller-supplied facts (the change itself, the current mode/presence,
// and the field's own required flag) and returns text or null; app.js
// decides whether, when and where to show it.

const COMMENT_LIMIT = 350;

/**
 * Returns one bounded advisory comment about a human-caused change, or null
 * if this is not a moment to comment at all. The caller is responsible for
 * "latest-only" (storing this in a single variable it overwrites, never a
 * list) - this function only decides content, not retention.
 *
 * Never fires for:
 * - an agent-caused change (`change.source !== "human"`) - only a human's
 *   own action is ever commented on;
 * - a model that is not advising (`advising === false`): it either holds the
 *   click right itself, or it is on standby / disconnected. Advising is the
 *   merged explain+suggest state - commenting and proposing are one role;
 * - silence or an unchanged value (`change` is null - the caller already
 *   never creates a ChangeEvent for those, so this is a defensive check).
 */
export function adviseCommentForHumanChange({
  change,
  advising,
  label,
  required,
  emptyRequiredOtherCount
}) {
  if (!change || change.source !== "human") return null;
  // `advising` is workMode.model.canPropose: the model is here and does not
  // hold the click right, so its job is to explain and propose.
  if (advising !== true) return null;
  if (typeof label !== "string" || label.length === 0) return null;

  let comment;
  if (required) {
    comment =
      Number(emptyRequiredOtherCount) > 0
        ? `You updated "${label}", a required field. ${emptyRequiredOtherCount} other required field(s) still need a value.`
        : `You updated "${label}", a required field. All required fields now have a value.`;
  } else {
    comment = `You updated "${label}", an optional field.`;
  }

  return comment.length > COMMENT_LIMIT ? comment.slice(0, COMMENT_LIMIT) : comment;
}
