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
  offerAction,
  readPresence,
  executeSolo,
  readChanges,
  readFeedback
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
          "Read the current user-directed focus as a token-bounded Cowork Protocol packet.",
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
                description: "Proposed field value."
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
            "Read only the latest token-bounded change event, including explicit cause references and confidence.",
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
            "Read the latest click-authenticated, token-bounded human evaluation of a verified result.",
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

    return controller;
  } catch (error) {
    controller.abort();
    throw error;
  }
}
