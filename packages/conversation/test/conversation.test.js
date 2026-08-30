import assert from "node:assert/strict";
import test from "node:test";

import {
  ConversationProtocolError,
  createConversationClient,
  createConversationInbox,
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

test("the WebMCP inbox exposes only the latest bounded human turn", () => {
  const inbox = createConversationInbox({
    createTurnId: (sequence) => `turn-${sequence}`
  });
  const first = createConversationTurn({
    transcript: "Explain this field",
    focusPacket,
    presence: activePresence
  });
  const second = createConversationTurn({
    transcript: "Fill it with my name",
    focusPacket,
    presence: activePresence
  });

  assert.equal(inbox.publish(first).turnId, "turn-1");
  assert.equal(inbox.publish(second).turnId, "turn-2");

  assert.deepEqual(inbox.read(), {
    type: "conversation-inbox",
    protocolVersion: "0.1",
    latest: {
      turnId: "turn-2",
      turn: second
    },
    totalCount: 2,
    omittedCount: 1
  });
});

test("a WebMCP reply must match the pending turn and remains an unexecuted offer", () => {
  const inbox = createConversationInbox({
    createTurnId: (sequence) => `turn-${sequence}`
  });
  const turn = createConversationTurn({
    transcript: "Fill it with my name",
    focusPacket,
    presence: activePresence
  });
  const published = inbox.publish(turn);

  assert.throws(
    () =>
      inbox.respond({
        turnId: "turn-stale",
        message: "Stale reply",
        offers: []
      }),
    (error) =>
      error instanceof ConversationProtocolError &&
      error.code === "STALE_CONVERSATION_TURN"
  );

  const response = inbox.respond({
    turnId: published.turnId,
    message: "I can fill the field. Click the offer to approve.",
    speak: "I have one suggestion.",
    offers: [
      {
        capabilityId: "form.set_value",
        targetId: "form-field:full-name",
        value: "Ada Byron",
        summary: "Set Full name to Ada Byron"
      }
    ]
  });

  assert.equal(response.type, "conversation-reply");
  assert.equal(response.turnId, "turn-1");
  assert.equal(response.requiresHumanConfirmation, true);
  assert.equal(response.reply.offers[0].value, "Ada Byron");
  assert.equal(Object.hasOwn(response, "executed"), false);
  assert.deepEqual(inbox.read(), {
    type: "conversation-inbox",
    protocolVersion: "0.1",
    latest: null,
    totalCount: 1,
    omittedCount: 0
  });
  assert.throws(
    () => inbox.respond({ turnId: published.turnId, message: "Replay", offers: [] }),
    (error) =>
      error instanceof ConversationProtocolError &&
      error.code === "STALE_CONVERSATION_TURN"
  );
});

test("the inbox rejects a reused turn id so an old agent reply cannot match a new turn", () => {
  const inbox = createConversationInbox({ createTurnId: () => "turn-reused" });
  const turn = createConversationTurn({
    transcript: "First request",
    focusPacket,
    presence: activePresence
  });
  inbox.publish(turn);

  assert.throws(
    () =>
      inbox.publish(
        createConversationTurn({
          transcript: "Second request",
          focusPacket,
          presence: activePresence
        })
      ),
    (error) =>
      error instanceof ConversationProtocolError &&
      error.code === "DUPLICATE_CONVERSATION_TURN"
  );
  assert.equal(inbox.read().latest.turn.transcript, "First request");
  assert.equal(inbox.read().totalCount, 1);
});
