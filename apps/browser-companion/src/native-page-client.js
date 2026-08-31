import { CoworkProtocolError } from "../../../packages/core/src/index.js";

const REQUEST_SOURCE = "cowork-extension-native-request";
const RESPONSE_SOURCE = "cowork-extension-native-response";

export function createNativePageClient({
  window,
  createRequestId = () => crypto.randomUUID(),
  timeoutMs = 3000
}) {
  if (!window || typeof window.postMessage !== "function") {
    throw new TypeError("Native page client requires a window transport");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 10_000) {
    throw new TypeError("Native page client timeout must be between 100 and 10,000 ms");
  }

  function request(method, argumentsValue = {}) {
    const requestId = createRequestId();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        window.removeEventListener("message", onMessage);
        reject(new CoworkProtocolError(
          "NATIVE_WEBMCP_UNAVAILABLE",
          "The page did not expose a native Cowork/WebMCP bridge"
        ));
      }, timeoutMs);
      function onMessage(event) {
        if (
          event.source !== window ||
          event.data?.source !== RESPONSE_SOURCE ||
          event.data?.protocolVersion !== "0.1" ||
          event.data?.requestId !== requestId
        ) {
          return;
        }
        clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        if (event.data.ok) resolve(event.data.result);
        else reject(new CoworkProtocolError(
          event.data.error?.code ?? "NATIVE_WEBMCP_REQUEST_FAILED",
          "The native Cowork/WebMCP bridge rejected the request"
        ));
      }
      window.addEventListener("message", onMessage);
      window.postMessage({
        source: REQUEST_SOURCE,
        protocolVersion: "0.1",
        requestId,
        method,
        arguments: argumentsValue
      }, "*");
    });
  }

  return Object.freeze({
    discover: () => request("discover"),
    executeTool: (toolName, input = {}) =>
      request("execute-tool", { toolName, input })
  });
}
