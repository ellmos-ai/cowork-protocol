import assert from "node:assert/strict";
import test from "node:test";

import {
  ConversationProtocolError,
  createConversationClient,
  createConversationTurn,
  normalizeConversationReply
} from "../src/index.js";

const focusPacket = {
  type: "focus-packet",
  sessionId: "formbuilder-showcase",
  pageVersion: 3,
  targetId: "form-field:full-name",
  focus: {
    kind: "pointer",
    label: "Full name",
    selectedText: ""
  },
  capabilityIds: ["form.set_value", "form.explain_field"],
  metrics: {
    sourceCharacters: 9,
    includedCharacters: 9
  }
};

const activePresence = {
  humanPresence: "present",
  agentPresence: "active",
  mode: "cowork"
};

test("silence creates no conversation turn and never calls the model transport", async () => {
  let calls = 0;
  const client = createConversationClient({
    sendTurn: async () => {
      calls += 1;
      return { message: "This must not be reached." };
    }
  });

  const result = await client.submit({
    transcript: " \n\t ",
    focusPacket,
    presence: activePresence
  });

  assert.deepEqual(result, { sent: false, status: "silence" });
  assert.equal(calls, 0);
});

test("pausing the agent prevents a spoken or typed turn from reaching the transport", async () => {
  let calls = 0;
  const client = createConversationClient({
    sendTurn: async () => {
      calls += 1;
      return { message: "This must not be reached." };
    }
  });

  const result = await client.submit({
    transcript: "Please help with this field",
    focusPacket,
    presence: { ...activePresence, agentPresence: "paused", mode: "human-solo" }
  });

  assert.deepEqual(result, { sent: false, status: "agent-paused" });
  assert.equal(calls, 0);
});

test("a model receives only a bounded utterance, compact focus and presence", async () => {
  const source = "x".repeat(400);
  const packet = createConversationTurn({
    transcript: source,
    focusPacket,
    presence: activePresence
  });

  assert.equal(packet.type, "conversation-turn");
  assert.equal(packet.protocolVersion, "0.1");
  assert.equal(packet.transcript.length, 350);
  assert.deepEqual(packet.metrics, {
    sourceTranscriptCharacters: 400,
    includedTranscriptCharacters: 350,
    omittedTranscriptCharacters: 50
  });
  assert.deepEqual(packet.focus, {
    targetId: "form-field:full-name",
    pageVersion: 3,
    kind: "pointer",
    label: "Full name",
    selectedText: "",
    capabilityIds: ["form.set_value", "form.explain_field"]
  });
  assert.deepEqual(packet.presence, activePresence);
  assert.equal(Object.hasOwn(packet, "pageHtml"), false);
  assert.ok(JSON.stringify(packet).length <= 1200);
});

test("the client returns a bounded reply without executing its visible offers", async () => {
  const client = createConversationClient({
    sendTurn: async () => ({
      message: "I can fill the focused field. Click the offer if that is what you want.",
      speak: "I have a suggestion.",
      offers: [
        {
          capabilityId: "form.set_value",
          targetId: "form-field:full-name",
          value: "Lukas",
          summary: "Set Full name to Lukas"
        }
      ]
    })
  });

  const result = await client.submit({
    transcript: "Please help with this field",
    focusPacket,
    presence: activePresence
  });

  assert.equal(result.sent, true);
  assert.equal(result.status, "replied");
  assert.equal(result.reply.message, "I can fill the focused field. Click the offer if that is what you want.");
  assert.equal(result.reply.speak, "I have a suggestion.");
  assert.deepEqual(result.reply.offers, [
    {
      capabilityId: "form.set_value",
      targetId: "form-field:full-name",
      value: "Lukas",
      summary: "Set Full name to Lukas"
    }
  ]);
  assert.equal(Object.hasOwn(result.reply, "executed"), false);
});

test("an overlong proposed value is rejected instead of being silently changed", () => {
  assert.throws(
    () =>
      normalizeConversationReply({
        message: "I have a suggestion.",
        offers: [
          {
            capabilityId: "form.set_value",
            targetId: "form-field:full-name",
            value: "x".repeat(351),
            summary: "Set the field"
          }
        ]
      }),
    (error) =>
      error instanceof ConversationProtocolError && error.code === "REPLY_VALUE_TOO_LONG"
  );
});
