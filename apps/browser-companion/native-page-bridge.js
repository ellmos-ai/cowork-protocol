(() => {
  if (globalThis.__coworkNativePageBridgeInstalled) return;
  globalThis.__coworkNativePageBridgeInstalled = true;
  const REQUEST_SOURCE = "cowork-extension-native-request";
  const RESPONSE_SOURCE = "cowork-extension-native-response";
  const PROTOCOL_VERSION = "0.1";
  const MAX_MESSAGE_CHARACTERS = 12_000;

  function safeClone(value) {
    if (value === undefined) return null;
    return JSON.parse(JSON.stringify(value));
  }

  function safeCode(error) {
    return typeof error?.code === "string" && /^[A-Z0-9_:-]{1,64}$/.test(error.code)
      ? error.code
      : "NATIVE_WEBMCP_REQUEST_FAILED";
  }

  async function tools() {
    const modelContext = document.modelContext;
    if (typeof modelContext?.getTools !== "function") return [];
    const discovered = await modelContext.getTools();
    if (!Array.isArray(discovered)) return [];
    return discovered;
  }

  async function discover() {
    const discovered = await tools();
    const descriptors = discovered
      .filter((tool) => typeof tool?.name === "string" && tool.name.length <= 160)
      .slice(0, 100)
      .map((tool) => ({
        name: tool.name,
        title: typeof tool.title === "string" ? tool.title.slice(0, 200) : "",
        annotations:
          tool.annotations && typeof tool.annotations === "object"
            ? safeClone(tool.annotations)
            : {}
      }));
    const coworkToolCount = descriptors.filter(({ name }) => name.startsWith("cowork_")).length;
    const sessionReader = globalThis.coworkSession;
    const sessionAvailable =
      typeof sessionReader?.readCurrentSnapshot === "function" ||
      typeof sessionReader?.readSnapshot === "function";
    return {
      protocolVersion: PROTOCOL_VERSION,
      type: "native-page-discovery",
      mode:
        coworkToolCount > 0 || sessionAvailable
          ? "native-cowork"
          : descriptors.length > 0
            ? "native-webmcp"
            : "unavailable",
      webMcpAvailable: descriptors.length > 0,
      coworkProtocolAvailable: coworkToolCount > 0 || sessionAvailable,
      coworkToolCount,
      tools: descriptors
    };
  }

  async function executeTool({ toolName, input = {} }) {
    if (
      typeof toolName !== "string" ||
      toolName.length === 0 ||
      toolName.length > 160 ||
      !input ||
      typeof input !== "object" ||
      Array.isArray(input)
    ) {
      throw Object.assign(new Error("Invalid native tool request"), {
        code: "INVALID_NATIVE_TOOL_REQUEST"
      });
    }
    const modelContext = document.modelContext;
    if (typeof modelContext?.executeTool !== "function") {
      throw Object.assign(new Error("Native WebMCP unavailable"), {
        code: "NATIVE_WEBMCP_UNAVAILABLE"
      });
    }
    const tool = (await tools()).find((candidate) => candidate?.name === toolName);
    if (!tool) {
      throw Object.assign(new Error("Native WebMCP tool unavailable"), {
        code: "NATIVE_WEBMCP_TOOL_UNAVAILABLE"
      });
    }
    // Use the current WebMCP argument wire format exactly once. Retrying a
    // failed mutating tool with another argument shape could duplicate work.
    const result = await modelContext.executeTool(tool, JSON.stringify(input));
    const envelope = typeof result === "string" ? JSON.parse(result) : result;
    return safeClone(envelope?.structuredContent ?? envelope);
  }

  window.addEventListener("message", async (event) => {
    if (event.source !== window) return;
    const request = event.data;
    if (
      request?.source !== REQUEST_SOURCE ||
      request.protocolVersion !== PROTOCOL_VERSION ||
      typeof request.requestId !== "string" ||
      request.requestId.length === 0 ||
      request.requestId.length > 120 ||
      !new Set(["discover", "execute-tool"]).has(request.method)
    ) {
      return;
    }
    try {
      if (JSON.stringify(request).length > MAX_MESSAGE_CHARACTERS) return;
      const result =
        request.method === "discover"
          ? await discover()
          : await executeTool(request.arguments ?? {});
      window.postMessage({
        source: RESPONSE_SOURCE,
        protocolVersion: PROTOCOL_VERSION,
        requestId: request.requestId,
        ok: true,
        result
      }, "*");
    } catch (error) {
      window.postMessage({
        source: RESPONSE_SOURCE,
        protocolVersion: PROTOCOL_VERSION,
        requestId: request.requestId,
        ok: false,
        error: { code: safeCode(error) }
      }, "*");
    }
  });
})();
