function noop() {}

// The spoken voice lives in packages/reference-ui, so the page, the detached
// panel and the Companion window all answer in the same one.

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
