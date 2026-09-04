import assert from "node:assert/strict";
import test from "node:test";

import { createRecognitionSession } from "../src/speech-controller.js";

class FakeRecognition {
  static latest;

  constructor() {
    FakeRecognition.latest = this;
    this.startCalls = 0;
    this.stopCalls = 0;
    this.throwOnStart = false;
  }

  start() {
    this.startCalls += 1;
    if (this.throwOnStart) throw new DOMException("blocked", "InvalidStateError");
  }

  stop() {
    this.stopCalls += 1;
  }
}

test("rapid repeated activation starts one speech-recognition session", () => {
  const activeChanges = [];
  const session = createRecognitionSession({
    Recognition: FakeRecognition,
    onActiveChange: (active) => activeChanges.push(active)
  });

  assert.equal(session.start(), true);
  assert.equal(session.start(), false);
  assert.equal(FakeRecognition.latest.startCalls, 1);
  assert.deepEqual(activeChanges, [true]);

  FakeRecognition.latest.onend();
  assert.deepEqual(activeChanges, [true, false]);
  assert.equal(session.start(), true);
  assert.equal(FakeRecognition.latest.startCalls, 2);
});

test("stopping an idle speech-recognition session is a bounded no-op", () => {
  const session = createRecognitionSession({ Recognition: FakeRecognition });

  assert.equal(session.stop(), false);
  assert.equal(FakeRecognition.latest.stopCalls, 0);
  session.start();
  assert.equal(session.stop(), true);
  assert.equal(FakeRecognition.latest.stopCalls, 1);
});

test("a synchronous recognition start failure is reported and unlocks retry", () => {
  const errors = [];
  const activeChanges = [];
  const session = createRecognitionSession({
    Recognition: FakeRecognition,
    onError: (event) => errors.push(event.error),
    onActiveChange: (active) => activeChanges.push(active)
  });
  FakeRecognition.latest.throwOnStart = true;

  assert.equal(session.start(), false);
  assert.deepEqual(errors, ["start-failed"]);
  assert.deepEqual(activeChanges, [true, false]);

  FakeRecognition.latest.throwOnStart = false;
  assert.equal(session.start(), true);
  assert.equal(FakeRecognition.latest.startCalls, 2);
});
