const ALLOWED_METHODS = new Set([
  "readFocus",
  "requestContext",
  "offerAction",
  // Read-only: who is here and who holds the click right. An agent that can
  // see it stops proposing into a standby seat.
  "readPresence"
]);
const MAX_REQUEST_ID_CHARACTERS = 120;
const MAX_REQUEST_CHARACTERS = 12_000;
const MUTABLE_INPUT_TYPES = new Set([
  "date",
  "datetime-local",
  "email",
  "month",
  "number",
  "search",
  "tel",
  "text",
  "time",
  "url",
  "week"
]);

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function trimmed(value) {
  return typeof value === "string" ? value.trim() : "";
}

function inferredRole(element, tagName) {
  const explicit = trimmed(element.getAttribute?.("role"));
  if (explicit) return explicit;
  if (tagName === "textarea") return "textbox";
  if (tagName === "select") return "combobox";
  if (tagName === "button") return "button";
  if (tagName === "a") return "link";
  if (tagName !== "input") return tagName || "unknown";
  const type = trimmed(element.type).toLowerCase() || "text";
  if (type === "checkbox") return "checkbox";
  if (type === "radio") return "radio";
  if (type === "button" || type === "submit" || type === "reset") return "button";
  return "textbox";
}

function labelFor(element, role, tagName) {
  const candidates = [
    element.getAttribute?.("aria-label"),
    element.labels?.[0]?.textContent,
    element.getAttribute?.("title"),
    element.getAttribute?.("placeholder"),
    element.name,
    element.id,
    role,
    tagName
  ];
  return candidates.map(trimmed).find(Boolean) ?? "unknown target";
}

function isValueControl(element, tagName) {
  if (tagName === "textarea" || tagName === "select") return true;
  if (tagName !== "input") return false;
  const type = trimmed(element.type).toLowerCase() || "text";
  return MUTABLE_INPUT_TYPES.has(type);
}

function stableIdFor(element, documentLike, mutable) {
  if (!mutable) return undefined;
  const declared = trimmed(element.getAttribute?.("data-cowork-id"));
  if (declared) return `data:${declared}`;
  const id = trimmed(element.id);
  if (id && documentLike?.getElementById?.(id) === element) return `id:${id}`;
  const name = trimmed(element.name);
  if (
    name &&
    typeof documentLike?.getElementsByName === "function" &&
    documentLike.getElementsByName(name).length === 1 &&
    documentLike.getElementsByName(name)[0] === element
  ) {
    return `name:${name}`;
  }
  return undefined;
}

function selectedTextFor(element, mutable) {
  if (!mutable || typeof element.value !== "string") return undefined;
  if (!Number.isInteger(element.selectionStart) || !Number.isInteger(element.selectionEnd)) {
    return undefined;
  }
  if (element.selectionEnd <= element.selectionStart) return undefined;
  return element.value.slice(element.selectionStart, element.selectionEnd);
}

export function describeDomTarget(element, documentLike) {
  if (!element || typeof element !== "object") {
    throw new TypeError("A DOM-like target element is required");
  }
  const tagName = trimmed(element.tagName).toLowerCase() || "unknown";
  const role = inferredRole(element, tagName);
  const mutable = isValueControl(element, tagName);
  const stableId = stableIdFor(element, documentLike, mutable);
  const selectedText = selectedTextFor(element, mutable);
  return {
    ...(stableId ? { stableId } : {}),
    tagName,
    role,
    label: labelFor(element, role, tagName),
    ...(selectedText ? { selectedText } : {})
  };
}

function finitePositive(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a finite positive number`);
  }
  return value;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function computeVisualCrop({
  center,
  maximumWidth,
  maximumHeight,
  viewportWidth,
  viewportHeight,
  bitmapWidth,
  bitmapHeight
}) {
  const width = Math.min(
    finitePositive(maximumWidth, "maximumWidth"),
    finitePositive(viewportWidth, "viewportWidth")
  );
  const height = Math.min(
    finitePositive(maximumHeight, "maximumHeight"),
    finitePositive(viewportHeight, "viewportHeight")
  );
  if (!Number.isFinite(center?.x) || !Number.isFinite(center?.y)) {
    throw new TypeError("center must contain finite x and y coordinates");
  }
  const left = clamp(center.x - width / 2, 0, viewportWidth - width);
  const top = clamp(center.y - height / 2, 0, viewportHeight - height);
  const scaleX = finitePositive(bitmapWidth, "bitmapWidth") / viewportWidth;
  const scaleY = finitePositive(bitmapHeight, "bitmapHeight") / viewportHeight;
  return {
    css: {
      left: Math.round(left),
      top: Math.round(top),
      width: Math.round(width),
      height: Math.round(height)
    },
    source: {
      x: Math.round(left * scaleX),
      y: Math.round(top * scaleY),
      width: Math.round(width * scaleX),
      height: Math.round(height * scaleY)
    },
    output: {
      width: Math.round(width),
      height: Math.round(height)
    }
  };
}

export function normalizeCompanionRequest(message) {
  if (!plainObject(message)) return null;
  if (message.source !== "cowork-page-client" || message.protocolVersion !== "0.1") {
    return null;
  }
  if (
    typeof message.requestId !== "string" ||
    message.requestId.length === 0 ||
    message.requestId.length > MAX_REQUEST_ID_CHARACTERS ||
    !ALLOWED_METHODS.has(message.method)
  ) {
    return null;
  }
  const argumentsValue = message.arguments ?? {};
  if (!plainObject(argumentsValue)) return null;
  try {
    if (JSON.stringify(message).length > MAX_REQUEST_CHARACTERS) return null;
  } catch {
    return null;
  }
  return {
    requestId: message.requestId,
    method: message.method,
    arguments: argumentsValue
  };
}
