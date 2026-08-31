import path from "node:path";

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
  const stateRoot = env.LOCALAPPDATA?.trim() || cwd;
  const sessionStorePath = env.COWORK_SESSION_STORE?.trim()
    ? path.resolve(env.COWORK_SESSION_STORE.trim())
    : path.join(stateRoot, "Cowork Protocol", "sessions.json");
  return {
    allowedOrigins,
    sessionStorePath,
    openWindow: env.COWORK_OPEN_WINDOW !== "0",
    tray: env.COWORK_TRAY !== "0",
    model: endpoint
      ? {
          endpoint,
          model: modelId,
          apiKey: env.COWORK_MODEL_API_KEY ?? "",
          reasoningEffort: env.COWORK_MODEL_REASONING_EFFORT ?? ""
        }
      : null
  };
}
