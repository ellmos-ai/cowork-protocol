import assert from "node:assert/strict";
import test from "node:test";

import {
  createWebMcpBridge,
  negotiateWebMcpCatalog
} from "../src/index.js";
import { CoworkProtocolError } from "../../core/src/index.js";

const hostTools = [
  {
    name: "calendar_read_slots",
    description: "Read open appointment slots without changing the calendar.",
    inputSchema: {
      type: "object",
      properties: { date: { type: "string" } },
      required: ["date"]
    },
    annotations: { readOnlyHint: true }
  },
  {
    name: "calendar_book_slot",
    description: "Book the chosen appointment slot.",
    inputSchema: {
      type: "object",
      properties: {
        slotId: { type: "string" },
        attendee: { type: "string" }
      },
      required: ["slotId", "attendee"]
    },
    annotations: { readOnlyHint: false, destructiveHint: false }
  }
];

test("a host-supplied WebMCP catalog becomes a bounded capability summary", () => {
  const catalog = negotiateWebMcpCatalog({ tools: hostTools });

  assert.equal(catalog.mode, "webmcp-bridge");
  assert.equal(catalog.discovery, "host-supplied");
  assert.deepEqual(
    catalog.capabilities.map(({ hostToolName, access }) => ({ hostToolName, access })),
    [
      { hostToolName: "calendar_read_slots", access: "read-execute" },
      { hostToolName: "calendar_book_slot", access: "offer-only" }
    ]
  );
  assert.deepEqual(catalog.capabilities[1].parameterNames, ["slotId", "attendee"]);
  assert.ok(JSON.stringify(catalog.capabilities[1]).length <= 350);
});

test("missing schemas fail closed instead of becoming bridge capabilities", () => {
  const catalog = negotiateWebMcpCatalog({
    tools: [{ name: "mystery", description: "Unknown effect" }]
  });

  assert.equal(catalog.capabilities.length, 0);
  assert.deepEqual(catalog.rejected, [
    { hostToolName: "mystery", reason: "INPUT_SCHEMA_REQUIRED" }
  ]);
});

test("blank tool names and non-object schemas fail closed", () => {
  const catalog = negotiateWebMcpCatalog({
    tools: [
      { name: "   ", inputSchema: { type: "object" } },
      { name: "array_schema", inputSchema: [] }
    ]
  });

  assert.deepEqual(catalog.capabilities, []);
  assert.deepEqual(catalog.rejected, [
    { hostToolName: "   ", reason: "INVALID_TOOL_NAME" },
    { hostToolName: "array_schema", reason: "INPUT_SCHEMA_REQUIRED" }
  ]);
});

test("duplicate host tool names make every ambiguous capability unavailable", async () => {
  let called = false;
  const duplicateTools = [
    hostTools[0],
    {
      ...hostTools[0],
      description: "A conflicting host declaration.",
      annotations: { readOnlyHint: false }
    }
  ];
  const bridge = createWebMcpBridge({
    tools: duplicateTools,
    executeTool: async () => {
      called = true;
    }
  });

  assert.deepEqual(bridge.catalog.capabilities, []);
  assert.deepEqual(bridge.catalog.rejected, [
    { hostToolName: "calendar_read_slots", reason: "DUPLICATE_TOOL_NAME" }
  ]);
  await assert.rejects(
    bridge.executeRead({
      capabilityId: "webmcp:calendar_read_slots",
      arguments: { date: "2026-09-01" }
    }),
    (error) =>
      error instanceof CoworkProtocolError &&
      error.code === "CAPABILITY_UNAVAILABLE"
  );
  assert.equal(called, false);
});

test("the bridge executes read-only tools but rejects mutations", async () => {
  const calls = [];
  const bridge = createWebMcpBridge({
    tools: hostTools,
    executeTool: async (request) => {
      calls.push(request);
      return { slots: ["09:00"] };
    }
  });

  const result = await bridge.executeRead({
    capabilityId: "webmcp:calendar_read_slots",
    arguments: { date: "2026-09-01" }
  });
  assert.deepEqual(result, { slots: ["09:00"] });
  assert.deepEqual(calls, [
    { name: "calendar_read_slots", arguments: { date: "2026-09-01" } }
  ]);

  await assert.rejects(
    bridge.executeRead({
      capabilityId: "webmcp:calendar_book_slot",
      arguments: { slotId: "09:00", attendee: "Lukas" }
    }),
    (error) =>
      error instanceof CoworkProtocolError &&
      error.code === "HUMAN_CONFIRMATION_REQUIRED"
  );
});

test("small host read results cross the boundary as normalized JSON values", async () => {
  class HostResult {
    constructor() {
      this.slots = ["09:00"];
      this.hostOnly = undefined;
    }
  }
  const bridge = createWebMcpBridge({
    tools: hostTools,
    executeTool: async () => new HostResult()
  });

  const result = await bridge.executeRead({
    capabilityId: "webmcp:calendar_read_slots",
    arguments: { date: "2026-09-01" }
  });

  assert.deepEqual(result, { slots: ["09:00"] });
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
});

test("large host read results become an explicit 1200-character preview", async () => {
  const hostResult = { records: ["x".repeat(5000)] };
  const bridge = createWebMcpBridge({
    tools: hostTools,
    executeTool: async () => hostResult
  });

  const result = await bridge.executeRead({
    capabilityId: "webmcp:calendar_read_slots",
    arguments: { date: "2026-09-01" }
  });

  assert.equal(result.protocolVersion, "0.1");
  assert.equal(result.type, "bridge-read-preview");
  assert.equal(result.capabilityId, "webmcp:calendar_read_slots");
  assert.equal(result.preview.length, 1200);
  assert.equal(result.preview.at(-1), "…");
  assert.deepEqual(result.metrics, {
    sourceCharacters: JSON.stringify(hostResult).length,
    includedCharacters: 1200,
    truncated: true
  });
  assert.equal(Object.hasOwn(result, "result"), false);
});

test("bridge previews never end with half of a Unicode surrogate pair", async () => {
  const bridge = createWebMcpBridge({
    tools: hostTools,
    executeTool: async () => ({ value: `${"x".repeat(1188)}😀z` })
  });

  const result = await bridge.executeRead({
    capabilityId: "webmcp:calendar_read_slots",
    arguments: { date: "2026-09-01" }
  });

  assert.equal(result.preview, `{"value":"${"x".repeat(1188)}…`);
  assert.equal(result.metrics.includedCharacters, 1199);
});

test("unserializable host results fail closed before reaching the agent", async () => {
  const circular = {};
  circular.self = circular;
  const bridge = createWebMcpBridge({
    tools: hostTools,
    executeTool: async () => circular
  });

  await assert.rejects(
    bridge.executeRead({
      capabilityId: "webmcp:calendar_read_slots",
      arguments: { date: "2026-09-01" }
    }),
    (error) =>
      error instanceof CoworkProtocolError &&
      error.code === "INVALID_BRIDGE_RESULT"
  );
});

test("the bridge checks required arguments before calling the host", async () => {
  let called = false;
  const bridge = createWebMcpBridge({
    tools: hostTools,
    executeTool: async () => {
      called = true;
    }
  });

  await assert.rejects(
    bridge.executeRead({
      capabilityId: "webmcp:calendar_read_slots",
      arguments: {}
    }),
    (error) =>
      error instanceof CoworkProtocolError &&
      error.code === "INVALID_TOOL_ARGUMENTS" &&
      error.details?.missing?.[0] === "date"
  );
  assert.equal(called, false);
});

test("long host descriptions are capped without losing the tool identity", () => {
  const catalog = negotiateWebMcpCatalog({
    tools: [{
      name: "read_long_record",
      description: "x".repeat(500),
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true }
    }]
  });

  assert.equal(catalog.capabilities[0].description.length, 160);
  assert.equal(catalog.capabilities[0].hostToolName, "read_long_record");
  assert.ok(JSON.stringify(catalog.capabilities[0]).length <= 350);
});

test("every bridge capability summary stays within 350 characters", () => {
  const properties = Object.fromEntries(
    Array.from({ length: 12 }, (_, index) => [
      `parameter_${index}_${"x".repeat(500)}`,
      { type: "string" }
    ])
  );
  const catalog = negotiateWebMcpCatalog({
    tools: [{
      name: "n".repeat(64),
      description: "d".repeat(500),
      inputSchema: { type: "object", properties },
      annotations: { readOnlyHint: true }
    }]
  });

  assert.ok(JSON.stringify(catalog.capabilities[0]).length <= 350);
  assert.ok(catalog.capabilities[0].parameterNames.length <= 12);
});

test("non-JSON host read values fail with the protocol error type", async () => {
  const bridge = createWebMcpBridge({
    tools: hostTools,
    executeTool: async () => undefined
  });

  await assert.rejects(
    bridge.executeRead({
      capabilityId: "webmcp:calendar_read_slots",
      arguments: { date: "2026-09-01" }
    }),
    (error) =>
      error instanceof CoworkProtocolError &&
      error.code === "INVALID_BRIDGE_RESULT"
  );
});
