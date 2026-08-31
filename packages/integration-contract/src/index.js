const INTEGRATION_MODES = new Set([
  "protocol-only",
  "protocol-and-ui",
  "protocol-and-user-optional-ui"
]);
const SURFACE_LOCATIONS = new Set([
  "page",
  "browser-side-panel",
  "desktop-window",
  "provider-chat"
]);
const TEXT_PATTERN = /^[a-z0-9][a-z0-9._:-]*$/i;

export class CoworkIntegrationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CoworkIntegrationError";
    this.code = code;
  }
}

function requiredId(value, label) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 120 ||
    !TEXT_PATTERN.test(value)
  ) {
    throw new CoworkIntegrationError(
      "INVALID_INTEGRATION_DECLARATION",
      `${label} must be a stable identifier of at most 120 characters`
    );
  }
  return value;
}

function normalizeTransports(transports) {
  if (!Array.isArray(transports) || transports.length < 1 || transports.length > 8) {
    throw new CoworkIntegrationError(
      "INVALID_INTEGRATION_DECLARATION",
      "At least one and at most eight transports are required"
    );
  }
  const normalized = transports.map((value) => requiredId(value, "transport"));
  if (new Set(normalized).size !== normalized.length) {
    throw new CoworkIntegrationError(
      "INVALID_INTEGRATION_DECLARATION",
      "Transport identifiers must be unique"
    );
  }
  return normalized;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createProtocolHostDeclaration({
  hostId,
  protocolVersion = "0.1",
  transports,
  integrationMode = "protocol-only",
  pageUiProviderId
}) {
  if (!INTEGRATION_MODES.has(integrationMode)) {
    throw new CoworkIntegrationError(
      "INVALID_INTEGRATION_MODE",
      "The host must select one supported protocol and page-UI integration mode"
    );
  }
  if (integrationMode === "protocol-only" && pageUiProviderId !== undefined) {
    throw new CoworkIntegrationError(
      "PAGE_UI_NOT_ALLOWED",
      "A protocol-only host cannot declare an in-page UI provider"
    );
  }
  if (integrationMode !== "protocol-only" && pageUiProviderId === undefined) {
    throw new CoworkIntegrationError(
      "PAGE_UI_PROVIDER_REQUIRED",
      "A host that offers an in-page UI must identify the selected UI provider"
    );
  }

  return Object.freeze({
    type: "cowork-protocol-host",
    protocolVersion: requiredId(protocolVersion, "protocolVersion"),
    hostId: requiredId(hostId, "hostId"),
    transports: Object.freeze(normalizeTransports(transports)),
    presentation: Object.freeze({
      mode: integrationMode,
      mountsPageUiAutomatically: integrationMode === "protocol-and-ui",
      requiresUserActivation:
        integrationMode === "protocol-and-user-optional-ui",
      ...(pageUiProviderId === undefined
        ? {}
        : { pageUiProviderId: requiredId(pageUiProviderId, "pageUiProviderId") })
    })
  });
}

export function createSurfaceClientDeclaration({
  providerId,
  surfaceId,
  location,
  protocolVersion = "0.1",
  transports
}) {
  if (!SURFACE_LOCATIONS.has(location)) {
    throw new CoworkIntegrationError(
      "INVALID_SURFACE_LOCATION",
      "The surface client location is unsupported"
    );
  }
  return Object.freeze({
    type: "cowork-surface-client",
    protocolVersion: requiredId(protocolVersion, "protocolVersion"),
    providerId: requiredId(providerId, "providerId"),
    surfaceId: requiredId(surfaceId, "surfaceId"),
    location,
    transports: Object.freeze(normalizeTransports(transports))
  });
}

export function negotiateSurfaceClient({ host, client, userActivated = false }) {
  if (host?.type !== "cowork-protocol-host" || client?.type !== "cowork-surface-client") {
    throw new CoworkIntegrationError(
      "INVALID_INTEGRATION_DECLARATION",
      "A protocol host and surface client declaration are required"
    );
  }
  if (host.protocolVersion !== client.protocolVersion) {
    throw new CoworkIntegrationError(
      "PROTOCOL_VERSION_MISMATCH",
      "The host and surface client protocol versions do not match"
    );
  }
  const transport = host.transports.find((candidate) =>
    client.transports.includes(candidate)
  );
  if (!transport) {
    throw new CoworkIntegrationError(
      "TRANSPORT_UNAVAILABLE",
      "The host and surface client have no shared transport"
    );
  }

  const external = client.location !== "page";
  if (external) {
    return Object.freeze({
      protocolAccess: true,
      transport,
      surfaceLocation: client.location,
      mountPageUi: false,
      reason: "external-surface"
    });
  }

  const presentation = host.presentation;
  if (presentation.mode === "protocol-only") {
    return Object.freeze({
      protocolAccess: true,
      transport,
      surfaceLocation: "page",
      mountPageUi: false,
      reason: "host-selected-protocol-only"
    });
  }
  if (presentation.pageUiProviderId !== client.providerId) {
    return Object.freeze({
      protocolAccess: true,
      transport,
      surfaceLocation: "page",
      mountPageUi: false,
      reason: "different-page-ui-provider"
    });
  }
  if (presentation.requiresUserActivation && userActivated !== true) {
    return Object.freeze({
      protocolAccess: true,
      transport,
      surfaceLocation: "page",
      mountPageUi: false,
      reason: "user-activation-required"
    });
  }
  return Object.freeze({
    protocolAccess: true,
    transport,
    surfaceLocation: "page",
    mountPageUi: true,
    reason: presentation.mountsPageUiAutomatically
      ? "host-selected-page-ui"
      : "user-activated-page-ui"
  });
}

export function copyIntegrationDeclaration(declaration) {
  return cloneJson(declaration);
}
