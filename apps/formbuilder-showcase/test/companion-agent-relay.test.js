import assert from "node:assert/strict";
import test from "node:test";

import { coworkToolDefinitions } from "../../../packages/native-webmcp/src/index.js";
import {
  coworkAgentToolNames,
  currentActor,
  runCompanionAgentRequest,
  startCompanionAgentRelay,
  withActor
} from "../src/companion-agent-relay.js";

test("the relay serves exactly the tools the page registers over WebMCP", async () => {
  // A local agent and a browser agent must reach the same page callbacks; a
  // relay that knows a different set is a silent capability gap.
  assert.deepEqual(
    coworkAgentToolNames(),
    (await coworkToolDefinitions()).map(({ name }) => name)
  );
});

test("a relayed call runs the page callback and returns its packet", async () => {
  const seen = [];
  const settlement = await runCompanionAgentRequest({
    request: {
      requestId: "r-1",
      name: "cowork_offer_action",
      arguments: {
        capabilityId: "form.setValue",
        targetId: "form-field:name",
        value: "Ada",
        summary: "Fill the name"
      }
    },
    handlers: {
      offerAction: (input) => {
        seen.push(input);
        return { offerId: "offer-1", state: "offered" };
      }
    }
  });

  assert.deepEqual(settlement, { result: { offerId: "offer-1", state: "offered" } });
  assert.equal(seen[0].value, "Ada");
});

test("a relayed reply turn gets the same offers default as the WebMCP route", async () => {
  const settlement = await runCompanionAgentRequest({
    request: {
      requestId: "r-2",
      name: "cowork_reply_turn",
      arguments: { turnId: "turn-1", message: "On it" }
    },
    handlers: { replyTurn: (input) => input }
  });

  assert.deepEqual(settlement.result.offers, []);
});

test("a refusal by the page becomes a coded error, not a result", async () => {
  const settlement = await runCompanionAgentRequest({
    request: { requestId: "r-3", name: "cowork_read_focus", arguments: {} },
    handlers: {
      readFocus() {
        const error = new Error("No FormBuilder field is focused");
        error.code = "STALE_FOCUS";
        throw error;
      }
    }
  });

  assert.equal(settlement.result, undefined);
  assert.deepEqual(settlement.error, {
    code: "STALE_FOCUS",
    message: "No FormBuilder field is focused"
  });
});

test("a tool this page does not provide is refused instead of hanging", async () => {
  const settlement = await runCompanionAgentRequest({
    request: { requestId: "r-4", name: "cowork_execute_solo", arguments: {} },
    handlers: {}
  });

  assert.equal(settlement.error.code, "UNKNOWN_TOOL");
});

test("the relay drains pulled calls and reports each answer once", async () => {
  const pulled = [[
    { requestId: "r-1", name: "cowork_read_focus", arguments: {} },
    { requestId: "r-2", name: "cowork_read_presence", arguments: {} }
  ]];
  const reported = [];
  const link = {
    pullAgentRequests: async () => pulled.shift() ?? [],
    reportAgentResult: async (entry) => {
      reported.push(entry);
    }
  };

  const stop = startCompanionAgentRelay({
    link,
    linkSessionId: "link-1",
    handlers: {
      readFocus: () => ({ type: "focus-packet" }),
      readPresence: () => ({ type: "presence-event" })
    },
    intervalMilliseconds: 10,
    isActive: () => true
  });
  for (let attempt = 0; attempt < 100 && reported.length < 2; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  stop();

  assert.equal(reported.length, 2);
  assert.deepEqual(reported[0], {
    linkSessionId: "link-1",
    requestId: "r-1",
    result: { type: "focus-packet" }
  });
  assert.equal(reported[1].requestId, "r-2");
});

test("the relay stays quiet while the page is not the active surface", async () => {
  let pulls = 0;
  const stop = startCompanionAgentRelay({
    link: {
      pullAgentRequests: async () => {
        pulls += 1;
        return [];
      },
      reportAgentResult: async () => {}
    },
    linkSessionId: "link-1",
    handlers: {},
    intervalMilliseconds: 5,
    isActive: () => false
  });
  await new Promise((resolve) => setTimeout(resolve, 40));
  stop();

  assert.equal(pulls, 0);
});

test("a link failure is surfaced, and the relay keeps polling", async () => {
  const errors = [];
  let pulls = 0;
  const stop = startCompanionAgentRelay({
    link: {
      pullAgentRequests: async () => {
        pulls += 1;
        throw new Error("COMPANION_UNAVAILABLE");
      },
      reportAgentResult: async () => {}
    },
    linkSessionId: "link-1",
    handlers: {},
    intervalMilliseconds: 5,
    isActive: () => true,
    onError: (error) => errors.push(error.message)
  });
  for (let attempt = 0; attempt < 60 && pulls < 2; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  stop();

  assert.ok(pulls >= 2);
  assert.equal(errors[0], "COMPANION_UNAVAILABLE");
});

test("the caller is named while its call runs, and only while it runs", async () => {
  // Every offer carries its author. The author is known only here, at the
  // moment the call arrives - the nine tool schemas never learned a new field.
  const seenActors = [];
  const handlers = { offerAction: () => (seenActors.push(currentActor()), { offerId: "o" }) };
  const call = (request) => runCompanionAgentRequest({ request, handlers });

  await call({ name: "cowork_offer_action", actor: "seat:qwen3.8:27b-mlx" });
  await call({ name: "cowork_offer_action", clientName: "cc" });
  await call({ name: "cowork_offer_action" });

  assert.deepEqual(seenActors, ["seat:qwen3.8:27b-mlx", "mcp:cc", "mcp:unknown"]);
  // Outside a relayed call the page itself is the caller - that is WebMCP.
  assert.equal(currentActor(), "webmcp-agent");
});

test("a failed call still hands the actor context back", async () => {
  await runCompanionAgentRequest({
    request: { name: "cowork_offer_action", clientName: "cc" },
    handlers: {
      offerAction: () => {
        throw new Error("the page refused");
      }
    }
  });
  assert.equal(currentActor(), "webmcp-agent");
});

test("a caller that is not a relayed call can name itself, and only for its own call", () => {
  // The panel's own demo button is a script helper. Calling it webmcp-agent
  // would be exactly the lie attribution is here to prevent.
  assert.equal(withActor("demo", () => currentActor()), "demo");
  assert.equal(currentActor(), "webmcp-agent");
  assert.throws(() => withActor("demo", () => {
    throw new Error("the offer was refused");
  }));
  assert.equal(currentActor(), "webmcp-agent");
});
