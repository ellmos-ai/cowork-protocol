import assert from "node:assert/strict";
import test from "node:test";

import {
  CoworkIntegrationError,
  createProtocolHostDeclaration,
  createSurfaceClientDeclaration,
  negotiateSurfaceClient
} from "../src/index.js";

function host(integrationMode, pageUiProviderId) {
  return createProtocolHostDeclaration({
    hostId: "example-form-app",
    transports: ["webmcp"],
    integrationMode,
    ...(pageUiProviderId ? { pageUiProviderId } : {})
  });
}

function client(providerId, location = "page") {
  return createSurfaceClientDeclaration({
    providerId,
    surfaceId: `${providerId}:surface`,
    location,
    transports: ["webmcp"]
  });
}

test("protocol-only exposes the protocol without mounting any page UI", () => {
  const result = negotiateSurfaceClient({
    host: host("protocol-only"),
    client: client("any-ui-provider")
  });

  assert.equal(result.protocolAccess, true);
  assert.equal(result.mountPageUi, false);
  assert.equal(result.reason, "host-selected-protocol-only");
});

test("protocol-and-ui mounts only the page UI provider selected by the host", () => {
  const selected = negotiateSurfaceClient({
    host: host("protocol-and-ui", "site-selected-ui"),
    client: client("site-selected-ui")
  });
  const different = negotiateSurfaceClient({
    host: host("protocol-and-ui", "site-selected-ui"),
    client: client("different-ui")
  });

  assert.equal(selected.mountPageUi, true);
  assert.equal(different.protocolAccess, true);
  assert.equal(different.mountPageUi, false);
});

test("protocol-and-user-optional-ui requires an explicit activation", () => {
  const declaration = host(
    "protocol-and-user-optional-ui",
    "site-selected-ui"
  );
  const surface = client("site-selected-ui");

  assert.equal(
    negotiateSurfaceClient({ host: declaration, client: surface }).reason,
    "user-activation-required"
  );
  assert.equal(
    negotiateSurfaceClient({
      host: declaration,
      client: surface,
      userActivated: true
    }).mountPageUi,
    true
  );
});

test("external clients can consume a protocol-only host without mounting in the page", () => {
  for (const [providerId, location] of [
    ["cowork-reference-ui", "browser-side-panel"],
    ["another-vendor", "desktop-window"],
    ["provider-chat", "provider-chat"]
  ]) {
    const result = negotiateSurfaceClient({
      host: host("protocol-only"),
      client: client(providerId, location),
      userActivated: true
    });
    assert.deepEqual(result, {
      protocolAccess: true,
      transport: "webmcp",
      surfaceLocation: location,
      mountPageUi: false,
      reason: "external-surface"
    });
  }
});

test("invalid UI declarations and incompatible transports fail closed", () => {
  assert.throws(
    () => host("protocol-and-ui"),
    (error) =>
      error instanceof CoworkIntegrationError &&
      error.code === "PAGE_UI_PROVIDER_REQUIRED"
  );
  assert.throws(
    () =>
      negotiateSurfaceClient({
        host: host("protocol-only"),
        client: createSurfaceClientDeclaration({
          providerId: "example-ui",
          surfaceId: "example-ui:surface",
          location: "browser-side-panel",
          transports: ["local-companion-link"]
        })
      }),
    (error) =>
      error instanceof CoworkIntegrationError &&
      error.code === "TRANSPORT_UNAVAILABLE"
  );
});
