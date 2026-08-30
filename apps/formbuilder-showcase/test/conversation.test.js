import assert from "node:assert/strict";
import test from "node:test";

import { createConversationClient } from "../../../packages/conversation/src/index.js";
import { replyToShowcaseTurn } from "../src/local-conversation.js";

test("the local showcase helper turns a focused request into one click-gated offer", async () => {
  const client = createConversationClient({ sendTurn: replyToShowcaseTurn });

  const result = await client.submit({
    transcript: "Can you fill this for me?",
    focusPacket: {
      type: "focus-packet",
      sessionId: "formbuilder-showcase",
      pageVersion: 7,
      targetId: "form-field:email",
      focus: { kind: "pointer", label: "Email", selectedText: "" },
      capabilityIds: ["form.set_value", "form.explain_field"]
    },
    presence: {
      humanPresence: "present",
      agentPresence: "active",
      mode: "cowork"
    }
  });

  assert.equal(result.sent, true);
  assert.match(result.reply.message, /click/i);
  assert.deepEqual(result.reply.offers, [
    {
      capabilityId: "form.set_value",
      targetId: "form-field:email",
      value: "lukas@example.com",
      summary: "Set Email to lukas@example.com"
    }
  ]);
});

test("the local showcase helper asks for focus rather than inventing page context", async () => {
  const reply = await replyToShowcaseTurn({
    type: "conversation-turn",
    protocolVersion: "0.1",
    transcript: "What should I do next?",
    focus: null,
    presence: { humanPresence: "present", agentPresence: "active", mode: "cowork" },
    metrics: {
      sourceTranscriptCharacters: 22,
      includedTranscriptCharacters: 22,
      omittedTranscriptCharacters: 0
    }
  });

  assert.match(reply.message, /point to a field/i);
  assert.deepEqual(reply.offers, []);
});
