import assert from "node:assert/strict";
import test from "node:test";

import { validateNativeWebMcpObservation } from "../webmcp-browser-smoke-lib.mjs";

const expectedTools = [
  "cowork_execute_solo",
  "cowork_offer_action",
  "cowork_read_changes",
  "cowork_read_feedback",
  "cowork_read_focus",
  "cowork_read_presence",
  "cowork_request_context"
];

function validObservation() {
  return {
    browserVersion: "Chrome/152.0.7977.64",
    secureContext: true,
    modelContextAvailable: true,
    methods: {
      registerTool: "function",
      getTools: "function",
      executeTool: "function"
    },
    badge: "Native WebMCP",
    toolNames: expectedTools,
    focusExecution: {
      argumentKind: "json-string",
      packet: {
        type: "focus",
        targetId: "form-field:full-name",
        pageVersion: 1,
        metrics: { contextCharacters: 9 }
      }
    },
    contextExecution: {
      argumentKind: "json-string",
      packet: {
        type: "context-expansion",
        targetId: "form-field:full-name",
        pageVersion: 1,
        currentLevel: 2,
        level: 3,
        oneShot: true,
        metrics: {
          sourceContextCharacters: 110,
          includedContextCharacters: 110
        }
      }
    }
  };
}

test("native WebMCP browser evidence requires all seven real tools and bounded read-only execution", () => {
  const summary = validateNativeWebMcpObservation(validObservation());

  assert.deepEqual(summary, {
    browserClaim: true,
    agentClientClaim: false,
    browserVersion: "Chrome/152.0.7977.64",
    discoveredTools: 7,
    focusContextCharacters: 9,
    expandedContextCharacters: 110,
    executeArgumentKinds: ["json-string", "json-string"]
  });
});

test("native WebMCP browser evidence rejects a partial catalog", () => {
  const observed = validObservation();
  observed.toolNames = observed.toolNames.slice(1);

  assert.throws(
    () => validateNativeWebMcpObservation(observed),
    /Expected exactly the seven Cowork tools/
  );
});

test("native WebMCP browser evidence rejects an unbounded or reusable context expansion", () => {
  const observed = validObservation();
  observed.contextExecution.packet.oneShot = false;
  observed.contextExecution.packet.metrics.includedContextCharacters = 1201;

  assert.throws(
    () => validateNativeWebMcpObservation(observed),
    /one-shot context expansion must stay within 1,200 adapter characters/
  );
});
