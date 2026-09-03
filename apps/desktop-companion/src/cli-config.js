import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_OPEN_COMPUTE_ARGS = Object.freeze([
  "--from",
  "open-compute[mcp,local,uia] @ git+https://github.com/ellmos-ai/open-compute.git",
  "open-compute-mcp"
]);
const OPEN_COMPUTE_SAFETY_MODES = new Set(["confirm", "read_only", "allow_all"]);
const OPEN_COMPUTE_PROFILE_PATH = fileURLToPath(
  new URL("../profiles/cowork-open-compute-filter.v1.json", import.meta.url)
);

function readOpenComputeArgs(serialized) {
  if (serialized === undefined || serialized.trim() === "") {
    return [...DEFAULT_OPEN_COMPUTE_ARGS];
  }
  let args;
  try {
    args = JSON.parse(serialized);
  } catch {
    throw new Error("COWORK_OPEN_COMPUTE_ARGS must be a JSON string array");
  }
  if (
    !Array.isArray(args) ||
    args.length > 32 ||
    args.some((value) => typeof value !== "string" || value.length > 1000)
  ) {
    throw new Error("COWORK_OPEN_COMPUTE_ARGS must be a bounded JSON string array");
  }
  return args;
}

function readComputerUseConfig(env) {
  if (env.COWORK_COMPUTER_USE === "0") return null;
  const safetyMode = env.COWORK_OPEN_COMPUTE_SAFETY?.trim() || "confirm";
  if (!OPEN_COMPUTE_SAFETY_MODES.has(safetyMode)) {
    throw new Error(
      "COWORK_OPEN_COMPUTE_SAFETY must be confirm, read_only, or allow_all"
    );
  }
  const command = env.COWORK_OPEN_COMPUTE_COMMAND?.trim() || "uvx";
  if (command.length > 500) {
    throw new Error("COWORK_OPEN_COMPUTE_COMMAND must be bounded");
  }
  return {
    command,
    args: readOpenComputeArgs(env.COWORK_OPEN_COMPUTE_ARGS),
    env: { OC_SAFETY_MODE: safetyMode },
    profilePath: OPEN_COMPUTE_PROFILE_PATH
  };
}

export function createCompanionCliConfig({ env = process.env, cwd = process.cwd() } = {}) {
  const allowedOrigins = (env.COWORK_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (allowedOrigins.length === 0) {
    throw new Error("Set COWORK_ALLOWED_ORIGINS to the explicitly paired website origins");
  }
  const endpoint = env.COWORK_MODEL_ENDPOINT?.trim() ?? "";
  const modelId = env.COWORK_MODEL?.trim() ?? "";
  if (Boolean(endpoint) !== Boolean(modelId)) {
    throw new Error("COWORK_MODEL_ENDPOINT and COWORK_MODEL must be configured together");
  }
  // Reasoning models spend answer tokens on thinking, and how many varies per
  // model, so the budget is a knob rather than a constant.
  const maxTokens = env.COWORK_MODEL_MAX_TOKENS?.trim()
    ? Number(env.COWORK_MODEL_MAX_TOKENS.trim())
    : 500;
  if (!Number.isInteger(maxTokens) || maxTokens < 64 || maxTokens > 2000) {
    throw new Error("COWORK_MODEL_MAX_TOKENS must be an integer between 64 and 2000");
  }
  const stateRoot = env.LOCALAPPDATA?.trim() || cwd;
  const sessionStorePath = env.COWORK_SESSION_STORE?.trim()
    ? path.resolve(env.COWORK_SESSION_STORE.trim())
    : path.join(stateRoot, "Cowork Protocol", "sessions.json");
  return {
    allowedOrigins,
    sessionStorePath,
    openWindow: env.COWORK_OPEN_WINDOW !== "0",
    tray: env.COWORK_TRAY !== "0",
    computerUse: readComputerUseConfig(env),
    model: endpoint
      ? {
          endpoint,
          model: modelId,
          apiKey: env.COWORK_MODEL_API_KEY ?? "",
          reasoningEffort: env.COWORK_MODEL_REASONING_EFFORT ?? "",
          maxTokens
        }
      : null
  };
}
