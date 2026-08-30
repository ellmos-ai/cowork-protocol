import { CoworkProtocolError } from "../../core/src/index.js";

export const MAX_BOUNDED_RESULT_CHARS = 1200;

export function truncateBridgeText(text, limit) {
  if (text.length <= limit) return text;
  if (limit === 0) return "";
  let prefix = text.slice(0, limit - 1);
  const lastCodeUnit = prefix.charCodeAt(prefix.length - 1);
  if (lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff) {
    prefix = prefix.slice(0, -1);
  }
  return `${prefix}…`;
}

export function boundHostResult(capabilityId, result, previewType) {
  let serialized;
  try {
    serialized = JSON.stringify(result);
  } catch {
    throw new CoworkProtocolError(
      "INVALID_BRIDGE_RESULT",
      "Host results must be JSON-serializable"
    );
  }
  if (typeof serialized !== "string") {
    throw new CoworkProtocolError(
      "INVALID_BRIDGE_RESULT",
      "Host results must contain a JSON value"
    );
  }
  if (serialized.length <= MAX_BOUNDED_RESULT_CHARS) return JSON.parse(serialized);

  const preview = truncateBridgeText(serialized, MAX_BOUNDED_RESULT_CHARS);
  return {
    protocolVersion: "0.1",
    type: previewType,
    capabilityId,
    preview,
    metrics: {
      sourceCharacters: serialized.length,
      includedCharacters: preview.length,
      truncated: true
    }
  };
}
