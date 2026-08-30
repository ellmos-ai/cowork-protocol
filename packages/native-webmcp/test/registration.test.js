import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createActionOffer,
  createActionReceipt,
  createChangeEvent,
  createFeedbackEvent,
  createPresenceEvent
} from "../../core/src/index.js";
import {
  buildFormBuilderContextExpansion,
  buildFormBuilderFocus
} from "../../formbuilder-connector/src/index.js";
import { registerNativeCoworkTools } from "../src/index.js";

test("native registration exposes a read-only focus tool backed by the real connector", async () => {
  const registrations = [];
  const modelContext = {
    async registerTool(tool, options) {
      registrations.push({ tool, options });
    }
  };

  const controller = await registerNativeCoworkTools({
    modelContext,
    readFocus: () =>
      buildFormBuilderFocus({
        sessionId: "browser-session-1",
        pageVersion: 8,
        fieldId: "field-name",
        label: "Name",
        controlKind: "text",
        selectedText: "Lu"
      }),
    requestContext: ({ reason }) =>
      buildFormBuilderContextExpansion({
        focusPacket: buildFormBuilderFocus({
          sessionId: "browser-session-1",
          pageVersion: 8,
          fieldId: "field-name",
          label: "Name",
          controlKind: "text",
          selectedText: "Lu"
        }),
        fieldId: "field-name",
        label: "Name",
        controlKind: "text",
        required: true,
        helpText: "Used in the generated form response.",
        options: [],
        reason
      }),
    offerAction: ({ capabilityId, targetId, value, summary }) =>
      createActionOffer({
        offerId: "browser-offer-1",
        capabilityId,
        targetId,
        pageVersion: 8,
        proposedArguments: { value },
        summary,
        effect: "mutate",
        undoAvailable: true,
        expiresAt: "2026-08-30T10:01:00.000Z"
      }),
    readPresence: () =>
      createPresenceEvent({
        humanPresence: "afk-short",
        agentPresence: "active",
        leaseValid: true,
        reason: "Limited field task",
        changedBy: "human"
      }),
    executeSolo: () =>
      createActionReceipt({
        offerId: "lease:lease-1",
        verified: true,
        observedChangeIds: ["form-page-9"],
        verificationSummary: "Email updated inside the solo lease",
        undoAvailable: true
      }),
    readChanges: () =>
      createChangeEvent({
        changeId: "change-9",
        source: "agent",
        targetIds: ["form-field:email"],
        pageVersion: 9,
        beforeDigest: "before",
        afterDigest: "after",
        shortSummary: "Email changed",
        causeRefs: ["lease:lease-1"],
        causalityConfidence: "high",
        reversible: true
      }),
    readFeedback: () =>
      createFeedbackEvent({
        origin: "human-click",
        relatedOfferId: "browser-offer-1",
        relatedChangeIds: ["form-page-9"],
        verdict: "accepted",
        adjustment: "",
        pageVersion: 9,
        createdAt: "2026-08-30T10:02:00.000Z"
      }),
    readTurn: () => ({
      type: "conversation-inbox",
      protocolVersion: "0.1",
      latest: {
        turnId: "turn-browser-1",
        turn: {
          type: "conversation-turn",
          protocolVersion: "0.1",
          transcript: "Can you fill this field?",
          focus: { targetId: "form-field:field-name" },
          presence: { humanPresence: "present", agentPresence: "active", mode: "cowork" }
        }
      },
      totalCount: 1,
      omittedCount: 0
    }),
    replyTurn: ({ turnId, message, offers }) => ({
      type: "conversation-reply",
      protocolVersion: "0.1",
      turnId,
      reply: { message, speak: "", offers, omittedOffers: 0 },
      requiresHumanConfirmation: offers.length > 0
    })
  });

  assert.equal(registrations.length, 9);
  const { tool, options } = registrations.find(
    (registration) => registration.tool.name === "cowork_read_focus"
  );
  assert.equal(tool.name, "cowork_read_focus");
  assert.equal(tool.title, "Read focused FormBuilder field");
  assert.equal(
    tool.description,
    "Read the current user-directed focus as a character-bounded Cowork Protocol packet."
  );
  assert.deepEqual(tool.inputSchema, {
    type: "object",
    properties: {},
    additionalProperties: false
  });
  assert.deepEqual(tool.annotations, {
    readOnlyHint: true,
    untrustedContentHint: true
  });
  assert.equal(options.signal.aborted, false);

  const result = await tool.execute({});
  assert.equal(result.structuredContent.targetId, "form-field:field-name");
  assert.equal(result.structuredContent.metrics.contextCharacters, 6);
  assert.deepEqual(result.content, [
    { type: "text", text: JSON.stringify(result.structuredContent) }
  ]);

  const contextRegistration = registrations.find(
    (registration) => registration.tool.name === "cowork_request_context"
  );
  assert.equal(contextRegistration.tool.title, "Request related field context");
  assert.deepEqual(contextRegistration.tool.annotations, {
    readOnlyHint: true,
    untrustedContentHint: true
  });
  assert.deepEqual(contextRegistration.tool.inputSchema.required, ["reason"]);
  assert.equal(contextRegistration.tool.inputSchema.properties.reason.maxLength, 200);
  const contextResult = await contextRegistration.tool.execute({
    reason: "Need the field validation rule"
  });
  assert.equal(contextResult.structuredContent.type, "context-expansion");
  assert.equal(contextResult.structuredContent.targetId, "form-field:field-name");
  assert.equal(contextResult.structuredContent.oneShot, true);

  const offerRegistration = registrations.find(
    (registration) => registration.tool.name === "cowork_offer_action"
  );
  assert.deepEqual(offerRegistration.tool.annotations, {
    readOnlyHint: false,
    untrustedContentHint: true
  });
  assert.deepEqual(offerRegistration.tool.inputSchema.required, [
    "capabilityId",
    "targetId",
    "value",
    "summary"
  ]);
  assert.equal(
    offerRegistration.tool.inputSchema.properties.value.maxLength,
    350
  );
  const offerResult = await offerRegistration.tool.execute({
    capabilityId: "form.set_value",
    targetId: "form-field:field-name",
    value: "Lukas",
    summary: "Set Name to Lukas"
  });
  assert.equal(offerResult.structuredContent.type, "action-offer");
  assert.equal(offerResult.structuredContent.requiresHumanConfirmation, true);
  assert.deepEqual(offerResult.structuredContent.proposedArguments, { value: "Lukas" });

  const presenceRegistration = registrations.find(
    (registration) => registration.tool.name === "cowork_read_presence"
  );
  assert.deepEqual(presenceRegistration.tool.annotations, {
    readOnlyHint: true,
    untrustedContentHint: false
  });
  const presenceResult = await presenceRegistration.tool.execute({});
  assert.equal(presenceResult.structuredContent.effectiveMode, "agent-solo");

  const soloRegistration = registrations.find(
    (registration) => registration.tool.name === "cowork_execute_solo"
  );
  assert.deepEqual(soloRegistration.tool.annotations, {
    readOnlyHint: false,
    untrustedContentHint: true
  });
  const soloResult = await soloRegistration.tool.execute({
    capabilityId: "form.set_value",
    targetId: "form-field:email",
    value: "lukas@example.com"
  });
  assert.equal(soloResult.structuredContent.status, "verified");

  const feedbackRegistration = registrations.find(
    (registration) => registration.tool.name === "cowork_read_feedback"
  );
  assert.equal(feedbackRegistration.tool.title, "Read human feedback");
  assert.deepEqual(feedbackRegistration.tool.annotations, {
    readOnlyHint: true,
    untrustedContentHint: false
  });
  const feedbackResult = await feedbackRegistration.tool.execute({});
  assert.equal(feedbackResult.structuredContent.verdict, "accepted");
  assert.equal(feedbackResult.structuredContent.source, "human");

  const changesRegistration = registrations.find(
    (registration) => registration.tool.name === "cowork_read_changes"
  );
  assert.equal(changesRegistration.tool.title, "Read latest causal change");
  assert.deepEqual(changesRegistration.tool.annotations, {
    readOnlyHint: true,
    untrustedContentHint: false
  });
  const changesResult = await changesRegistration.tool.execute({});
  assert.equal(changesResult.structuredContent.changeId, "change-9");
  assert.deepEqual(changesResult.structuredContent.causeRefs, ["lease:lease-1"]);

  const turnRegistration = registrations.find(
    (registration) => registration.tool.name === "cowork_read_turn"
  );
  assert.equal(turnRegistration.tool.title, "Read latest human conversation turn");
  assert.deepEqual(turnRegistration.tool.annotations, {
    readOnlyHint: true,
    untrustedContentHint: true
  });
  const turnResult = await turnRegistration.tool.execute({});
  assert.equal(turnResult.structuredContent.latest.turnId, "turn-browser-1");
  assert.equal(
    turnResult.structuredContent.latest.turn.transcript,
    "Can you fill this field?"
  );

  const replyRegistration = registrations.find(
    (registration) => registration.tool.name === "cowork_reply_turn"
  );
  assert.equal(replyRegistration.tool.title, "Reply to the human conversation turn");
  assert.deepEqual(replyRegistration.tool.annotations, {
    readOnlyHint: false,
    untrustedContentHint: true
  });
  assert.deepEqual(replyRegistration.tool.inputSchema.required, ["turnId", "message"]);
  assert.equal(replyRegistration.tool.inputSchema.properties.message.maxLength, 350);
  assert.equal(replyRegistration.tool.inputSchema.properties.offers.maxItems, 3);
  assert.equal(
    replyRegistration.tool.inputSchema.properties.offers.items.properties.value.maxLength,
    350
  );
  const replyResult = await replyRegistration.tool.execute({
    turnId: "turn-browser-1",
    message: "I can fill it. Click the visible offer.",
    offers: [
      {
        capabilityId: "form.set_value",
        targetId: "form-field:field-name",
        value: "Ada Byron",
        summary: "Set Name to Ada Byron"
      }
    ]
  });
  assert.equal(replyResult.structuredContent.turnId, "turn-browser-1");
  assert.equal(replyResult.structuredContent.requiresHumanConfirmation, true);

  controller.abort();
  assert.equal(options.signal.aborted, true);
  assert.equal(offerRegistration.options.signal.aborted, true);
  assert.equal(presenceRegistration.options.signal.aborted, true);
  assert.equal(soloRegistration.options.signal.aborted, true);
  assert.equal(feedbackRegistration.options.signal.aborted, true);
  assert.equal(changesRegistration.options.signal.aborted, true);
  assert.equal(contextRegistration.options.signal.aborted, true);
  assert.equal(turnRegistration.options.signal.aborted, true);
  assert.equal(replyRegistration.options.signal.aborted, true);
});

test("missing document.modelContext reports an unavailable native capability", async () => {
  await assert.rejects(
    () => registerNativeCoworkTools({ modelContext: undefined, readFocus: () => ({}) }),
    {
      name: "CoworkProtocolError",
      code: "CAPABILITY_UNAVAILABLE"
    }
  );
});

test("a partial WebMCP registration aborts every tool already registered", async () => {
  const signals = [];
  let registrationCount = 0;
  const modelContext = {
    async registerTool(_tool, options) {
      registrationCount += 1;
      signals.push(options.signal);
      if (registrationCount === 2) throw new Error("Browser rejected the second tool");
    }
  };

  await assert.rejects(
    () =>
      registerNativeCoworkTools({
        modelContext,
        readFocus: () => ({}),
        offerAction: () => ({})
      }),
    /Browser rejected the second tool/
  );
  assert.equal(signals[0].aborted, true);
});
