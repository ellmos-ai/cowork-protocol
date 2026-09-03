import assert from "node:assert/strict";
import test from "node:test";

import {
  ModelGatewayError,
  createOpenAiCompatibleGatewaySender,
  createOpenAiCompatibleTurnSender
} from "../src/openai-compatible.js";

const turn = {
  type: "conversation-turn",
  protocolVersion: "0.1",
  transcript: "Suggest a name",
  focus: {
    targetId: "form-field:full-name",
    pageVersion: 1,
    kind: "pointer",
    label: "Full name",
    selectedText: "",
    capabilityIds: ["form.set_value"]
  },
  presence: {
    humanPresence: "present",
    agentPresence: "active",
    mode: "cowork"
  },
  metrics: {
    sourceTranscriptCharacters: 14,
    includedTranscriptCharacters: 14,
    omittedTranscriptCharacters: 0
  }
};

const gatewayTurn = {
  protocolVersion: "0.1",
  type: "model-gateway-turn",
  sessionId: "session-1",
  turnId: "turn-1",
  sourceSurfaceId: "desktop:session-1",
  modelSeat: {
    leaseId: "seat-1",
    owner: "cowork-companion",
    providerId: "preferred-model",
    expiresAt: "2026-09-01T12:00:00.000Z"
  },
  session: {
    revision: 4,
    humanPresence: "present",
    agentPresence: "active",
    effectiveMode: "cowork",
    primarySurfaceId: "desktop:session-1",
    surfaceKind: "desktop",
    focus: null,
    workMode: "cowork",
    authority: "human",
    lease: null
  },
  context: {
    type: "model-context",
    protocolVersion: "0.1",
    sessionId: "session-1",
    recentTurns: [],
    compactSummary: "Continue the shared form task.",
    metrics: { serializedCharacters: 160 }
  },
  input: { transcript: "What should we do next?" }
};

test("the compatible gateway keeps credentials server-side and returns a bounded reply", async () => {
  let request;
  const sender = createOpenAiCompatibleTurnSender({
    endpoint: "https://models.example.test/v1/chat/completions",
    model: "preferred-model",
    apiKey: "server-only-key",
    reasoningEffort: "none",
    maxTokens: 200,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return Response.json({
        choices: [{
          message: {
            content: JSON.stringify({
              message: "I can suggest Ada Byron.",
              speak: "I have a suggestion.",
              offers: [{
                capabilityId: "form.set_value",
                targetId: "form-field:full-name",
                value: "Ada Byron",
                summary: "Set Full name to Ada Byron"
              }]
            })
          }
        }]
      });
    }
  });

  const reply = await sender(turn);
  assert.equal(reply.message, "I can suggest Ada Byron.");
  assert.equal(reply.offers[0].value, "Ada Byron");
  assert.equal(request.url, "https://models.example.test/v1/chat/completions");
  assert.equal(request.options.headers.Authorization, "Bearer server-only-key");
  const body = JSON.parse(request.options.body);
  assert.equal(body.model, "preferred-model");
  assert.equal(body.max_tokens, 200);
  assert.equal(body.reasoning_effort, "none");
  assert.deepEqual(body.response_format, { type: "json_object" });
  assert.deepEqual(JSON.parse(body.messages[1].content), turn);
  assert.equal(JSON.stringify(reply).includes("server-only-key"), false);
});

test("the Companion sender accepts the real bounded Model Gateway packet", async () => {
  let body;
  const sender = createOpenAiCompatibleGatewaySender({
    endpoint: "https://models.example.test/v1/chat/completions",
    model: "preferred-model",
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return Response.json({
        choices: [{ message: { content: JSON.stringify({ message: "Continue with email." }) } }]
      });
    }
  });

  assert.equal((await sender(gatewayTurn)).message, "Continue with email.");
  assert.deepEqual(JSON.parse(body.messages[1].content), gatewayTurn);

  await assert.rejects(
    sender({
      ...gatewayTurn,
      input: { transcript: "Continue", pageHtml: "must not cross" }
    }),
    (error) => error instanceof ModelGatewayError &&
      error.code === "INVALID_MODEL_GATEWAY_TURN"
  );
});

test("the gateway rejects an unsupported reasoning level before any provider call", () => {
  assert.throws(
    () =>
      createOpenAiCompatibleTurnSender({
        endpoint: "https://models.example.test/v1/chat/completions",
        model: "preferred-model",
        reasoningEffort: "unbounded"
      }),
    /reasoningEffort/
  );
});

test("the gateway rejects an answer budget outside the bounded range", () => {
  for (const maxTokens of [63, 2001, 2.5]) {
    assert.throws(
      () =>
        createOpenAiCompatibleTurnSender({
          endpoint: "https://models.example.test/v1/chat/completions",
          model: "preferred-model",
          maxTokens
        }),
      /maxTokens/
    );
  }
});

test("a malformed upstream reply fails closed without copying provider diagnostics", async () => {
  const sender = createOpenAiCompatibleTurnSender({
    endpoint: "https://models.example.test/v1/chat/completions",
    model: "preferred-model",
    fetchImpl: async () => new Response("provider stack trace", { status: 500 })
  });

  await assert.rejects(
    () => sender(turn),
    (error) =>
      error instanceof ModelGatewayError &&
      error.code === "MODEL_GATEWAY_FAILED" &&
      !error.message.includes("provider stack trace")
  );
});

// Measured against Ollama qwen3.8:27b-mlx on 2026-09-04: the Companion's real
// gateway packet came back with finish_reason "length", 2,136 characters of
// reasoning and an empty content field. That is what these fakes reproduce.
function thinkingModel({ replies }) {
  const sent = [];
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    sent.push(body);
    return Response.json(replies[sent.length - 1] ?? replies.at(-1));
  };
  return { sent, fetchImpl };
}

const BUDGET_SPENT_THINKING = {
  choices: [{
    finish_reason: "length",
    message: { content: "", reasoning: "Let me weigh the options. ".repeat(80) }
  }]
};

test("a model that spends its budget thinking is retried once without thinking", async () => {
  const notices = [];
  const { sent, fetchImpl } = thinkingModel({
    replies: [
      BUDGET_SPENT_THINKING,
      {
        choices: [{
          finish_reason: "stop",
          message: { content: JSON.stringify({ message: "I can fill the email field." }) }
        }]
      }
    ]
  });
  const sender = createOpenAiCompatibleGatewaySender({
    endpoint: "https://models.example.test/v1/chat/completions",
    model: "reasoning-model",
    fetchImpl,
    onNotice: (notice) => notices.push(notice)
  });

  assert.equal((await sender(gatewayTurn)).message, "I can fill the email field.");
  assert.equal(sent.length, 2);
  assert.equal(sent[0].reasoning_effort, undefined);
  assert.equal(sent[1].reasoning_effort, "none");
  assert.equal(notices.length, 1);
  assert.equal(notices[0].code, "MODEL_THOUGHT_PAST_ITS_BUDGET");
});

test("an exhausted answer budget is named, never folded into a generic failure", async () => {
  const { sent, fetchImpl } = thinkingModel({ replies: [BUDGET_SPENT_THINKING] });
  const sender = createOpenAiCompatibleGatewaySender({
    endpoint: "https://models.example.test/v1/chat/completions",
    model: "reasoning-model",
    // An explicit level is the operator's decision and is never downgraded.
    reasoningEffort: "high",
    fetchImpl
  });

  await assert.rejects(
    () => sender(gatewayTurn),
    (error) =>
      error.code === "MODEL_THOUGHT_PAST_ITS_BUDGET" &&
      /COWORK_MODEL_REASONING_EFFORT|COWORK_MODEL_MAX_TOKENS/.test(error.message)
  );
  assert.equal(sent.length, 1, "an explicit reasoning level is not retried away");
  assert.equal(sent[0].reasoning_effort, "high");
});

test("a fenced JSON reply is accepted and prose is refused with its own code", async () => {
  const fenced = createOpenAiCompatibleTurnSender({
    endpoint: "https://models.example.test/v1/chat/completions",
    model: "preferred-model",
    fetchImpl: async () =>
      Response.json({
        choices: [{
          message: {
            content: "```json\n{\"message\": \"Ada Byron fits the field.\"}\n```"
          }
        }]
      })
  });
  assert.equal((await fenced(turn)).message, "Ada Byron fits the field.");

  const prose = createOpenAiCompatibleTurnSender({
    endpoint: "https://models.example.test/v1/chat/completions",
    model: "preferred-model",
    fetchImpl: async () =>
      Response.json({ choices: [{ message: { content: "Sure, I can help with that." } }] })
  });
  await assert.rejects(() => prose(turn), (error) => error.code === "MODEL_REPLY_NOT_JSON");

  const offSchema = createOpenAiCompatibleTurnSender({
    endpoint: "https://models.example.test/v1/chat/completions",
    model: "preferred-model",
    fetchImpl: async () =>
      Response.json({ choices: [{ message: { content: JSON.stringify({ reply: "no message key" }) } }] })
  });
  await assert.rejects(() => offSchema(turn), (error) => error.code === "MODEL_REPLY_REJECTED");
});
