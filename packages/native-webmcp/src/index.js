import { CoworkProtocolError } from "../../core/src/index.js";

function toolResult(structuredContent) {
  return {
    content: [{ type: "text", text: JSON.stringify(structuredContent) }],
    structuredContent
  };
}

export async function registerNativeCoworkTools({
  modelContext,
  readFocus,
  requestContext,
  offerAction,
  readPresence,
  executeSolo,
  readChanges,
  readFeedback,
  readTurn,
  replyTurn
}) {
  if (!modelContext || typeof modelContext.registerTool !== "function") {
    throw new CoworkProtocolError(
      "CAPABILITY_UNAVAILABLE",
      "document.modelContext.registerTool is unavailable"
    );
  }

  const controller = new AbortController();
  try {
    await modelContext.registerTool(
      {
        name: "cowork_read_focus",
        title: "Read focused FormBuilder field",
        description:
          "Read the current user-directed focus as a character-bounded Cowork Protocol packet.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false
        },
        annotations: {
          readOnlyHint: true,
          untrustedContentHint: true
        },
        async execute() {
          return toolResult(await readFocus());
        }
      },
      { signal: controller.signal }
    );

    if (typeof requestContext === "function") {
      await modelContext.registerTool(
        {
          name: "cowork_request_context",
          title: "Request related field context",
          description:
            "Request one character-bounded related context level for the current focus, with a short reason.",
          inputSchema: {
            type: "object",
            properties: {
              reason: {
                type: "string",
                minLength: 1,
                maxLength: 200,
                description: "Why the current focus packet is not sufficient."
              }
            },
            required: ["reason"],
            additionalProperties: false
          },
          annotations: {
            readOnlyHint: true,
            untrustedContentHint: true
          },
          async execute(arguments_) {
            return toolResult(await requestContext(arguments_));
          }
        },
        { signal: controller.signal }
      );
    }

    if (typeof offerAction === "function") {
      await modelContext.registerTool(
        {
          name: "cowork_offer_action",
          title: "Offer a FormBuilder action",
          description:
            "Create a visible action offer for the current field. This tool never authorizes or executes the change.",
          inputSchema: {
            type: "object",
            properties: {
              capabilityId: {
                type: "string",
                description: "Registered capability to propose."
              },
              targetId: {
                type: "string",
                description: "Stable focused target id."
              },
              value: {
                type: "string",
                maxLength: 350,
                description:
                  "Proposed field value. On the Studio canvas: the new field's label for form-add-field (optionally prefixed with a palette id, e.g. \"date: Preferred date\"), the new label for form-update-field, \"up\" or \"down\" for form-move-field."
              },
              summary: {
                type: "string",
                maxLength: 200,
                description: "Short human-visible change summary."
              }
            },
            required: ["capabilityId", "targetId", "value", "summary"],
            additionalProperties: false
          },
          annotations: {
            readOnlyHint: false,
            untrustedContentHint: true
          },
          async execute(arguments_) {
            return toolResult(await offerAction(arguments_));
          }
        },
        { signal: controller.signal }
      );
    }

    if (typeof readPresence === "function") {
      await modelContext.registerTool(
        {
          name: "cowork_read_presence",
          title: "Read collaboration presence",
          description:
            "Read whether the human and agent are present, paused, or working under a limited solo lease.",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false
          },
          annotations: {
            readOnlyHint: true,
            untrustedContentHint: false
          },
          async execute() {
            return toolResult(await readPresence());
          }
        },
        { signal: controller.signal }
      );
    }

    if (typeof executeSolo === "function") {
      await modelContext.registerTool(
        {
          name: "cowork_execute_solo",
          title: "Execute inside the active solo lease",
          description:
            "Change the leased FormBuilder field while the human is away. Scope, expiry, calls, and page version are enforced.",
          inputSchema: {
            type: "object",
            properties: {
              capabilityId: {
                type: "string",
                description: "Capability already allowed by the lease."
              },
              targetId: {
                type: "string",
                description: "Target already allowed by the lease."
              },
              value: {
                type: "string",
                description: "Value to apply and verify."
              }
            },
            required: ["capabilityId", "targetId", "value"],
            additionalProperties: false
          },
          annotations: {
            readOnlyHint: false,
            untrustedContentHint: true
          },
          async execute(arguments_) {
            return toolResult(await executeSolo(arguments_));
          }
        },
        { signal: controller.signal }
      );
    }

    if (typeof readChanges === "function") {
      await modelContext.registerTool(
        {
          name: "cowork_read_changes",
          title: "Read latest causal change",
          description:
            "Read only the latest character-bounded change event, including explicit cause references and confidence.",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false
          },
          annotations: {
            readOnlyHint: true,
            untrustedContentHint: false
          },
          async execute() {
            return toolResult(await readChanges());
          }
        },
        { signal: controller.signal }
      );
    }

    if (typeof readFeedback === "function") {
      await modelContext.registerTool(
        {
          name: "cowork_read_feedback",
          title: "Read human feedback",
          description:
            "Read the latest click-authenticated, character-bounded human evaluation of a verified result.",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false
          },
          annotations: {
            readOnlyHint: true,
            untrustedContentHint: false
          },
          async execute() {
            return toolResult(await readFeedback());
          }
        },
        { signal: controller.signal }
      );
    }

    if (typeof readTurn === "function") {
      await modelContext.registerTool(
        {
          name: "cowork_read_turn",
          title: "Read latest human conversation turn",
          description:
            "Read only the latest bounded typed or spoken Cowork turn. User-authored text is untrusted content.",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false
          },
          annotations: {
            readOnlyHint: true,
            untrustedContentHint: true
          },
          async execute() {
            return toolResult(await readTurn());
          }
        },
        { signal: controller.signal }
      );
    }

    if (typeof replyTurn === "function") {
      await modelContext.registerTool(
        {
          name: "cowork_reply_turn",
          title: "Reply to the human conversation turn",
          description:
            "Reply to the latest pending human turn with bounded text and optional visible offers. Offers are never executed by this tool.",
          inputSchema: {
            type: "object",
            properties: {
              turnId: {
                type: "string",
                maxLength: 200,
                description: "Exact id returned by cowork_read_turn."
              },
              message: {
                type: "string",
                minLength: 1,
                maxLength: 350,
                description: "Bounded text reply shown in the Cowork panel."
              },
              speak: {
                type: "string",
                maxLength: 350,
                description: "Optional bounded text for speech synthesis."
              },
              offers: {
                type: "array",
                maxItems: 3,
                items: {
                  type: "object",
                  properties: {
                    capabilityId: { type: "string", maxLength: 120 },
                    targetId: { type: "string", maxLength: 200 },
                    value: { type: "string", maxLength: 350 },
                    summary: { type: "string", maxLength: 200 }
                  },
                  required: ["capabilityId", "targetId", "value", "summary"],
                  additionalProperties: false
                }
              }
            },
            required: ["turnId", "message"],
            additionalProperties: false
          },
          annotations: {
            readOnlyHint: false,
            untrustedContentHint: true
          },
          async execute(arguments_) {
            return toolResult(await replyTurn({
              ...arguments_,
              offers: arguments_.offers ?? []
            }));
          }
        },
        { signal: controller.signal }
      );
    }

    return controller;
  } catch (error) {
    controller.abort();
    throw error;
  }
}

/**
 * The same nine tool definitions `registerNativeCoworkTools` publishes to
 * `document.modelContext`, without their page-bound `execute`.
 *
 * Derived by running the registration above against a capturing context
 * rather than by restating the schemas: a local agent reaching the Companion
 * over MCP must see the identical names and input schemas as a browser agent
 * reaching the page, and a second copy of the literals would drift the first
 * time one side is edited.
 */
export async function coworkToolDefinitions() {
  const definitions = [];
  const present = () => ({});
  await registerNativeCoworkTools({
    modelContext: {
      registerTool({ execute, ...definition }) {
        definitions.push(definition);
      }
    },
    readFocus: present,
    requestContext: present,
    offerAction: present,
    readPresence: present,
    executeSolo: present,
    readChanges: present,
    readFeedback: present,
    readTurn: present,
    replyTurn: present
  });
  return definitions;
}
