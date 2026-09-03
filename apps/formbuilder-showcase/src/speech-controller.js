function noop() {}

// Spoken replies use the same voice as the project's videos when Windows offers it:
// Microsoft Andrew Online (Natural). Ava/Emma/Aria are the female Natural fallbacks,
// then any en-US Natural/Neural voice, then whatever the browser picks by itself.
const PREFERRED_VOICE_NAMES = ["Andrew", "Ava", "Emma", "Aria"];

export function selectSpeechVoice(voices) {
  const english = (Array.isArray(voices) ? voices : []).filter(
    (voice) => typeof voice?.name === "string" && /^en-us/i.test(voice.lang ?? "")
  );
  const natural = english.filter((voice) => /natural|neural/i.test(voice.name));
  for (const preferred of PREFERRED_VOICE_NAMES) {
    const match = natural.find((voice) => voice.name.includes(preferred));
    if (match) return match;
  }
  return natural[0] ?? null;
}

export function createRecognitionSession({
  Recognition,
  lang = "en-US",
  interimResults = false,
  continuous = false,
  onStart = noop,
  onResult = noop,
  onError = noop,
  onEnd = noop,
  onActiveChange = noop
}) {
  if (typeof Recognition !== "function") {
    throw new TypeError("A SpeechRecognition constructor is required");
  }

  const recognition = new Recognition();
  recognition.lang = lang;
  recognition.interimResults = interimResults;
  recognition.continuous = continuous;
  let active = false;

  recognition.onstart = (event) => onStart(event);
  recognition.onresult = (event) => onResult(event);
  recognition.onerror = (event) => onError(event);
  recognition.onend = (event) => {
    if (active) {
      active = false;
      onActiveChange(false);
    }
    onEnd(event);
  };

  return {
    start() {
      if (active) return false;
      active = true;
      onActiveChange(true);
      try {
        recognition.start();
        return true;
      } catch (cause) {
        active = false;
        onActiveChange(false);
        onError({ error: "start-failed", cause });
        return false;
      }
    },
    stop() {
      if (!active) return false;
      try {
        recognition.stop();
        return true;
      } catch (cause) {
        active = false;
        onActiveChange(false);
        onError({ error: "stop-failed", cause });
        return false;
      }
    },
    isActive() {
      return active;
    }
  };
}
