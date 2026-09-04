// A local agent (Claude Code, Codex CLI, agy) calls a Cowork tool on the
// Desktop Companion; the page is where that tool actually runs. The Companion
// never reaches into the page, so the page pulls waiting calls the same way it
// pulls session deltas, runs them through the very callbacks the WebMCP
// registration uses, and reports the answer back.
const HANDLER_BY_TOOL = {
  cowork_read_focus: "readFocus",
  cowork_request_context: "requestContext",
  cowork_offer_action: "offerAction",
  cowork_read_presence: "readPresence",
  cowork_execute_solo: "executeSolo",
  cowork_read_changes: "readChanges",
  cowork_read_feedback: "readFeedback",
  cowork_read_turn: "readTurn",
  cowork_reply_turn: "replyTurn"
};

// The one argument default packages/native-webmcp applies before calling the
// page, repeated here so both routes hand the page identical input.
const NORMALIZE_ARGUMENTS = {
  cowork_reply_turn: (toolArguments) => ({
    ...toolArguments,
    offers: toolArguments.offers ?? []
  })
};

// Every offer says who proposed it, and only the caller knows who that is.
// The request carries the actor; the page's tool handlers read it while the
// call runs, so nothing had to be added to the nine tool schemas.
let activeActor = null;

/** The actor a tool handler is currently running for. Outside a relay call
 *  the tool was invoked in the page itself, which is what WebMCP is. */
export function currentActor() {
  return activeActor ?? "webmcp-agent";
}

/** Runs `propose` as `actor` - for the callers that are not a relayed tool
 *  call, like the panel's own demo button. Synchronous by design: the actor is
 *  a page-wide context, and an async body would hand it to whatever ran next. */
export function withActor(actor, propose) {
  const previous = activeActor;
  activeActor = actor;
  try {
    return propose();
  } finally {
    activeActor = previous;
  }
}

function actorForRequest(request) {
  if (typeof request.actor === "string" && request.actor !== "") return request.actor;
  const client = typeof request.clientName === "string" ? request.clientName.trim() : "";
  // A nameless client is still an MCP client - it reached the page through
  // the Companion, so saying "webmcp-agent" here would be a lie.
  return client === "" ? "mcp:unknown" : `mcp:${client}`;
}

export async function runCompanionAgentRequest({ request, handlers }) {
  const handler = handlers[HANDLER_BY_TOOL[request.name]];
  if (typeof handler !== "function") {
    return {
      error: {
        code: "UNKNOWN_TOOL",
        message: `${request.name} is not available on this page`
      }
    };
  }
  const toolArguments = request.arguments ?? {};
  activeActor = actorForRequest(request);
  try {
    return {
      result: await handler(
        (NORMALIZE_ARGUMENTS[request.name] ?? ((value) => value))(toolArguments)
      )
    };
  } catch (error) {
    // A refusal is an answer. Reporting it keeps the agent from waiting out
    // the Companion's timeout for a call the page already decided.
    return {
      error: {
        code: error?.code ?? "TOOL_FAILED",
        message: error?.message ?? "The Cowork tool failed on this page"
      }
    };
  } finally {
    activeActor = null;
  }
}

export function startCompanionAgentRelay({
  link,
  linkSessionId,
  handlers,
  intervalMilliseconds = 500,
  isActive = () => globalThis.document?.visibilityState === "visible",
  // The Companion is the session authority, and only this loop runs while the
  // page waits. Without pulling deltas here the page never learns that the
  // Companion minted a lease or that the model answered - the replica went
  // stale until the next visibility change.
  syncDeltas = async () => {},
  onError = () => {}
}) {
  let draining = false;
  async function drain() {
    if (draining || !isActive()) return;
    draining = true;
    try {
      const requests = await link.pullAgentRequests({ linkSessionId });
      for (const request of requests) {
        const settlement = await runCompanionAgentRequest({ request, handlers });
        await link.reportAgentResult({
          linkSessionId,
          requestId: request.requestId,
          ...settlement
        });
      }
      await syncDeltas();
    } catch (error) {
      onError(error);
    } finally {
      draining = false;
    }
  }
  const timer = setInterval(drain, intervalMilliseconds);
  timer.unref?.();
  return () => clearInterval(timer);
}

export function coworkAgentToolNames() {
  return Object.keys(HANDLER_BY_TOOL);
}
