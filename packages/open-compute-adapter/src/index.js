import { digestArguments } from "../../core/src/index.js";

const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,119}$/;

export class OpenComputeAdapterError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "OpenComputeAdapterError";
    this.code = code;
  }
}

function cloneJson(value, label) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    throw new TypeError(`${label} must be JSON serializable`);
  }
}

function validateProfile(raw) {
  const profile = cloneJson(raw, "Open Compute filter profile");
  if (
    !profile ||
    typeof profile !== "object" ||
    Array.isArray(profile) ||
    typeof profile.profileId !== "string" ||
    profile.profileId.length < 1 ||
    profile.profileId.length > 120 ||
    !Array.isArray(profile.allowedTools) ||
    profile.allowedTools.length < 1 ||
    !Array.isArray(profile.allowedActionTypes) ||
    !Number.isInteger(profile.maxElements) ||
    !Number.isInteger(profile.maxCharacters) ||
    profile.maxCharacters < 256 ||
    profile.maxCharacters > 20_000 ||
    profile.allowFullscreen !== false
  ) {
    throw new TypeError("Open Compute requires a bounded no-fullscreen filter profile");
  }
  return Object.freeze(profile);
}

function isPendingConfirmationResult(result) {
  if (!result || typeof result !== "object") return false;
  return result.status === "needs_confirmation" ||
    result.type === "needs_confirmation" ||
    result.needs_confirmation === true ||
    result.needsConfirmation === true;
}

function requireSessionId(sessionId) {
  if (typeof sessionId !== "string" || !SESSION_ID.test(sessionId)) {
    throw new OpenComputeAdapterError(
      "INVALID_COMPUTER_USE_SESSION",
      "Computer Use requires one bounded Cowork session id"
    );
  }
}

function toolNames(list) {
  if (!Array.isArray(list)) return new Set();
  return new Set(list.map((tool) => typeof tool === "string" ? tool : tool?.name).filter(Boolean));
}

function parseToolResult(raw) {
  if (raw?.structuredContent && typeof raw.structuredContent === "object") {
    return raw.structuredContent;
  }
  if (Array.isArray(raw?.content)) {
    const image = raw.content.find((item) => item?.type === "image");
    if (image) return cloneJson(image, "Open Compute image result");
    const text = raw.content.find((item) => item?.type === "text" && typeof item.text === "string");
    if (text) {
      try {
        return JSON.parse(text.text);
      } catch {
        throw new OpenComputeAdapterError(
          "OPEN_COMPUTE_RESULT_INVALID",
          "Open Compute returned an unstructured text result"
        );
      }
    }
  }
  if (raw && typeof raw === "object") return cloneJson(raw, "Open Compute result");
  throw new OpenComputeAdapterError(
    "OPEN_COMPUTE_RESULT_INVALID",
    "Open Compute returned no usable result"
  );
}

export function createOpenComputeAdapter({
  client,
  profile: rawProfile,
  agentLabel = "Cowork model"
}) {
  if (
    !client ||
    typeof client.start !== "function" ||
    typeof client.listTools !== "function" ||
    typeof client.callTool !== "function" ||
    typeof client.close !== "function"
  ) {
    throw new TypeError("Open Compute adapter requires one MCP client");
  }
  if (typeof agentLabel !== "string" || agentLabel.trim() === "" || agentLabel.length > 80) {
    throw new TypeError("Open Compute agent label must be bounded");
  }
  const profile = validateProfile(rawProfile);
  let started = false;
  let available = false;
  let activeSessionId = null;
  let indicatorVisible = false;
  let lastAbortMessage = null;
  let lastAbortSessionId = null;

  function status() {
    return {
      available,
      executionMode: indicatorVisible && activeSessionId ? "computer-use" : "structured",
      indicatorVisible,
      activeSessionId,
      lastAbortMessage,
      lastAbortSessionId
    };
  }

  async function discover() {
    if (available) return;
    if (!started) {
      await client.start();
      started = true;
    }
    const names = toolNames(await client.listTools());
    const missing = profile.allowedTools.filter((name) => !names.has(name));
    if (missing.length > 0) {
      throw new OpenComputeAdapterError(
        "OPEN_COMPUTE_CAPABILITIES_MISSING",
        `Open Compute is missing the profiled tools: ${missing.join(", ")}`
      );
    }
    available = true;
  }

  async function call(name, arguments_) {
    if (!profile.allowedTools.includes(name)) {
      throw new OpenComputeAdapterError(
        "OPEN_COMPUTE_TOOL_OUTSIDE_PROFILE",
        `Tool ${name} is outside the Cowork filter profile`
      );
    }
    return parseToolResult(await client.callTool(name, arguments_));
  }

  function requireActive(sessionId) {
    requireSessionId(sessionId);
    if (activeSessionId !== sessionId || !indicatorVisible) {
      throw new OpenComputeAdapterError(
        "COMPUTER_USE_NOT_ACTIVE",
        "This Cowork session does not own the active Computer Use indicator"
      );
    }
  }

  async function hideActiveSignal() {
    const hidden = await call("signal_hide", {});
    if (hidden?.visible !== false) {
      throw new OpenComputeAdapterError(
        "OPEN_COMPUTE_SIGNAL_UNVERIFIED",
        "Open Compute did not confirm that its control indicator was removed"
      );
    }
    indicatorVisible = false;
    activeSessionId = null;
  }

  return {
    readStatus: status,

    async activate({ sessionId, humanGesture }) {
      requireSessionId(sessionId);
      if (humanGesture !== true) {
        throw new OpenComputeAdapterError(
          "HUMAN_ACTIVATION_REQUIRED",
          "Only the local Cowork control can activate Computer Use"
        );
      }
      if (activeSessionId && activeSessionId !== sessionId) {
        throw new OpenComputeAdapterError(
          "COMPUTER_USE_SEAT_TAKEN",
          "Another Cowork session owns the system pointer"
        );
      }
      if (activeSessionId === sessionId && indicatorVisible) return status();
      // Reserve the seat synchronously, before the first await below: two
      // activate() calls for different sessions both pass the checks above
      // in the same microtask, so the seat must be claimed here rather than
      // after discover()/signal_show() resolve, or the later call would
      // silently overwrite the earlier one's activeSessionId.
      activeSessionId = sessionId;
      try {
        await discover();
        const shown = await call("signal_show", {
          mode: "control",
          agent: agentLabel.trim(),
          scope: "screen"
        });
        if (shown?.visible !== true || shown?.mode !== "control") {
          throw new OpenComputeAdapterError(
            "OPEN_COMPUTE_SIGNAL_UNVERIFIED",
            "Open Compute did not confirm its visible control indicator"
          );
        }
      } catch (error) {
        if (!indicatorVisible) activeSessionId = null;
        throw error;
      }
      indicatorVisible = true;
      lastAbortMessage = null;
      lastAbortSessionId = null;
      return status();
    },

    async deactivate({ sessionId, humanGesture }) {
      requireActive(sessionId);
      if (humanGesture !== true) {
        throw new OpenComputeAdapterError(
          "HUMAN_ACTIVATION_REQUIRED",
          "Only the local Cowork control can stop Computer Use"
        );
      }
      await hideActiveSignal();
      return status();
    },

    async refreshStatus({ sessionId }) {
      requireActive(sessionId);
      const refreshed = await call("signal_status", {});
      const abortMessage = refreshed?.pending_abort_message;
      if (typeof abortMessage === "string" && abortMessage.trim() !== "") {
        lastAbortMessage = abortMessage.slice(0, 350);
        lastAbortSessionId = sessionId;
        await hideActiveSignal();
        return status();
      }
      if (refreshed?.visible !== true || refreshed?.mode !== "control") {
        indicatorVisible = false;
        activeSessionId = null;
      }
      return status();
    },

    async readAttention({ sessionId, focus, window = null }) {
      requireActive(sessionId);
      if (window !== null && (typeof window !== "string" || window.length > 200)) {
        throw new OpenComputeAdapterError(
          "INVALID_ATTENTION_WINDOW",
          "Filtered attention window must be a bounded title"
        );
      }
      const packet = await call("observe_filtered", { profile, focus, window });
      if (
        packet?.type !== "filtered-perception" ||
        packet.profileId !== profile.profileId ||
        !Array.isArray(packet.elements) ||
        packet.elements.length > profile.maxElements ||
        !Number.isInteger(packet?.metrics?.payloadCharacters) ||
        packet.metrics.payloadCharacters > profile.maxCharacters
      ) {
        throw new OpenComputeAdapterError(
          "OPEN_COMPUTE_FILTER_BYPASSED",
          "Open Compute did not return the declared bounded filter profile"
        );
      }
      return packet;
    },

    async requestVisualLens({ sessionId, focus, reason }) {
      requireActive(sessionId);
      if (typeof reason !== "string" || reason.trim() === "" || reason.length > 200) {
        throw new OpenComputeAdapterError(
          "VISUAL_ESCALATION_REASON_REQUIRED",
          "A bounded reason is required before requesting the visual lens"
        );
      }
      const image = await call("capture_filtered", { profile, focus });
      const lensWidth = profile.visualLens?.width;
      const lensHeight = profile.visualLens?.height;
      if (
        image?.type !== "image" ||
        typeof image.data !== "string" ||
        image.data === "" ||
        !Number.isInteger(image.width) ||
        !Number.isInteger(image.height) ||
        !Number.isInteger(lensWidth) ||
        !Number.isInteger(lensHeight) ||
        image.width > lensWidth ||
        image.height > lensHeight
      ) {
        throw new OpenComputeAdapterError(
          "OPEN_COMPUTE_FILTER_BYPASSED",
          "Open Compute did not return one filtered visual lens within the profiled bound"
        );
      }
      return image;
    },

    async executeAuthorizedAction({ sessionId, offer, authorization }) {
      requireActive(sessionId);
      const proposedArguments = offer?.proposedArguments;
      const action = proposedArguments?.action;
      const actionType = action?.type ?? action?.action;
      const authorizationMatches =
        authorization?.protocolVersion === "0.1" &&
        authorization?.type === "action-authorization" &&
        authorization.authorizationSource === "human-click" &&
        authorization.offerId === offer?.offerId &&
        authorization.pageVersion === offer?.pageVersion &&
        typeof authorization.authorizedArgumentsDigest === "string" &&
        authorization.authorizedArgumentsDigest === digestArguments(proposedArguments) &&
        proposedArguments &&
        typeof proposedArguments === "object" &&
        !Array.isArray(proposedArguments) &&
        Object.keys(proposedArguments).length === 1 &&
        action &&
        typeof action === "object" &&
        !Array.isArray(action) &&
        profile.allowedActionTypes.includes(actionType);
      if (!authorizationMatches) {
        throw new OpenComputeAdapterError(
          "ACTION_AUTHORIZATION_MISMATCH",
          "Computer action no longer matches its human-authorized Cowork offer"
        );
      }
      const result = await call("do", {
        action: cloneJson(action, "Computer action"),
        // Cowork always requests its own least-restrictive per-call ceiling
        // here; the open-compute server clamps the effective mode to the
        // more restrictive of this value and its own OC_SAFETY_MODE, so a
        // server running in "confirm" mode still gates the action instead
        // of executing it.
        mode: "allow_all",
        profile
      });
      if (isPendingConfirmationResult(result)) {
        throw new OpenComputeAdapterError(
          "OPEN_COMPUTE_CONFIRMATION_PENDING",
          "Open Compute requires a human confirmation before this action runs"
        );
      }
      return result;
    },

    async close() {
      if (indicatorVisible && activeSessionId) {
        try {
          await hideActiveSignal();
        } catch {
          indicatorVisible = false;
          activeSessionId = null;
        }
      }
      if (started) await client.close();
      started = false;
      available = false;
      indicatorVisible = false;
      activeSessionId = null;
      lastAbortMessage = null;
      lastAbortSessionId = null;
    }
  };
}
