import assert from "node:assert/strict";
import test from "node:test";

import {
  validateAccessibilityObservation,
  validateBrowserHostBridgeObservation,
  validateConversationObservation,
  validateNativeWebMcpObservation,
  validateZoomReflowObservation
} from "../webmcp-browser-smoke-lib.mjs";

const expectedTools = [
  "cowork_execute_solo",
  "cowork_offer_action",
  "cowork_read_changes",
  "cowork_read_feedback",
  "cowork_read_focus",
  "cowork_read_presence",
  "cowork_read_turn",
  "cowork_reply_turn",
  "cowork_request_context"
];

function validObservation() {
  return {
    browserVersion: "Chrome/152.0.7977.64",
    secureContext: true,
    modelContextAvailable: true,
    methods: {
      registerTool: "function",
      getTools: "function",
      executeTool: "function"
    },
    badge: "Native WebMCP",
    toolNames: expectedTools,
    focusExecution: {
      argumentKind: "json-string",
      packet: {
        type: "focus",
        targetId: "form-field:full-name",
        pageVersion: 1,
        metrics: { contextCharacters: 9 }
      }
    },
    contextExecution: {
      argumentKind: "json-string",
      packet: {
        type: "context-expansion",
        targetId: "form-field:full-name",
        pageVersion: 1,
        currentLevel: 2,
        level: 3,
        oneShot: true,
        metrics: {
          sourceContextCharacters: 110,
          includedContextCharacters: 110
        }
      }
    },
    offerExecutions: [
      {
        argumentKind: "json-string",
        packet: {
          type: "action-offer",
          offerId: "offer-browser-1",
          capabilityId: "form.set_value",
          targetId: "form-field:full-name",
          pageVersion: 1,
          proposedArguments: { value: "Ada Lovelace" },
          requiresHumanConfirmation: true
        }
      },
      {
        argumentKind: "json-string",
        packet: {
          type: "action-offer",
          offerId: "offer-browser-2",
          capabilityId: "form.set_value",
          targetId: "form-field:full-name",
          pageVersion: 2,
          proposedArguments: { value: "Lukas Geiger" },
          requiresHumanConfirmation: true
        }
      }
    ],
    humanClickObservations: [
      {
        valueBeforeHumanClick: "",
        visibleOfferValue: "Ada Lovelace",
        inputValueAfterClick: "Ada Lovelace",
        receiptStatusText: "Verified: Full name now equals Ada Lovelace"
      },
      {
        valueBeforeHumanClick: "Ada Lovelace",
        visibleOfferValue: "Lukas Geiger",
        inputValueAfterClick: "Lukas Geiger",
        receiptStatusText: "Verified: Full name now equals Lukas Geiger"
      }
    ],
    changeExecution: {
      argumentKind: "json-string",
      packet: {
        type: "change-snapshot",
        latest: {
          type: "change",
          changeId: "change-3-2",
          source: "agent",
          targetIds: ["form-field:full-name"],
          pageVersion: 3,
          causeRefs: ["offer:offer-browser-2", "authorization:human-click"],
          causalityConfidence: "high"
        },
        totalCount: 2,
        omittedCount: 1
      }
    },
    feedbackExecution: {
      argumentKind: "json-string",
      packet: {
        type: "feedback-snapshot",
        latest: {
          type: "feedback",
          source: "human",
          origin: "human-click",
          relatedOfferId: "offer-browser-2",
          relatedChangeIds: ["change-3-2"],
          verdict: "accepted",
          adjustment: "",
          pageVersion: 3
        },
        totalCount: 2,
        omittedCount: 1
      }
    }
  };
}

test("native WebMCP browser evidence requires the complete click-gated human loop", () => {
  const summary = validateNativeWebMcpObservation(validObservation());

  assert.deepEqual(summary, {
    browserClaim: true,
    agentClientClaim: false,
    browserVersion: "Chrome/152.0.7977.64",
    discoveredTools: 9,
    focusContextCharacters: 9,
    expandedContextCharacters: 110,
    verifiedHumanClicks: 2,
    latestChangeOmittedCount: 1,
    latestFeedbackOmittedCount: 1,
    executeArgumentKinds: [
      "json-string",
      "json-string",
      "json-string",
      "json-string",
      "json-string",
      "json-string"
    ]
  });
});

test("native WebMCP evidence rejects an offer that changed the field before a human click", () => {
  const observed = validObservation();
  observed.humanClickObservations[0].valueBeforeHumanClick = "Ada Lovelace";

  assert.throws(
    () => validateNativeWebMcpObservation(observed),
    /offer must remain inert until the human click/
  );
});

test("native WebMCP evidence rejects feedback not bound to the latest verified offer", () => {
  const observed = validObservation();
  observed.feedbackExecution.packet.latest.relatedOfferId = "offer-browser-1";

  assert.throws(
    () => validateNativeWebMcpObservation(observed),
    /latest feedback must be click-authenticated and bound to the latest offer/
  );
});

test("native WebMCP browser evidence rejects a partial catalog", () => {
  const observed = validObservation();
  observed.toolNames = observed.toolNames.slice(1);

  assert.throws(
    () => validateNativeWebMcpObservation(observed),
    /Expected exactly the nine Cowork tools/
  );
});

test("native WebMCP browser evidence rejects an unbounded or reusable context expansion", () => {
  const observed = validObservation();
  observed.contextExecution.packet.oneShot = false;
  observed.contextExecution.packet.metrics.includedContextCharacters = 1201;

  assert.throws(
    () => validateNativeWebMcpObservation(observed),
    /one-shot context expansion must stay within 1,200 adapter characters/
  );
});

test("conversation browser evidence requires a bounded turn and a trusted click before change", () => {
  const summary = validateConversationObservation({
    transportLabel: "Local demo helper",
    transcriptText:
      "You: Can you fill this for me?\nHelper: I can set Full name to Lukas. Click the visible offer to approve it.",
    visibleOfferValue: "Lukas",
    valueBeforeHumanClick: "Lukas Geiger",
    inputValueAfterClick: "Lukas",
    receiptStatusText: "Verified: Full name now equals Lukas",
    webMcpInbox: {
      readPacket: {
        type: "conversation-inbox",
        protocolVersion: "0.1",
        latest: {
          turnId: "turn-browser-1",
          turn: {
            type: "conversation-turn",
            protocolVersion: "0.1",
            transcript: "Can you fill this for me?"
          }
        },
        totalCount: 1,
        omittedCount: 0
      },
      replyPacket: {
        type: "conversation-reply",
        protocolVersion: "0.1",
        turnId: "turn-browser-1",
        requiresHumanConfirmation: true,
        presentation: { visibleOffers: 1, rejectedOffers: 0 }
      },
      visibleOfferValue: "Ada Byron",
      valueBeforeHumanClick: "Lukas",
      inputValueAfterClick: "Ada Byron",
      receiptStatusText: "Verified: Full name now equals Ada Byron"
    }
  });

  assert.deepEqual(summary, {
    conversationClaim: true,
    connectedModelClaim: false,
    transport: "local-demo",
    clickGatedOffer: true,
    webMcpReplyClaim: true
  });
});

test("conversation browser evidence rejects a helper that changes the field before approval", () => {
  assert.throws(
    () =>
      validateConversationObservation({
        transportLabel: "Local demo helper",
        transcriptText: "You: Fill it\nHelper: Click the visible offer.",
        visibleOfferValue: "Lukas",
        valueBeforeHumanClick: "Lukas",
        inputValueAfterClick: "Lukas",
        receiptStatusText: "Verified: Full name now equals Lukas"
      }),
    /conversation offer must remain inert until the human click/
  );
});

test("conversation browser evidence rejects a WebMCP reply for another turn", () => {
  const observed = {
    transportLabel: "Local demo helper",
    transcriptText: "You: Fill it\nHelper: Click the visible offer.",
    visibleOfferValue: "Lukas",
    valueBeforeHumanClick: "Lukas Geiger",
    inputValueAfterClick: "Lukas",
    receiptStatusText: "Verified: Full name now equals Lukas",
    webMcpInbox: {
      readPacket: {
        type: "conversation-inbox",
        protocolVersion: "0.1",
        latest: {
          turnId: "turn-current",
          turn: {
            type: "conversation-turn",
            protocolVersion: "0.1",
            transcript: "Fill it"
          }
        },
        totalCount: 1,
        omittedCount: 0
      },
      replyPacket: {
        type: "conversation-reply",
        protocolVersion: "0.1",
        turnId: "turn-stale",
        requiresHumanConfirmation: true,
        presentation: { visibleOffers: 1, rejectedOffers: 0 }
      },
      visibleOfferValue: "Ada Byron",
      valueBeforeHumanClick: "Lukas",
      inputValueAfterClick: "Ada Byron",
      receiptStatusText: "Verified: Full name now equals Ada Byron"
    }
  };

  assert.throws(
    () => validateConversationObservation(observed),
    /WebMCP reply must match the latest pending conversation turn/
  );
});

function validZoomObservation() {
  return {
    requestedZoomPercent: 200,
    requestedSurfaceWidth: 1440,
    requestedSurfaceHeight: 1200,
    browserZoomFactor: 2,
    devicePixelRatio: 2,
    visualViewportScale: 1,
    viewportCssWidth: 712,
    viewportCssHeight: 524,
    viewportPhysicalWidth: 1424,
    viewportPhysicalHeight: 1048,
    documentHorizontalOverflow: 0,
    interactiveControlCount: 21,
    reachableControlCount: 21,
    focusVisibleControlCount: 21,
    tabSequence: Array.from({ length: 21 }, (_, index) => `control-${index + 1}`),
    unreachableControls: [],
    horizontallyClippedControls: [],
    textClippedControls: []
  };
}

test("200-percent browser zoom evidence requires reflow and every control to remain reachable", () => {
  assert.deepEqual(validateZoomReflowObservation(validZoomObservation()), {
    browserZoomClaim: true,
    requestedZoomPercent: 200,
    browserZoomFactor: 2,
    viewportCssWidth: 712,
    viewportPhysicalWidth: 1424,
    interactiveControls: 21,
    reachableControls: 21,
    focusVisibleControls: 21,
    horizontalOverflow: 0
  });
});

test("200-percent browser zoom evidence rejects clipped or unreachable controls", () => {
  const observed = validZoomObservation();
  observed.reachableControlCount = 20;
  observed.unreachableControls = ["stop-speech"];
  observed.horizontallyClippedControls = ["stop-speech"];

  assert.throws(
    () => validateZoomReflowObservation(observed),
    /Every interactive control must remain horizontally visible and reachable at 200-percent zoom/
  );
});

test("200-percent browser zoom evidence rejects pinch zoom posing as browser zoom", () => {
  const observed = validZoomObservation();
  observed.devicePixelRatio = 1;
  observed.visualViewportScale = 2;

  assert.throws(
    () => validateZoomReflowObservation(observed),
    /Browser zoom must be a two-times page zoom with a one-times visual viewport scale/
  );
});

function validAccessibilityObservation() {
  return {
    viewportCssWidth: 390,
    viewportCssHeight: 844,
    documentHorizontalOverflow: 0,
    interactiveControlCount: 21,
    reachableControlCount: 21,
    focusVisibleControlCount: 21,
    tabSequence: Array.from({ length: 21 }, (_, index) => `control-${index + 1}`),
    horizontallyClippedControls: [],
    textClippedControls: [],
    axInteractiveNodes: Array.from({ length: 21 }, (_, index) => ({
      backendDOMNodeId: index + 1,
      role: index === 0 ? "link" : "button",
      name: `Control ${index + 1}`
    }))
  };
}

test("current accessibility evidence requires named AX controls and a complete 390px Tab path", () => {
  assert.deepEqual(
    validateAccessibilityObservation(validAccessibilityObservation()),
    {
      accessibilityClaim: true,
      viewportCssWidth: 390,
      interactiveControls: 21,
      namedAxControls: 21,
      tabStops: 21,
      focusVisibleControls: 21,
      horizontalOverflow: 0
    }
  );
});

test("current accessibility evidence rejects an unnamed browser AX control", () => {
  const observed = validAccessibilityObservation();
  observed.axInteractiveNodes[4].name = "";

  assert.throws(
    () => validateAccessibilityObservation(observed),
    /Every interactive browser AX node must have a unique DOM identity and accessible name/
  );
});

test("current accessibility evidence rejects narrow-layout overflow or incomplete Tab reach", () => {
  const observed = validAccessibilityObservation();
  observed.documentHorizontalOverflow = 8;
  observed.reachableControlCount = 20;
  observed.horizontallyClippedControls = ["stop-speech"];

  assert.throws(
    () => validateAccessibilityObservation(observed),
    /Every current control must remain reachable at the 390px browser viewport/
  );
});

function validBridgeObservation() {
  return {
    runtimeMode: "webmcp-bridge",
    catalog: {
      mode: "webmcp-bridge",
      discovery: "host-supplied",
      capabilities: [
        {
          capabilityId: "webmcp:calendar_read_slots",
          hostToolName: "calendar_read_slots",
          description: "Read open appointment slots without changing the calendar.",
          access: "read-execute",
          parameterNames: ["date"]
        },
        {
          capabilityId: "webmcp:calendar_book_slot",
          hostToolName: "calendar_book_slot",
          description: "Book the chosen appointment slot.",
          access: "offer-only",
          parameterNames: ["slotId", "attendee"]
        }
      ],
      rejected: []
    },
    smallResult: {
      date: "2026-09-01",
      slots: ["09:00", "10:30"]
    },
    largeResult: {
      protocolVersion: "0.1",
      type: "bridge-read-preview",
      capabilityId: "webmcp:calendar_read_slots",
      preview: `${"x".repeat(1199)}…`,
      metrics: {
        sourceCharacters: 5016,
        includedCharacters: 1200,
        truncated: true
      }
    },
    hostCalls: [
      {
        name: "calendar_read_slots",
        arguments: { date: "2026-09-01" }
      },
      {
        name: "calendar_read_slots",
        arguments: { date: "large-result" }
      }
    ],
    mutationError: {
      name: "CoworkProtocolError",
      code: "HUMAN_CONFIRMATION_REQUIRED"
    }
  };
}

test("browser-host bridge evidence requires bounded reads and an offer-only mutation", () => {
  assert.deepEqual(validateBrowserHostBridgeObservation(validBridgeObservation()), {
    browserHostClaim: true,
    foreignLiveSiteClaim: false,
    runtimeMode: "webmcp-bridge",
    suppliedCapabilities: 2,
    readExecutions: 2,
    previewCharacters: 1200,
    mutationAccess: "offer-only"
  });
});

test("browser-host bridge evidence rejects a mutating tool that reached the executor", () => {
  const observed = validBridgeObservation();
  observed.hostCalls.push({
    name: "calendar_book_slot",
    arguments: { slotId: "09:00", attendee: "Lukas" }
  });

  assert.throws(
    () => validateBrowserHostBridgeObservation(observed),
    /Mutating host tools must remain offer-only/
  );
});

test("browser-host bridge evidence rejects an oversized read preview", () => {
  const observed = validBridgeObservation();
  observed.largeResult.preview = `${"x".repeat(1200)}…`;
  observed.largeResult.metrics.includedCharacters = 1201;

  assert.throws(
    () => validateBrowserHostBridgeObservation(observed),
    /Host read previews must remain within 1,200 adapter characters/
  );
});
