import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createChangeSnapshot,
  createFeedbackSnapshot,
  observeControlChange
} from "../src/interaction-log.js";

test("the interaction log emits only real value changes with explicit cause references", () => {
  assert.equal(
    observeControlChange({
      changeId: "change-1",
      fieldId: "full-name",
      label: "Full name",
      previousValue: "Lukas",
      nextValue: "Lukas",
      pageVersion: 2
    }),
    null
  );

  const event = observeControlChange({
    changeId: "change-2",
    fieldId: "full-name",
    label: "Full name",
    previousValue: "Lukas",
    nextValue: "Luka",
    pageVersion: 3,
    cause: {
      source: "agent",
      refs: ["offer:offer-2", "authorization:human-click"],
      confidence: "high"
    }
  });

  assert.equal(event.type, "change");
  assert.equal(event.source, "agent");
  assert.equal(event.shortSummary, "Full name changed");
  assert.notEqual(event.beforeDigest, event.afterDigest);
  assert.deepEqual(event.causeRefs, [
    "offer:offer-2",
    "authorization:human-click"
  ]);
});

test("the feedback snapshot returns only the latest event and an omission count", () => {
  assert.deepEqual(createFeedbackSnapshot([]), {
    protocolVersion: "0.1",
    type: "feedback-snapshot",
    latest: null,
    totalCount: 0,
    omittedCount: 0
  });

  const events = [
    { relatedOfferId: "offer-1", verdict: "accepted" },
    { relatedOfferId: "offer-2", verdict: "revise", adjustment: "Lighter" }
  ];
  assert.deepEqual(createFeedbackSnapshot(events), {
    protocolVersion: "0.1",
    type: "feedback-snapshot",
    latest: events[1],
    totalCount: 2,
    omittedCount: 1
  });
});

test("the change snapshot returns only the latest causal event", () => {
  assert.deepEqual(createChangeSnapshot([]), {
    protocolVersion: "0.1",
    type: "change-snapshot",
    latest: null,
    totalCount: 0,
    omittedCount: 0
  });

  const events = [
    { changeId: "change-1", shortSummary: "Name changed" },
    { changeId: "change-2", shortSummary: "Email changed" }
  ];
  assert.deepEqual(createChangeSnapshot(events), {
    protocolVersion: "0.1",
    type: "change-snapshot",
    latest: events[1],
    totalCount: 2,
    omittedCount: 1
  });
});
