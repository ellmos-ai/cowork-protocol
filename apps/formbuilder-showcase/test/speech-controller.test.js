import assert from "node:assert/strict";
import test from "node:test";

import { createRecognitionSession, selectSpeechVoice } from "../src/speech-controller.js";

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

const voice = (name, lang = "en-US") => ({ name, lang });

const WINDOWS_VOICES = [
  voice("Microsoft David - English (United States)"),
  voice("Microsoft Zira - English (United States)"),
  voice("Microsoft Ava Online (Natural) - English (United States)"),
  voice("Microsoft Andrew Online (Natural) - English (United States)"),
  voice("Microsoft Ryan Online (Natural) - English (United Kingdom)", "en-GB")
];

test("the preferred voice is Andrew, the voice used in the project videos", () => {
  assert.equal(
    selectSpeechVoice(WINDOWS_VOICES).name,
    "Microsoft Andrew Online (Natural) - English (United States)"
  );
});

test("without Andrew a female Natural voice is used, Ava before Emma before Aria", () => {
  const withoutAndrew = WINDOWS_VOICES.filter((entry) => !entry.name.includes("Andrew"));
  assert.equal(
    selectSpeechVoice(withoutAndrew).name,
    "Microsoft Ava Online (Natural) - English (United States)"
  );
  const emmaAndAria = [
    voice("Microsoft Aria Online (Natural) - English (United States)"),
    voice("Microsoft Emma Online (Natural) - English (United States)")
  ];
  assert.equal(
    selectSpeechVoice(emmaAndAria).name,
    "Microsoft Emma Online (Natural) - English (United States)"
  );
});

test("any en-US Natural or Neural voice beats a plain one, and other locales never win", () => {
  const fallback = [
    voice("Microsoft Zira - English (United States)"),
    voice("Google US English Neural"),
    voice("Microsoft Andrew Online (Natural) - German (Germany)", "de-DE")
  ];
  assert.equal(selectSpeechVoice(fallback).name, "Google US English Neural");
});

test("an empty or not-yet-populated voice list falls back to the browser default", () => {
  assert.equal(selectSpeechVoice([]), null);
  assert.equal(selectSpeechVoice(undefined), null);
  assert.equal(selectSpeechVoice([voice("Microsoft Zira - English (United States)")]), null);
});
