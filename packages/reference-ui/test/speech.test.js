import assert from "node:assert/strict";
import test from "node:test";

import {
  createHoldToTalk,
  createSpeaker,
  readFinalTranscript,
  selectSpeechVoice
} from "../src/index.js";

const voice = (name, lang = "en-US") => ({ name, lang });

const WINDOWS_VOICES = [
  voice("Microsoft David - English (United States)"),
  voice("Microsoft Zira - English (United States)"),
  voice("Microsoft Ava Online (Natural) - English (United States)"),
  voice("Microsoft Andrew Online (Natural) - English (United States)"),
  voice("Microsoft Emma Online (Natural) - English (United States)"),
  voice("Microsoft Katja Online (Natural) - German (Germany)", "de-DE")
];

test("the preferred voice is Andrew, the voice used in the project videos", () => {
  assert.equal(
    selectSpeechVoice(WINDOWS_VOICES).name,
    "Microsoft Andrew Online (Natural) - English (United States)"
  );
});

test("without Andrew the next male Natural voice wins, never a female one", () => {
  const withoutAndrew = WINDOWS_VOICES.filter((entry) => !entry.name.includes("Andrew"));
  assert.equal(
    selectSpeechVoice([...withoutAndrew, voice("Microsoft Guy Online (Natural) - English (United States)")])
      .name,
    "Microsoft Guy Online (Natural) - English (United States)"
  );
  assert.equal(
    selectSpeechVoice([
      ...withoutAndrew,
      voice("Microsoft Christopher Online (Natural) - English (United States)")
    ]).name,
    "Microsoft Christopher Online (Natural) - English (United States)"
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

test("a plain en-US voice beats the unchecked browser default", () => {
  assert.equal(
    selectSpeechVoice([voice("Microsoft Zira - English (United States)")]).name,
    "Microsoft Zira - English (United States)"
  );
  assert.equal(selectSpeechVoice([voice("Microsoft Katja", "de-DE")]), null);
  assert.equal(selectSpeechVoice([]), null);
  assert.equal(selectSpeechVoice(undefined), null);
});

class FakeSynthesis {
  constructor(voices = WINDOWS_VOICES) {
    this.voices = voices;
    this.spoken = [];
    this.cancels = 0;
    this.listeners = [];
  }

  getVoices() {
    return this.voices;
  }

  cancel() {
    this.cancels += 1;
  }

  speak(utterance) {
    this.spoken.push(utterance);
  }

  addEventListener(name, listener) {
    if (name === "voiceschanged") this.listeners.push(listener);
  }

  loadVoices(voices) {
    this.voices = voices;
    for (const listener of this.listeners) listener();
  }
}

class FakeUtterance {
  constructor(text) {
    this.text = text;
    this.voice = null;
  }
}

// A hand-run clock: the speaker coalesces, so nothing is spoken until time moves.
function fakeClock() {
  let due = null;
  return {
    setTimer(callback, delay) {
      due = { callback, delay };
      return 1;
    },
    clearTimer() {
      due = null;
    },
    run() {
      const pending = due;
      due = null;
      pending?.callback();
      return pending?.delay ?? null;
    },
    get delay() {
      return due?.delay ?? null;
    }
  };
}

function speakerFor(synthesis, options = {}) {
  const clock = fakeClock();
  const speaker = createSpeaker({
    synthesis,
    Utterance: FakeUtterance,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    ...options
  });
  return { speaker, clock };
}

test("an announcement is spoken once, however often it is repeated", () => {
  const synthesis = new FakeSynthesis();
  const { speaker, clock } = speakerFor(synthesis);

  assert.equal(speaker.speak("Done and verified.", { once: "receipt:1" }), true);
  clock.run();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    assert.equal(speaker.speak("Done and verified.", { once: "receipt:1" }), false);
    clock.run();
  }
  assert.equal(synthesis.spoken.length, 1);
  assert.equal(synthesis.spoken[0].text, "Done and verified.");
});

test("announcements in one burst become one sentence, not cut-off fragments", () => {
  const synthesis = new FakeSynthesis();
  const { speaker, clock } = speakerFor(synthesis);

  speaker.speak("First field verified.", { once: "receipt:1" });
  speaker.speak("Second field verified.", { once: "receipt:2" });
  speaker.speak("Third field verified.", { once: "receipt:3" });
  clock.run();

  assert.equal(synthesis.spoken.length, 1);
  assert.equal(
    synthesis.spoken[0].text,
    "First field verified. Second field verified. Third field verified."
  );
  assert.equal(synthesis.cancels, 1);
});

test("the first sentence waits for the voice list instead of taking the browser default", () => {
  const synthesis = new FakeSynthesis([]);
  const { speaker, clock } = speakerFor(synthesis, { coalesceMs: 120, voiceWaitMs: 1200 });

  speaker.speak("Welcome back.");
  assert.equal(clock.delay, 1200, "an empty voice list makes the speaker wait");
  assert.equal(synthesis.spoken.length, 0);

  synthesis.loadVoices(WINDOWS_VOICES);
  assert.equal(clock.delay, 120, "the arriving voice list shortens the wait");
  clock.run();

  assert.equal(synthesis.spoken.length, 1);
  assert.equal(
    synthesis.spoken[0].voice.name,
    "Microsoft Andrew Online (Natural) - English (United States)"
  );
});

test("a browser that never loads a voice list still speaks", () => {
  const synthesis = new FakeSynthesis([]);
  const { speaker, clock } = speakerFor(synthesis);

  speaker.speak("Welcome back.");
  clock.run();

  assert.equal(synthesis.spoken.length, 1);
  assert.equal(synthesis.spoken[0].voice, null);
});

test("a surface that is not the speaking one stays silent", () => {
  const synthesis = new FakeSynthesis();
  let enabled = false;
  const { speaker, clock } = speakerFor(synthesis, { isEnabled: () => enabled });

  assert.equal(speaker.speak("Done and verified.", { once: "receipt:1" }), false);
  clock.run();
  assert.equal(synthesis.spoken.length, 0);

  enabled = true;
  assert.equal(speaker.speak("Done and verified.", { once: "receipt:1" }), true);
  clock.run();
  assert.equal(synthesis.spoken.length, 1);
});

test("handing the session over cuts the sentence the surface had started", () => {
  const synthesis = new FakeSynthesis();
  const { speaker, clock } = speakerFor(synthesis);

  speaker.speak("Done and verified.", { once: "receipt:1" });
  speaker.silence();
  clock.run();

  assert.equal(synthesis.spoken.length, 0);
  assert.equal(synthesis.cancels, 1);
});

test("a preferred male voice wins even when it is not a Natural one", () => {
  // Measured on the machine that reported the two voices: its only installed
  // en-US voice is the female "Microsoft Zira Desktop", and the male voices
  // reach Edge as Online (Natural) ones. A locally installed David must not
  // lose to Zira just because Windows does not call him Natural.
  const installed = [
    voice("Microsoft Zira Desktop - English (United States)"),
    voice("Microsoft David Desktop - English (United States)"),
    voice("Microsoft Hedda Desktop", "de-DE")
  ];
  assert.equal(
    selectSpeechVoice(installed).name,
    "Microsoft David Desktop - English (United States)"
  );
});

// --- Push to talk ----------------------------------------------------------

const keyEvent = (key, target = { tagName: "BODY" }) => ({
  key,
  target,
  preventDefault() {
    this.defaultPrevented = true;
  }
});

function recorder() {
  const calls = [];
  const control = createHoldToTalk({
    start: () => calls.push("start"),
    stop: () => calls.push("stop")
  });
  return { calls, control };
}

test("holding the space bar starts listening once and releasing it stops", () => {
  const { calls, control } = recorder();
  assert.equal(control.keydown(keyEvent(" ")), true);
  assert.equal(control.isHeld(), true);
  assert.equal(control.keydown(keyEvent(" ")), false, "a held key repeats, it does not press again");
  assert.equal(control.keyup(keyEvent(" ")), true);
  assert.equal(control.isHeld(), false);
  assert.deepEqual(calls, ["start", "stop"]);
});

test("a release nobody pressed, another key and a shortcut all do nothing", () => {
  const { calls, control } = recorder();
  assert.equal(control.keyup(keyEvent(" ")), false);
  assert.equal(control.keydown(keyEvent("a")), false);
  assert.equal(control.keydown({ ...keyEvent(" "), ctrlKey: true }), false);
  assert.deepEqual(calls, []);
});

test("in a text field the space bar stays a space", () => {
  const { calls, control } = recorder();
  for (const tagName of ["INPUT", "TEXTAREA", "BUTTON"]) {
    assert.equal(control.keydown(keyEvent(" ", { tagName })), false);
  }
  assert.equal(control.keydown(keyEvent(" ", { tagName: "DIV", isContentEditable: true })), false);
  assert.deepEqual(calls, []);
});

test("a window that loses focus mid-hold stops listening instead of staying open", () => {
  const { calls, control } = recorder();
  control.keydown(keyEvent(" "));
  assert.equal(control.cancel(), true);
  assert.equal(control.cancel(), false, "nothing left to cancel");
  assert.deepEqual(calls, ["start", "stop"]);
});

test("listening continuously reads only the new final phrases, never an interim one", () => {
  const results = [
    { 0: { transcript: "make the label clearer" }, isFinal: true },
    { 0: { transcript: " and add a hint" }, isFinal: true },
    { 0: { transcript: " maybe" }, isFinal: false }
  ];
  assert.equal(
    readFinalTranscript({ results, resultIndex: 0 }),
    "make the label clearer and add a hint"
  );
  assert.equal(readFinalTranscript({ results, resultIndex: 1 }), "and add a hint");
  assert.equal(readFinalTranscript({ results, resultIndex: 2 }), "", "silence creates no text");
});

test("a one-shot result without isFinal still reads, so a single press keeps working", () => {
  assert.equal(readFinalTranscript({ results: [{ 0: { transcript: " hello " } }] }), "hello");
  assert.equal(readFinalTranscript({}), "");
});
