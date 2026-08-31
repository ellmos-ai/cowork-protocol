const AA_MINIMUM_CONTRAST = 4.5;

export const EXPECTED_PIXEL_CONTRAST_STATES = Object.freeze([
  "native-ready",
  "keyboard-focus",
  "focused-field",
  "validation-errors",
  "visible-offer",
  "receipt-controls",
  "feedback-recorded",
  "agent-solo",
  "human-solo",
  "listening",
  "builder-offer-visible"
]);

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function parseChannel(token) {
  const value = token.trim();
  const parsed = value.endsWith("%")
    ? (Number.parseFloat(value) / 100) * 255
    : Number.parseFloat(value);
  requireCondition(Number.isFinite(parsed), `Unsupported CSS color channel: ${token}`);
  return Math.min(255, Math.max(0, parsed));
}

function parseAlpha(token = "1") {
  const value = token.trim();
  const parsed = value.endsWith("%")
    ? Number.parseFloat(value) / 100
    : Number.parseFloat(value);
  requireCondition(Number.isFinite(parsed), `Unsupported CSS alpha channel: ${token}`);
  return Math.min(1, Math.max(0, parsed));
}

export function parseCssColor(value) {
  requireCondition(typeof value === "string", "A CSS color string is required");
  const normalized = value.trim().toLowerCase();
  if (normalized === "transparent") {
    return { red: 0, green: 0, blue: 0, alpha: 0 };
  }

  const hex = normalized.match(/^#([0-9a-f]{3,8})$/i)?.[1];
  if (hex) {
    requireCondition(
      [3, 4, 6, 8].includes(hex.length),
      `Unsupported CSS hex color: ${value}`
    );
    const expanded = hex.length <= 4
      ? [...hex].map((character) => `${character}${character}`).join("")
      : hex;
    return {
      red: Number.parseInt(expanded.slice(0, 2), 16),
      green: Number.parseInt(expanded.slice(2, 4), 16),
      blue: Number.parseInt(expanded.slice(4, 6), 16),
      alpha: expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1
    };
  }

  const functional = normalized.match(/^rgba?\((.*)\)$/);
  requireCondition(functional, `Unsupported CSS color: ${value}`);
  const body = functional[1].trim();
  let channels;
  let alpha = "1";
  if (body.includes(",")) {
    const parts = body.split(",").map((part) => part.trim());
    requireCondition(parts.length === 3 || parts.length === 4, `Unsupported CSS color: ${value}`);
    channels = parts.slice(0, 3);
    alpha = parts[3] ?? "1";
  } else {
    const [channelPart, alphaPart] = body.split("/").map((part) => part.trim());
    channels = channelPart.split(/\s+/);
    alpha = alphaPart ?? "1";
  }
  requireCondition(channels.length === 3, `Unsupported CSS color: ${value}`);
  return {
    red: parseChannel(channels[0]),
    green: parseChannel(channels[1]),
    blue: parseChannel(channels[2]),
    alpha: parseAlpha(alpha)
  };
}

function composite(foreground, background) {
  requireCondition(background.alpha === 1, "Chrome must resolve text backgrounds to opaque colors");
  return {
    red: foreground.red * foreground.alpha + background.red * (1 - foreground.alpha),
    green: foreground.green * foreground.alpha + background.green * (1 - foreground.alpha),
    blue: foreground.blue * foreground.alpha + background.blue * (1 - foreground.alpha),
    alpha: 1
  };
}

function linearChannel(channel) {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(color) {
  return (
    0.2126 * linearChannel(color.red) +
    0.7152 * linearChannel(color.green) +
    0.0722 * linearChannel(color.blue)
  );
}

export function contrastRatio(foregroundValue, backgroundValue) {
  const background = parseCssColor(backgroundValue);
  const foreground = composite(parseCssColor(foregroundValue), background);
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

export function validatePixelContrastObservation(observed) {
  requireCondition(
    observed && typeof observed === "object",
    "Pixel contrast observation is required"
  );
  requireCondition(
    observed.auditMethod === "chrome-css-background-ranges",
    "Pixel contrast must use Chrome CSS background ranges"
  );
  const states = Array.isArray(observed.states) ? observed.states : [];
  const stateNames = states.map((state) => state.name);
  requireCondition(
    states.length === EXPECTED_PIXEL_CONTRAST_STATES.length &&
      new Set(stateNames).size === EXPECTED_PIXEL_CONTRAST_STATES.length &&
      EXPECTED_PIXEL_CONTRAST_STATES.every((name) => stateNames.includes(name)) &&
      states.every((state) => state.markerPassed === true),
    "Pixel contrast evidence must contain exactly the required rendered state matrix: " +
      JSON.stringify(states.map((state) => ({ name: state.name, markerPassed: state.markerPassed })))
  );

  const unsupported = states.flatMap((state) =>
    Array.isArray(state.unsupported) ? state.unsupported : [{ reason: "missing unsupported list" }]
  );
  requireCondition(
    unsupported.length === 0,
    "Every visible text item must have a Chrome-resolved background range: " +
      JSON.stringify(unsupported)
  );

  const entries = [];
  for (const state of states) {
    const stateEntries = Array.isArray(state.entries) ? state.entries : [];
    requireCondition(
      Number.isInteger(state.visibleTextItems) &&
        state.visibleTextItems >= 30 &&
        stateEntries.length === state.visibleTextItems,
      `Rendered state ${state.name} must audit every visible text item`
    );
    entries.push(...stateEntries.map((entry) => ({ ...entry, state: state.name })));
  }

  const failures = [];
  let minimumContrast = Number.POSITIVE_INFINITY;
  for (const entry of entries) {
    const backgrounds = Array.isArray(entry.backgroundColors) ? entry.backgroundColors : [];
    requireCondition(
      backgrounds.length > 0,
      `Every audited text item needs at least one background color: ${entry.state}/${entry.label}`
    );
    for (const background of backgrounds) {
      const ratio = contrastRatio(entry.foreground, background);
      minimumContrast = Math.min(minimumContrast, ratio);
      if (ratio < AA_MINIMUM_CONTRAST) {
        failures.push({
          state: entry.state,
          label: entry.label,
          foreground: entry.foreground,
          background,
          ratio
        });
      }
    }
  }
  requireCondition(
    failures.length === 0,
    "Every visible text/background range must meet 4.5:1 without rounding: " +
      JSON.stringify(failures)
  );

  return {
    pixelContrastClaim: true,
    auditMethod: observed.auditMethod,
    states: states.length,
    auditedTextItems: entries.length,
    unsupportedTextItems: unsupported.length,
    failingTextItems: failures.length,
    minimumContrast
  };
}
