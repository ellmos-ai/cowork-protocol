import { CoworkProtocolError } from "../../core/src/index.js";

export { buildLegacyDomFocus, requestLegacyContext } from "./legacy.js";

const MAX_DESCRIPTION_CHARS = 160;
const MAX_PARAMETER_NAMES = 12;
const MAX_TOOL_NAME_CHARS = 64;

function boundedDescription(description) {
  if (typeof description !== "string") return "";
  return description.slice(0, MAX_DESCRIPTION_CHARS);
}

function parameterNames(inputSchema) {
  const properties = inputSchema?.properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return [];
  return Object.keys(properties).slice(0, MAX_PARAMETER_NAMES);
}

function reject(hostToolName, reason) {
  return { hostToolName, reason };
}

export function negotiateWebMcpCatalog({ tools }) {
  if (!Array.isArray(tools)) {
    throw new CoworkProtocolError("INVALID_BRIDGE_CATALOG", "Host tools must be an array");
  }

  const capabilities = [];
  const rejected = [];
  const seenNames = new Set();

  for (const tool of tools) {
    const name = tool?.name;
    if (typeof name !== "string" || name.length === 0 || name.length > MAX_TOOL_NAME_CHARS) {
      rejected.push(reject(typeof name === "string" ? name : "", "INVALID_TOOL_NAME"));
      continue;
    }
    if (seenNames.has(name)) {
      rejected.push(reject(name, "DUPLICATE_TOOL_NAME"));
      continue;
    }
    seenNames.add(name);

    if (!tool.inputSchema || typeof tool.inputSchema !== "object") {
      rejected.push(reject(name, "INPUT_SCHEMA_REQUIRED"));
      continue;
    }

    const readOnly = tool.annotations?.readOnlyHint === true;
    capabilities.push({
      capabilityId: `webmcp:${name}`,
      hostToolName: name,
      description: boundedDescription(tool.description),
      access: readOnly ? "read-execute" : "offer-only",
      parameterNames: parameterNames(tool.inputSchema)
    });
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
  const toolsByName = new Map(tools.map((tool) => [tool?.name, tool]));
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
      return executeTool({
        name: capability.hostToolName,
        arguments: toolArguments
      });
    }
  };
}
