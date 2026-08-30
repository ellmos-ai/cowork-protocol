import {
  negotiateCoworkRuntime
} from "../src/index.js";

const hostToolCalls = [];

const native = await negotiateCoworkRuntime({
  native: {
    isAvailable: async () => true,
    readFocus: async () => ({ targetId: "formbuilder:title" })
  }
});

const webMcp = await negotiateCoworkRuntime({
  native: { isAvailable: async () => false, readFocus: async () => ({}) },
  webMcp: {
    tools: [{
      name: "read_form_summary",
      description: "Read the current form summary.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true }
    }],
    executeTool: async (request) => {
      hostToolCalls.push(request);
      return { title: "Customer intake", fields: 4 };
    }
  }
});
const webMcpRead = await webMcp.adapter.executeRead({
  capabilityId: "webmcp:read_form_summary",
  arguments: {}
});

const hostEvents = [];
const legacy = await negotiateCoworkRuntime({
  native: { isAvailable: async () => false, readFocus: async () => ({}) },
  webMcp: { tools: [], executeTool: async () => ({}) },
  legacy: {
    sessionId: "reference-host-session",
    getTargetSnapshot: async () => ({
      pageVersion: 1,
      target: {
        stableId: "project-title",
        role: "textbox",
        label: "Project title"
      }
    }),
    getNearbySemanticText: async () =>
      "Required short title shown at the top of the generated form.",
    getAccessibilityRegionText: async () =>
      "Form editor region containing title, description and field list.",
    requestVisualRegion: async ({ request }) => ({
      referenceId: "host-owned-pointer-region",
      width: request.maximumWidth,
      height: request.maximumHeight,
      delivery: "out-of-band"
    }),
    presentActionOffer: async ({ offer }) => {
      hostEvents.push({ type: "present", offerId: offer.offerId });
    },
    executeAuthorizedAction: async ({ offer }) => {
      hostEvents.push({ type: "execute", offerId: offer.offerId });
      return { verified: true };
    }
  }
});
const legacyFocus = await legacy.adapter.readFocus();
const legacyContext = await legacy.adapter.requestContext({
  currentLevel: 0,
  requestedLevel: 1
});
await legacy.adapter.requestContext({
  currentLevel: 1,
  requestedLevel: 2
});
const legacyVisual = await legacy.adapter.requestContext({
  currentLevel: 2,
  requestedLevel: 3,
  pointer: { x: 720, y: 420 }
});
const legacyOffer = await legacy.adapter.offerAction({
  offerId: "reference-offer",
  capabilityId: "legacy.offer_value",
  targetId: legacyFocus.targetId,
  pageVersion: legacyFocus.pageVersion,
  proposedArguments: { value: "Cowork Protocol demo" },
  summary: "Use Cowork Protocol demo as the project title",
  effect: "write",
  undoAvailable: true,
  expiresAt: "2026-09-01T10:05:00.000Z"
});
const legacyAction = await legacy.host.confirmAction({
  offerId: legacyOffer.offerId,
  event: {
    origin: "human-click",
    offerId: legacyOffer.offerId,
    targetId: legacyOffer.targetId,
    pageVersion: legacyOffer.pageVersion,
    arguments: legacyOffer.proposedArguments
  },
  now: "2026-09-01T10:01:00.000Z"
});

console.log(JSON.stringify({
  protocolVersion: "0.1",
  demo: "host-supplied adaptive runtime",
  modes: [native.mode, webMcp.mode, legacy.mode],
  webMcpRead,
  hostToolCalls,
  legacyFocus: {
    targetId: legacyFocus.targetId,
    capabilityLevel: legacyFocus.capabilityLevel
  },
  legacyContext,
  legacyVisual,
  legacyAction,
  hostEvents,
  claims: {
    browserWideDiscovery: false,
    extensionTransport: false,
    connectedModelClient: false
  }
}, null, 2));
