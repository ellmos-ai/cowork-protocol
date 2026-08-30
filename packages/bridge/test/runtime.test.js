import assert from "node:assert/strict";
import test from "node:test";

import {
  negotiateCoworkRuntime
} from "../src/index.js";
import { CoworkProtocolError } from "../../core/src/index.js";

function legacyFixture(overrides = {}) {
  return {
    sessionId: "runtime-legacy-session",
    getTargetSnapshot: async () => ({
      pageVersion: 7,
      target: {
        stableId: "customer-name",
        role: "textbox",
        label: "Customer name"
      }
    }),
    ...overrides
  };
}

test("runtime selects an available native Cowork adapter first", async () => {
  let bridgeCalled = false;
  const native = {
    isAvailable: async () => true,
    readFocus: async () => ({ type: "focus", targetId: "form:name" })
  };

  const runtime = await negotiateCoworkRuntime({
    native,
    webMcp: {
      tools: [{
        name: "read_record",
        inputSchema: { type: "object", properties: {} },
        annotations: { readOnlyHint: true }
      }],
      executeTool: async () => {
        bridgeCalled = true;
        return {};
      }
    },
    legacy: legacyFixture()
  });

  assert.equal(runtime.mode, "native-cowork");
  assert.equal(runtime.adapter, native);
  assert.deepEqual(await runtime.adapter.readFocus(), {
    type: "focus",
    targetId: "form:name"
  });
  assert.equal(bridgeCalled, false);
});

test("runtime falls through an unavailable native adapter to host WebMCP", async () => {
  const calls = [];
  const runtime = await negotiateCoworkRuntime({
    native: {
      isAvailable: async () => false,
      readFocus: async () => ({})
    },
    webMcp: {
      tools: [{
        name: "read_record",
        inputSchema: { type: "object", properties: {} },
        annotations: { readOnlyHint: true }
      }],
      executeTool: async (request) => {
        calls.push(request);
        return { title: "Bounded host record" };
      }
    },
    legacy: legacyFixture()
  });

  assert.equal(runtime.mode, "webmcp-bridge");
  assert.deepEqual(runtime.diagnostics, [
    { layer: "native", code: "NATIVE_UNAVAILABLE" }
  ]);
  assert.deepEqual(
    await runtime.adapter.executeRead({
      capabilityId: "webmcp:read_record",
      arguments: {}
    }),
    { title: "Bounded host record" }
  );
  assert.equal(calls.length, 1);
});

test("runtime selects the legacy companion when WebMCP has no usable capability", async () => {
  const runtime = await negotiateCoworkRuntime({
    webMcp: {
      tools: [{ name: "unsafe_unknown_effect" }],
      executeTool: async () => ({})
    },
    legacy: legacyFixture()
  });

  assert.equal(runtime.mode, "legacy-host-companion");
  assert.deepEqual(runtime.diagnostics, [
    { layer: "webmcp", code: "NO_USABLE_CAPABILITIES" }
  ]);
  assert.equal(runtime.adapter.confirmAction, undefined);
  assert.equal(typeof runtime.host.confirmAction, "function");
  const focus = await runtime.adapter.readFocus({ lens: "pointer" });
  assert.equal(focus.targetId, "legacy-dom:customer-name");
  assert.equal(focus.pageVersion, 7);
});

test("runtime records a failed native probe without leaking its message", async () => {
  const runtime = await negotiateCoworkRuntime({
    native: {
      isAvailable: async () => {
        throw new Error("host secret should not cross the negotiation boundary");
      },
      readFocus: async () => ({})
    },
    legacy: legacyFixture()
  });

  assert.equal(runtime.mode, "legacy-host-companion");
  assert.deepEqual(runtime.diagnostics, [
    { layer: "native", code: "NATIVE_PROBE_FAILED" }
  ]);
  assert.doesNotMatch(JSON.stringify(runtime), /host secret/);
});

test("runtime fails closed with bounded diagnostics when every layer is unavailable", async () => {
  await assert.rejects(
    negotiateCoworkRuntime({
      native: { isAvailable: async () => true },
      webMcp: { tools: [], executeTool: async () => ({}) },
      legacy: { sessionId: "broken" }
    }),
    (error) =>
      error instanceof CoworkProtocolError &&
      error.code === "CAPABILITY_UNAVAILABLE" &&
      error.details?.diagnostics?.length === 3 &&
      error.details.diagnostics[0].code === "NATIVE_ADAPTER_INVALID" &&
      error.details.diagnostics[1].code === "NO_USABLE_CAPABILITIES" &&
      error.details.diagnostics[2].code === "LEGACY_HOST_REQUIRED"
  );
});
