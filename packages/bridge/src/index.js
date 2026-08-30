import { CoworkProtocolError } from "../../core/src/index.js";
import { boundHostResult, truncateBridgeText } from "./bounded-result.js";
import { createLegacyHostCompanion } from "./companion.js";

export { buildLegacyDomFocus, requestLegacyContext } from "./legacy.js";
export { createLegacyHostCompanion } from "./companion.js";

const MAX_DESCRIPTION_CHARS = 160;
const MAX_PARAMETER_NAMES = 12;
const MAX_PARAMETER_NAME_CHARS = 48;
const MAX_TOOL_NAME_CHARS = 64;
const MAX_CAPABILITY_SUMMARY_CHARS = 350;
const truncateText = truncateBridgeText;

function boundedDescription(description) {
  if (typeof description !== "string") return "";
  return truncateText(description, MAX_DESCRIPTION_CHARS);
}

function parameterNames(inputSchema) {
  const properties = inputSchema?.properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return [];
  return Object.keys(properties)
    .slice(0, MAX_PARAMETER_NAMES)
    .map((name) => truncateText(name, MAX_PARAMETER_NAME_CHARS));
}

function reject(hostToolName, reason) {
  return { hostToolName, reason };
}

function boundedCapabilitySummary(tool, access) {
  const capability = {
    capabilityId: `webmcp:${tool.name}`,
    hostToolName: tool.name,
    description: boundedDescription(tool.description),
    access,
    parameterNames: parameterNames(tool.inputSchema)
  };

  while (JSON.stringify(capability).length > MAX_CAPABILITY_SUMMARY_CHARS) {
    if (capability.description.length > 0) {
      const excess =
        JSON.stringify(capability).length - MAX_CAPABILITY_SUMMARY_CHARS;
      capability.description = truncateText(
        capability.description,
        Math.max(0, capability.description.length - excess)
      );
      continue;
    }
    if (capability.parameterNames.length > 0) {
      capability.parameterNames.pop();
      continue;
    }
    throw new CoworkProtocolError(
      "CAPABILITY_SUMMARY_EXCEEDS_BUDGET",
      "Host tool identity exceeds the bridge capability budget"
    );
  }
  return capability;
}

export function boundWebMcpReadResult(capabilityId, result) {
  return boundHostResult(capabilityId, result, "bridge-read-preview");
}

export function negotiateWebMcpCatalog({ tools }) {
  if (!Array.isArray(tools)) {
    throw new CoworkProtocolError("INVALID_BRIDGE_CATALOG", "Host tools must be an array");
  }

  const capabilities = [];
  const rejected = [];
  const nameCounts = new Map();
  const rejectedDuplicateNames = new Set();

  for (const tool of tools) {
    if (typeof tool?.name === "string") {
      nameCounts.set(tool.name, (nameCounts.get(tool.name) ?? 0) + 1);
    }
  }

  for (const tool of tools) {
    const name = tool?.name;
    if (
      typeof name !== "string" ||
      name.trim().length === 0 ||
      name.length > MAX_TOOL_NAME_CHARS
    ) {
      rejected.push(reject(typeof name === "string" ? name : "", "INVALID_TOOL_NAME"));
      continue;
    }
    if (nameCounts.get(name) > 1) {
      if (!rejectedDuplicateNames.has(name)) {
        rejected.push(reject(name, "DUPLICATE_TOOL_NAME"));
        rejectedDuplicateNames.add(name);
      }
      continue;
    }

    if (
      !tool.inputSchema ||
      typeof tool.inputSchema !== "object" ||
      Array.isArray(tool.inputSchema)
    ) {
      rejected.push(reject(name, "INPUT_SCHEMA_REQUIRED"));
      continue;
    }

    const readOnly = tool.annotations?.readOnlyHint === true;
    try {
      capabilities.push(
        boundedCapabilitySummary(tool, readOnly ? "read-execute" : "offer-only")
      );
    } catch (error) {
      if (
        error instanceof CoworkProtocolError &&
        error.code === "CAPABILITY_SUMMARY_EXCEEDS_BUDGET"
      ) {
        rejected.push(reject(name, "CAPABILITY_SUMMARY_EXCEEDS_BUDGET"));
        continue;
      }
      throw error;
    }
  }

  return {
    mode: "webmcp-bridge",
    discovery: "host-supplied",
    capabilities,
    rejected
  };
}

export function createWebMcpBridge({ tools, executeTool }) {
  if (typeof executeTool !== "function") {
    throw new CoworkProtocolError(
      "BRIDGE_EXECUTOR_REQUIRED",
      "A host WebMCP executor is required"
    );
  }

  const catalog = negotiateWebMcpCatalog({ tools });
  const toolsByName = new Map(
    catalog.capabilities.map((capability) => [
      capability.hostToolName,
      tools.find((tool) => tool?.name === capability.hostToolName)
    ])
  );
  const capabilitiesById = new Map(
    catalog.capabilities.map((capability) => [capability.capabilityId, capability])
  );

  return {
    catalog,
    async executeRead({ capabilityId, arguments: toolArguments = {} }) {
      const capability = capabilitiesById.get(capabilityId);
      if (!capability) {
        throw new CoworkProtocolError(
          "CAPABILITY_UNAVAILABLE",
          "The host capability is not present in the bridge catalog"
        );
      }
      if (capability.access !== "read-execute") {
        throw new CoworkProtocolError(
          "HUMAN_CONFIRMATION_REQUIRED",
          "Mutating host tools remain visible offers until the human authorizes them"
        );
      }
      if (!toolArguments || typeof toolArguments !== "object" || Array.isArray(toolArguments)) {
        throw new CoworkProtocolError(
          "INVALID_TOOL_ARGUMENTS",
          "WebMCP tool arguments must be an object"
        );
      }
      const hostTool = toolsByName.get(capability.hostToolName);
      const required = Array.isArray(hostTool?.inputSchema?.required)
        ? hostTool.inputSchema.required.filter((name) => typeof name === "string")
        : [];
      const missing = required.filter(
        (name) => !Object.hasOwn(toolArguments, name)
      );
      if (missing.length > 0) {
        const error = new CoworkProtocolError(
          "INVALID_TOOL_ARGUMENTS",
          "Required WebMCP tool arguments are missing"
        );
        error.details = { missing };
        throw error;
      }
      const result = await executeTool({
        name: capability.hostToolName,
        arguments: toolArguments
      });
      return boundWebMcpReadResult(capabilityId, result);
    }
  };
}

function diagnostic(layer, code) {
  const normalizedCode =
    typeof code === "string" && /^[A-Z0-9_:-]{1,64}$/.test(code)
      ? code
      : `${layer.toUpperCase()}_LAYER_ERROR`;
  return { layer, code: normalizedCode };
}

function runtimeEnvelope(mode, adapter, diagnostics, guarantees, host) {
  return {
    protocolVersion: "0.1",
    mode,
    selection: "host-supplied-priority",
    diagnostics,
    guarantees,
    adapter,
    ...(host ? { host } : {})
  };
}

export async function negotiateCoworkRuntime({ native, webMcp, legacy } = {}) {
  const diagnostics = [];

  if (native) {
    let available = true;
    if (typeof native.isAvailable === "function") {
      try {
        available = (await native.isAvailable()) === true;
      } catch (error) {
        available = false;
        diagnostics.push(
          diagnostic("native", error?.code ?? "NATIVE_PROBE_FAILED")
        );
      }
    }
    if (available && typeof native.readFocus === "function") {
      return runtimeEnvelope("native-cowork", native, diagnostics, {
        stableTargets: true,
        browserWideDiscovery: false,
        directMutation: "native-policy"
      });
    }
    if (available) {
      diagnostics.push(diagnostic("native", "NATIVE_ADAPTER_INVALID"));
    } else if (!diagnostics.some(({ layer }) => layer === "native")) {
      diagnostics.push(diagnostic("native", "NATIVE_UNAVAILABLE"));
    }
  }

  if (webMcp) {
    try {
      const bridge = createWebMcpBridge(webMcp);
      if (bridge.catalog.capabilities.length > 0) {
        return runtimeEnvelope("webmcp-bridge", bridge, diagnostics, {
          discovery: "host-supplied",
          readExecution: "read-only-hint",
          mutation: "offer-only"
        });
      }
      diagnostics.push(diagnostic("webmcp", "NO_USABLE_CAPABILITIES"));
    } catch (error) {
      diagnostics.push(
        diagnostic("webmcp", error?.code ?? "WEBMCP_BRIDGE_INVALID")
      );
    }
  }

  if (legacy) {
    try {
      const companion = createLegacyHostCompanion(legacy);
      return runtimeEnvelope(
        "legacy-host-companion",
        companion.agent,
        diagnostics,
        companion.guarantees,
        companion.host
      );
    } catch (error) {
      diagnostics.push(
        diagnostic("legacy", error?.code ?? "LEGACY_COMPANION_INVALID")
      );
    }
  }

  const error = new CoworkProtocolError(
    "CAPABILITY_UNAVAILABLE",
    "No native Cowork, host-supplied WebMCP, or legacy host companion is available"
  );
  error.details = { diagnostics };
  throw error;
}
