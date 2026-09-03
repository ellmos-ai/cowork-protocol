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
  }
}

export function startCompanionAgentRelay({
  link,
  linkSessionId,
  handlers,
  intervalMilliseconds = 500,
  isActive = () => globalThis.document?.visibilityState === "visible",
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
