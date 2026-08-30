import { CoworkProtocolError } from "../../core/src/index.js";

export { buildLegacyDomFocus, requestLegacyContext } from "./legacy.js";

const MAX_DESCRIPTION_CHARS = 160;
const MAX_PARAMETER_NAMES = 12;
const MAX_PARAMETER_NAME_CHARS = 48;
const MAX_TOOL_NAME_CHARS = 64;
const MAX_CAPABILITY_SUMMARY_CHARS = 350;
const MAX_READ_RESULT_CHARS = 1200;

function truncateText(text, limit) {
  if (text.length <= limit) return text;
  if (limit === 0) return "";
  let prefix = text.slice(0, limit - 1);
  const lastCodeUnit = prefix.charCodeAt(prefix.length - 1);
  if (lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff) {
    prefix = prefix.slice(0, -1);
  }
  return `${prefix}…`;
}

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

function truncatePreview(serialized) {
  return truncateText(serialized, MAX_READ_RESULT_CHARS);
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
      "INVALID_BRIDGE_CATALOG",
      "Host tool identity exceeds the bridge capability budget"
    );
  }
  return capability;
}

export function boundWebMcpReadResult(capabilityId, result) {
  let serialized;
  try {
    serialized = JSON.stringify(result);
  } catch {
    throw new CoworkProtocolError(
      "INVALID_BRIDGE_RESULT",
      "Host WebMCP read results must be JSON-serializable"
    );
  }
  if (typeof serialized !== "string") {
    throw new CoworkProtocolError(
      "INVALID_BRIDGE_RESULT",
      "Host WebMCP read results must contain a JSON value"
    );
  }
  if (serialized.length <= MAX_READ_RESULT_CHARS) return JSON.parse(serialized);

  const preview = truncatePreview(serialized);
  return {
    protocolVersion: "0.1",
    type: "bridge-read-preview",
    capabilityId,
    preview,
    metrics: {
      sourceCharacters: serialized.length,
      includedCharacters: preview.length,
      truncated: true
    }
  };
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
    capabilities.push(
      boundedCapabilitySummary(tool, readOnly ? "read-execute" : "offer-only")
    );
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
