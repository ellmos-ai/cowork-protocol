// The showcase's single source of truth for "which model, if any, answers
// here". One Demo switch instead of demo behaviour scattered over buttons:
// Demo on  -> the disclosed scripted helper answers everything.
// Demo off -> an injected transport, a direct browser connection to an
//             OpenAI-compatible endpoint, or a same-origin model host answers;
//             with none of them connected the seat says so and proposes
//             nothing. It never falls back to the script silently.
import { createOpenAiCompatibleTurnSender } from "../../../packages/model-transport/src/openai-compatible.js";

export const DIRECT_MODEL_STORAGE_KEY = "cowork.showcase.directModel";
export const DIRECT_MODEL_KEY_STORAGE_KEY = "cowork.showcase.directModelKey";
export const DEMO_MODE_STORAGE_KEY = "cowork.showcase.demoMode";
export const DEFAULT_DIRECT_ENDPOINT = "http://127.0.0.1:11434/v1/chat/completions";

export const NO_MODEL_MESSAGE =
  "No model is connected on this page. This turn was only published for a WebMCP agent (cowork_read_turn / cowork_reply_turn). Connect your model in the Model seat or switch Demo mode on.";

export class ModelSeatError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ModelSeatError";
    this.code = code;
  }
}

function hasSendTurn(transport) {
  return typeof transport?.sendTurn === "function";
}

function readJson(storage, key) {
  try {
    const raw = storage?.getItem?.(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(storage, key, value) {
  try {
    if (value === null) storage?.removeItem?.(key);
    else storage?.setItem?.(key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable (private mode, quota); the seat still works for this page load.
  }
}

export function validateDirectModelConfig({ endpoint, model, pageProtocol = "http:" }) {
  const endpointText = typeof endpoint === "string" ? endpoint.trim() : "";
  let url;
  try {
    url = new URL(endpointText);
  } catch {
    throw new ModelSeatError(
      "INVALID_ENDPOINT",
      `Endpoint must be a full http(s) URL such as ${DEFAULT_DIRECT_ENDPOINT}`
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ModelSeatError("INVALID_ENDPOINT", "Endpoint must use http:// or https://");
  }
  if (pageProtocol === "https:" && url.protocol === "http:") {
    throw new ModelSeatError(
      "MIXED_CONTENT",
      "This page is served over HTTPS, so the browser blocks an http:// endpoint. Run the app locally (npm start, http://127.0.0.1:4173) or use an https:// endpoint."
    );
  }
  const modelText = typeof model === "string" ? model.trim() : "";
  if (modelText === "" || modelText.length > 200) {
    throw new ModelSeatError("INVALID_MODEL", "Model ID is required, for example qwen3:4b.");
  }
  return { endpoint: url.toString(), model: modelText };
}

export function createModelSeat({
  injected = null,
  discovered = null,
  demoReply,
  storage = {},
  pageProtocol = "http:",
  createSender = createOpenAiCompatibleTurnSender,
  senderTimeoutMs = 120000
} = {}) {
  if (typeof demoReply !== "function") throw new TypeError("demoReply must be a function");
  const local = storage.local ?? null;
  const session = storage.session ?? null;
  let direct = null;

  function buildDirect({ endpoint, model, apiKey }) {
    const sendTurn = createSender({ endpoint, model, apiKey, timeoutMs: senderTimeoutMs });
    return { endpoint, model, apiKey, sendTurn };
  }

  const saved = readJson(local, DIRECT_MODEL_STORAGE_KEY);
  if (saved?.endpoint && saved?.model) {
    try {
      const config = validateDirectModelConfig({ ...saved, pageProtocol });
      let apiKey = "";
      try {
        apiKey = session?.getItem?.(DIRECT_MODEL_KEY_STORAGE_KEY) ?? "";
      } catch {
        apiKey = "";
      }
      direct = buildDirect({ ...config, apiKey });
    } catch {
      direct = null;
    }
  }

  const savedDemo = readJson(local, DEMO_MODE_STORAGE_KEY);
  let demoMode =
    typeof savedDemo === "boolean"
      ? savedDemo
      : !(direct !== null || hasSendTurn(injected) || hasSendTurn(discovered));

  function resolve() {
    if (demoMode) {
      return Object.freeze({
        kind: "demo",
        label: "Demo helper (scripted)",
        transportLabel: "Local demo helper",
        tone: "demo",
        speaker: "Helper",
        publishesToInbox: true,
        sendTurn: (turn) => demoReply(turn)
      });
    }
    if (hasSendTurn(injected)) {
      return Object.freeze({
        kind: "injected",
        label: injected.label ?? "Injected model transport",
        transportLabel: injected.label ?? "Connected model bridge",
        tone: "live",
        speaker: "Model",
        publishesToInbox: false,
        sendTurn: (turn) => injected.sendTurn(turn)
      });
    }
    if (direct !== null) {
      return Object.freeze({
        kind: "direct",
        label: `Direct model · ${direct.model}`,
        transportLabel: "Direct model",
        tone: "live",
        speaker: "Model",
        publishesToInbox: false,
        endpoint: direct.endpoint,
        model: direct.model,
        sendTurn: (turn) => direct.sendTurn(turn)
      });
    }
    if (hasSendTurn(discovered)) {
      return Object.freeze({
        kind: "host",
        label: "Page model host",
        transportLabel: discovered.label ?? "Connected model bridge",
        tone: "live",
        speaker: "Model",
        publishesToInbox: false,
        sendTurn: (turn) => discovered.sendTurn(turn)
      });
    }
    return Object.freeze({
      kind: "none",
      label: "No model connected",
      transportLabel: "No model connected",
      tone: "off",
      speaker: "System",
      publishesToInbox: true,
      sendTurn: async () => ({ message: NO_MODEL_MESSAGE, offers: [] })
    });
  }

  return Object.freeze({
    resolve,
    isDemo: () => demoMode,
    setDemo(enabled) {
      demoMode = enabled === true;
      writeJson(local, DEMO_MODE_STORAGE_KEY, demoMode);
      return resolve();
    },
    directConfig: () =>
      direct === null
        ? null
        : { endpoint: direct.endpoint, model: direct.model, hasApiKey: direct.apiKey !== "" },
    connectDirect({ endpoint, model, apiKey = "" }) {
      const config = validateDirectModelConfig({ endpoint, model, pageProtocol });
      const key = typeof apiKey === "string" ? apiKey.trim() : "";
      direct = buildDirect({ ...config, apiKey: key });
      writeJson(local, DIRECT_MODEL_STORAGE_KEY, { endpoint: config.endpoint, model: config.model });
      try {
        if (key === "") session?.removeItem?.(DIRECT_MODEL_KEY_STORAGE_KEY);
        else session?.setItem?.(DIRECT_MODEL_KEY_STORAGE_KEY, key);
      } catch {
        // The key then lives only in memory for this page load.
      }
      demoMode = false;
      writeJson(local, DEMO_MODE_STORAGE_KEY, false);
      return resolve();
    },
    disconnectDirect() {
      direct = null;
      writeJson(local, DIRECT_MODEL_STORAGE_KEY, null);
      try {
        session?.removeItem?.(DIRECT_MODEL_KEY_STORAGE_KEY);
      } catch {
        // nothing to clean up
      }
      return resolve();
    },
    // The active seat answers; the "none" seat answers with a plain system
    // message and never proposes anything.
    sendTurn: (turn) => resolve().sendTurn(turn),
    // For an explicit connection test: only a real transport may answer.
    async probe(turn) {
      const seat = resolve();
      if (seat.kind === "demo" || seat.kind === "none") {
        throw new ModelSeatError(
          "NO_MODEL_CONNECTED",
          "There is no connected model to test. Connect one first."
        );
      }
      return seat.sendTurn(turn);
    }
  });
}
