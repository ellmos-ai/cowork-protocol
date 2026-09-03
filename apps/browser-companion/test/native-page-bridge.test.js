import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("../native-page-bridge.js", import.meta.url),
  "utf8"
);

/**
 * The main-world bridge in a fake page: one window that delivers postMessage
 * to its own listeners, and a WebMCP model context that records registrations.
 */
function createPage({ pageTools = [] } = {}) {
  const listeners = new Set();
  const registered = [];
  const window = {
    addEventListener: (type, listener) => {
      if (type === "message") listeners.add(listener);
    },
    removeEventListener: (type, listener) => {
      if (type === "message") listeners.delete(listener);
    },
    postMessage(data) {
      const event = { source: window, data };
      for (const listener of [...listeners]) listener(event);
    }
  };
  const document = {
    modelContext: {
      getTools: async () => [...pageTools, ...registered],
      registerTool: async (tool, { signal }) => {
        registered.push(tool);
        signal.addEventListener("abort", () => {
          const index = registered.indexOf(tool);
          if (index >= 0) registered.splice(index, 1);
        });
      }
    }
  };
  const context = vm.createContext({
    globalThis: undefined,
    window,
    document,
    crypto,
    setTimeout,
    clearTimeout,
    console,
    AbortController,
    JSON,
    Date,
    Promise,
    Error,
    Object,
    Set,
    Array,
    Number,
    String,
    Boolean
  });
  context.globalThis = context;
  vm.runInContext(source, context);
  return {
    window,
    registered,
    removeModelContext: () => {
      document.modelContext = undefined;
    },
    toolFor: (name) => registered.find((tool) => tool.name === name)
  };
}

/** One request to the bridge over the same channel the isolated runtime uses. */
function bridgeRequest(window, method, argumentsValue = {}) {
  const requestId = `test-${Math.random()}`;
  return new Promise((resolve) => {
    window.addEventListener("message", function onMessage(event) {
      if (
        event.data?.source !== "cowork-extension-native-response" ||
        event.data?.requestId !== requestId
      ) {
        return;
      }
      window.removeEventListener("message", onMessage);
      resolve(event.data);
    });
    window.postMessage({
      source: "cowork-extension-native-request",
      protocolVersion: "0.1",
      requestId,
      method,
      arguments: argumentsValue
    });
  });
}

/** Stands in for the isolated extension runtime answering one companion call. */
function answerCompanion(window, reply) {
  window.addEventListener("message", function onMessage(event) {
    if (event.data?.source !== "cowork-page-client") return;
    window.removeEventListener("message", onMessage);
    window.postMessage({
      source: "cowork-browser-companion",
      protocolVersion: "0.1",
      requestId: event.data.requestId,
      ...reply(event.data)
    });
  });
}

test("registers the four Cowork tools on a page that has none", async () => {
  const page = createPage();
  const response = await bridgeRequest(page.window, "register-tools");
  assert.equal(response.ok, true);
  assert.equal(
    response.result.registered.join(","),
    "cowork_read_focus,cowork_request_context,cowork_offer_action,cowork_read_presence"
  );
  assert.equal(page.toolFor("cowork_offer_action").annotations.readOnlyHint, false);
  assert.equal(page.toolFor("cowork_read_focus").annotations.readOnlyHint, true);
});

test("never shadows a page that already speaks Cowork", async () => {
  const page = createPage({ pageTools: [{ name: "cowork_read_focus" }] });
  const response = await bridgeRequest(page.window, "register-tools");
  assert.equal(response.result.reason, "PAGE_OWNS_COWORK_TOOLS");
  assert.equal(response.result.registered.length, 0);
  assert.equal(page.registered.length, 0);
});

test("reports WebMCP as unavailable instead of throwing", async () => {
  const page = createPage();
  page.removeModelContext();
  const response = await bridgeRequest(page.window, "register-tools");
  assert.equal(response.ok, true);
  assert.equal(response.result.reason, "WEBMCP_UNAVAILABLE");
  assert.equal(response.result.registered.length, 0);
});

test("a registered tool relays to the isolated companion and returns its packet", async () => {
  const page = createPage();
  await bridgeRequest(page.window, "register-tools");
  answerCompanion(page.window, (request) => {
    assert.equal(request.method, "readFocus");
    assert.equal(request.arguments.lens, "pointer");
    return { ok: true, result: { targetId: "legacy-dom:id:title", pageVersion: 4 } };
  });
  const result = await page.toolFor("cowork_read_focus").execute({});
  assert.equal(result.structuredContent.targetId, "legacy-dom:id:title");
  assert.equal(JSON.parse(result.content[0].text).pageVersion, 4);
});

test("a companion refusal surfaces as a tool error, never as success", async () => {
  const page = createPage();
  await bridgeRequest(page.window, "register-tools");
  answerCompanion(page.window, () => ({
    ok: false,
    error: { code: "COMPANION_DISABLED" }
  }));
  await assert.rejects(
    () => page.toolFor("cowork_read_focus").execute({}),
    (error) => error.code === "COMPANION_DISABLED"
  );
});

test("an offer carries the focused page version and never executes", async () => {
  const page = createPage();
  await bridgeRequest(page.window, "register-tools");
  answerCompanion(page.window, () => ({
    ok: true,
    result: { targetId: "legacy-dom:id:title", pageVersion: 7 }
  }));
  await page.toolFor("cowork_read_focus").execute({});
  let offered = null;
  answerCompanion(page.window, (request) => {
    offered = request.arguments;
    return { ok: true, result: { offerId: offered.offerId, requiresHumanConfirmation: true } };
  });
  const result = await page.toolFor("cowork_offer_action").execute({
    capabilityId: "legacy.offer_value",
    targetId: "legacy-dom:id:title",
    value: "Cowork Everywhere",
    summary: "Use Cowork Everywhere as the project title"
  });
  assert.equal(offered.pageVersion, 7);
  assert.equal(offered.proposedArguments.value, "Cowork Everywhere");
  assert.equal(offered.effect, "write");
  assert.match(offered.offerId, /^webmcp-offer:/);
  assert.equal(result.structuredContent.requiresHumanConfirmation, true);
});

test("offering before a focus read is refused", async () => {
  const page = createPage();
  await bridgeRequest(page.window, "register-tools");
  await assert.rejects(
    () => page.toolFor("cowork_offer_action").execute({
      capabilityId: "legacy.offer_value",
      targetId: "legacy-dom:id:title",
      value: "x",
      summary: "y"
    }),
    (error) => error.code === "STALE_FOCUS"
  );
});

test("the visual lens stays behind the human's panel button", async () => {
  const page = createPage();
  await bridgeRequest(page.window, "register-tools");
  answerCompanion(page.window, () => ({ ok: true, result: { pageVersion: 1 } }));
  await page.toolFor("cowork_read_focus").execute({});
  for (const level of [1, 2]) {
    answerCompanion(page.window, (request) => {
      assert.equal(request.arguments.requestedLevel, level);
      return { ok: true, result: { level } };
    });
    await page.toolFor("cowork_request_context").execute({ reason: "Need more." });
  }
  await assert.rejects(
    () => page.toolFor("cowork_request_context").execute({ reason: "One more." }),
    (error) => error.code === "CONTEXT_LIMIT_REACHED"
  );
});

test("unregistering revokes the tools again", async () => {
  const page = createPage();
  await bridgeRequest(page.window, "register-tools");
  assert.equal(page.registered.length, 4);
  const response = await bridgeRequest(page.window, "unregister-tools");
  assert.equal(response.result.registered.length, 0);
  assert.equal(page.registered.length, 0);
});
