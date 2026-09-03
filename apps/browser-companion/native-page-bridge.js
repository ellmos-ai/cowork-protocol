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

  // --- Cowork tools this extension registers on pages that have none ---
  // ponytail: the four schemas below mirror packages/native-webmcp/src/index.js
  // by hand because a MAIN-world classic script cannot import a module. Inline
  // them at build time if a third copy ever appears.
  const COMPANION_REQUEST_SOURCE = "cowork-page-client";
  const COMPANION_RESPONSE_SOURCE = "cowork-browser-companion";
  const COMPANION_TIMEOUT_MS = 30_000;
  const OFFER_LIFETIME_MS = 120_000;
  let registration = null;
  let lastFocus = null;
  let contextLevel = 0;

  function failure(code) {
    return Object.assign(new Error(code), { code });
  }

  // The same window channel a page-embedded agent uses. Errors keep their
  // Cowork code, so COMPANION_DISABLED or SESSION_READ_ONLY reach the calling
  // agent as a tool failure instead of a silent success.
  function companionRequest(method, argumentsValue = {}) {
    const requestId = `bridge-${crypto.randomUUID()}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        window.removeEventListener("message", onMessage);
        reject(failure("COMPANION_RESPONSE_TIMEOUT"));
      }, COMPANION_TIMEOUT_MS);
      function onMessage(event) {
        if (
          event.source !== window ||
          event.data?.source !== COMPANION_RESPONSE_SOURCE ||
          event.data?.protocolVersion !== PROTOCOL_VERSION ||
          event.data?.requestId !== requestId
        ) {
          return;
        }
        clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        if (event.data.ok) resolve(event.data.result);
        else reject(failure(event.data.error?.code ?? "COMPANION_REQUEST_FAILED"));
      }
      window.addEventListener("message", onMessage);
      window.postMessage({
        source: COMPANION_REQUEST_SOURCE,
        protocolVersion: PROTOCOL_VERSION,
        requestId,
        method,
        arguments: argumentsValue
      }, "*");
    });
  }

  function toolResult(structuredContent) {
    return {
      content: [{ type: "text", text: JSON.stringify(structuredContent) }],
      structuredContent
    };
  }

  const EXTENSION_TOOLS = [
    {
      name: "cowork_read_focus",
      title: "Read the focused page control",
      description:
        "Read the current user-directed focus on this page as a character-bounded Cowork Protocol packet.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      async execute() {
        lastFocus = await companionRequest("readFocus", { lens: "pointer" });
        contextLevel = 0;
        return toolResult(lastFocus);
      }
    },
    {
      name: "cowork_request_context",
      title: "Request related page context",
      description:
        "Request one character-bounded related context level for the current focus, with a short reason.",
      inputSchema: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            minLength: 1,
            maxLength: 200,
            description: "Why the current focus packet is not sufficient."
          }
        },
        required: ["reason"],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      async execute(input) {
        if (!lastFocus) throw failure("STALE_FOCUS");
        // ponytail: level 3 is the pointer crop. It stays behind the human's
        // Side Panel button, so a remote agent climbs to 2 and stops.
        if (contextLevel >= 2) throw failure("CONTEXT_LIMIT_REACHED");
        const result = await companionRequest("requestContext", {
          currentLevel: contextLevel,
          requestedLevel: contextLevel + 1,
          reason: input?.reason
        });
        contextLevel += 1;
        return toolResult(result);
      }
    },
    {
      name: "cowork_offer_action",
      title: "Offer a page action",
      description:
        "Create a visible action offer in the Cowork Side Panel. This tool never authorizes or executes the change.",
      inputSchema: {
        type: "object",
        properties: {
          capabilityId: { type: "string", description: "Registered capability to propose." },
          targetId: { type: "string", description: "Stable focused target id." },
          value: { type: "string", maxLength: 350, description: "Proposed field value." },
          summary: {
            type: "string",
            maxLength: 200,
            description: "Short human-visible change summary."
          }
        },
        required: ["capabilityId", "targetId", "value", "summary"],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      async execute(input) {
        if (!lastFocus) throw failure("STALE_FOCUS");
        return toolResult(await companionRequest("offerAction", {
          offerId: `webmcp-offer:${crypto.randomUUID()}`,
          capabilityId: input?.capabilityId,
          targetId: input?.targetId,
          pageVersion: lastFocus.pageVersion,
          proposedArguments: { value: input?.value },
          summary: input?.summary,
          effect: "write",
          undoAvailable: true,
          expiresAt: new Date(Date.now() + OFFER_LIFETIME_MS).toISOString()
        }));
      }
    },
    {
      name: "cowork_read_presence",
      title: "Read collaboration presence",
      description:
        "Read whether the human and the model are here, on standby or away, and who holds the click right.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      async execute() {
        return toolResult(await companionRequest("readPresence"));
      }
    }
  ];

  async function registerExtensionTools() {
    if (registration) {
      return { registered: EXTENSION_TOOLS.map(({ name }) => name) };
    }
    const modelContext = document.modelContext;
    if (typeof modelContext?.registerTool !== "function") {
      return { registered: [], reason: "WEBMCP_UNAVAILABLE" };
    }
    // A page that speaks Cowork itself keeps its own tools - never shadow them.
    if ((await tools()).some(
      ({ name }) => typeof name === "string" && name.startsWith("cowork_")
    )) {
      return { registered: [], reason: "PAGE_OWNS_COWORK_TOOLS" };
    }
    const controller = new AbortController();
    try {
      for (const tool of EXTENSION_TOOLS) {
        await modelContext.registerTool(tool, { signal: controller.signal });
      }
    } catch (error) {
      controller.abort();
      throw error;
    }
    registration = controller;
    lastFocus = null;
    contextLevel = 0;
    return { registered: EXTENSION_TOOLS.map(({ name }) => name) };
  }

  function unregisterExtensionTools() {
    registration?.abort();
    registration = null;
    lastFocus = null;
    contextLevel = 0;
    return { registered: [] };
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
      !new Set([
        "discover",
        "execute-tool",
        "register-tools",
        "unregister-tools"
      ]).has(request.method)
    ) {
      return;
    }
    try {
      if (JSON.stringify(request).length > MAX_MESSAGE_CHARACTERS) return;
      let result;
      if (request.method === "discover") result = await discover();
      else if (request.method === "register-tools") result = await registerExtensionTools();
      else if (request.method === "unregister-tools") result = unregisterExtensionTools();
      else result = await executeTool(request.arguments ?? {});
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
