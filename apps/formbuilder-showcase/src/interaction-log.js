import {
  createChangeEvent,
  digestArguments
} from "../../../packages/core/src/index.js";

export function observeControlChange({
  changeId,
  fieldId,
  label,
  previousValue,
  nextValue,
  pageVersion,
  cause = {
    source: "human",
    refs: ["ui:input"],
    confidence: "high"
  }
}) {
  if (previousValue === nextValue) return null;

  return createChangeEvent({
    changeId,
    source: cause.source,
    targetIds: [`form-field:${fieldId}`],
    pageVersion,
    beforeDigest: digestArguments(previousValue),
    afterDigest: digestArguments(nextValue),
    shortSummary: `${label} changed`,
    causeRefs: cause.refs,
    causalityConfidence: cause.confidence,
    reversible: true,
    undoCapabilityId: "form.set_value"
  });
}

export function createFeedbackSnapshot(feedbackEvents) {
  const latest = feedbackEvents.at(-1) ?? null;
  return {
    protocolVersion: "0.1",
    type: "feedback-snapshot",
    latest,
    totalCount: feedbackEvents.length,
    omittedCount: Math.max(0, feedbackEvents.length - (latest ? 1 : 0))
  };
}

export function createChangeSnapshot(changeEvents) {
  const latest = changeEvents.at(-1) ?? null;
  return {
    protocolVersion: "0.1",
    type: "change-snapshot",
    latest,
    totalCount: changeEvents.length,
    omittedCount: Math.max(0, changeEvents.length - (latest ? 1 : 0))
  };
}
