export class ModelTransportError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ModelTransportError";
    this.code = code;
  }
}

export function selectModelTransport({ injected = null, discovered = null } = {}) {
  if (typeof injected?.sendTurn === "function") return injected;
  if (typeof discovered?.sendTurn === "function") return discovered;
  return null;
}

function boundedTimeout(value) {
  return Number.isInteger(value) && value >= 100 && value <= 120000 ? value : 30000;
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), boundedTimeout(timeoutMs));
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function discoverHttpModelTransport({
  fetchImpl = globalThis.fetch,
  statusUrl = "/__cowork/model/status",
  turnUrl = "/__cowork/model/turn",
  timeoutMs = 30000
} = {}) {
  if (typeof fetchImpl !== "function") return null;
  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      statusUrl,
      { headers: { Accept: "application/json" }, cache: "no-store" },
      timeoutMs
    );
    if (!response.ok) return null;
    const status = await response.json();
    if (
      status?.protocolVersion !== "0.1" ||
      status.available !== true ||
      status.transport !== "same-origin-model-host"
    ) {
      return null;
    }
  } catch {
    return null;
  }

  return {
    label: "Connected model bridge",
    async sendTurn(turn) {
      let response;
      try {
        response = await fetchWithTimeout(
          fetchImpl,
          turnUrl,
          {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json"
            },
            cache: "no-store",
            body: JSON.stringify({ protocolVersion: "0.1", turn })
          },
          timeoutMs
        );
      } catch {
        throw new ModelTransportError(
          "MODEL_HOST_FAILED",
          "The connected model host did not respond"
        );
      }
      if (!response.ok) {
        throw new ModelTransportError(
          "MODEL_HOST_FAILED",
          "The connected model host rejected the bounded turn"
        );
      }
      try {
        const payload = await response.json();
        if (
          payload?.protocolVersion !== "0.1" ||
          !payload.reply ||
          typeof payload.reply !== "object" ||
          Array.isArray(payload.reply)
        ) {
          throw new Error("Invalid reply envelope");
        }
        return payload.reply;
      } catch {
        throw new ModelTransportError(
          "MODEL_HOST_FAILED",
          "The connected model host returned an invalid reply"
        );
      }
    }
  };
}
