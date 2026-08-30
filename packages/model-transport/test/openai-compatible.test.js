import assert from "node:assert/strict";
import test from "node:test";

import {
  ModelGatewayError,
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

test("the compatible gateway keeps credentials server-side and returns a bounded reply", async () => {
  let request;
  const sender = createOpenAiCompatibleTurnSender({
    endpoint: "https://models.example.test/v1/chat/completions",
    model: "preferred-model",
    apiKey: "server-only-key",
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
  assert.equal(body.max_tokens, 500);
  assert.deepEqual(body.response_format, { type: "json_object" });
  assert.deepEqual(JSON.parse(body.messages[1].content), turn);
  assert.equal(JSON.stringify(reply).includes("server-only-key"), false);
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
