import {
  buildFocusPacket,
  CoworkProtocolError,
  digestArguments,
  routeContextSignal
} from "../../core/src/index.js";

const NEARBY_TEXT_LIMIT = 350;
const ACCESSIBILITY_REGION_LIMIT = 1200;
const VISUAL_LENS_EDGE = 400;

function capped(text, limit) {
  if (typeof text !== "string") return "";
  if (text.length <= limit) return text;
  let prefix = text.slice(0, limit - 1);
  const lastCodeUnit = prefix.charCodeAt(prefix.length - 1);
  if (lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff) {
    prefix = prefix.slice(0, -1);
  }
  return `${prefix}…`;
}

function legacyTargetId(target) {
  if (typeof target.stableId === "string" && target.stableId.length > 0) {
    return `legacy-dom:${target.stableId}`;
  }
  const digest = digestArguments({
    tagName: target.tagName ?? "unknown",
    role: target.role ?? "",
    label: target.label ?? ""
  });
  return `legacy-ephemeral:${digest.slice(0, 16)}`;
}

export function buildLegacyDomFocus({ sessionId, pageVersion, lens, target }) {
  if (!target || typeof target !== "object") {
    throw new CoworkProtocolError(
      "LEGACY_TARGET_REQUIRED",
      "A semantic DOM target snapshot is required"
    );
  }
  const stable = typeof target.stableId === "string" && target.stableId.length > 0;
  return buildFocusPacket({
    sessionId,
    source: `legacy-${lens ?? "pointer"}`,
    capabilityLevel: "legacy-dom",
    targetId: legacyTargetId(target),
    pageVersion,
    focusKind: lens ?? "pointer",
    label: typeof target.label === "string" ? target.label : "",
    selectedText:
      typeof target.selectedText === "string" ? target.selectedText : "",
    capabilityIds: stable
      ? ["legacy.explain_target", "legacy.offer_value"]
      : ["legacy.explain_target"]
  });
}

export function requestLegacyContext({
  currentLevel,
  requestedLevel,
  nearbySemanticText,
  accessibilityRegionText,
  pointer
}) {
  const routed = routeContextSignal({
    signal: "focus",
    changed: true,
    currentLevel,
    requestedLevel,
    reason: "Legacy host requested one additional context tier"
  });
  const result = {
    level: routed.level,
    oneShot: routed.oneShot
  };

  if (requestedLevel === 1) {
    result.nearbySemanticText = capped(nearbySemanticText, NEARBY_TEXT_LIMIT);
  } else if (requestedLevel === 2) {
    result.accessibilityRegionText = capped(
      accessibilityRegionText,
      ACCESSIBILITY_REGION_LIMIT
    );
  } else if (requestedLevel === 3) {
    if (!Number.isFinite(pointer?.x) || !Number.isFinite(pointer?.y)) {
      throw new CoworkProtocolError(
        "VISUAL_FOCUS_REQUIRED",
        "A pointer center is required before requesting visual context"
      );
    }
    result.visualRequest = {
      kind: "pointer-region",
      center: { x: pointer.x, y: pointer.y },
      maximumWidth: VISUAL_LENS_EDGE,
      maximumHeight: VISUAL_LENS_EDGE,
      maximumPixelArea: VISUAL_LENS_EDGE * VISUAL_LENS_EDGE
    };
  }

  return result;
}
