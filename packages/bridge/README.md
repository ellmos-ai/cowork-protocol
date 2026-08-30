# Cowork adapter runtime

`@cowork-protocol/bridge` is the reusable adapter layer. A browser host, extension or embedding application supplies the capabilities it actually owns; the package chooses the strongest available path in this order:

1. native Cowork adapter;
2. generic, host-supplied WebMCP catalog;
3. no-WebMCP legacy host companion.

The package does not discover arbitrary browser tabs, capture pixels or connect a model client by itself.

The optional reference host in `apps/browser-companion` now supplies these callbacks on an arbitrary page after the human toggles its toolbar action. It uses this package unchanged, keeps sensitive or unstable targets explain-only, crops the requested 400×400 pointer region inside its extension service worker and exposes the crop once only to the isolated extension host. `npm run smoke:companion` is real Chrome 152 extension acceptance; `npm run demo:adapter` remains the smaller deterministic package harness.

## Negotiate a runtime

```js
import { negotiateCoworkRuntime } from "@cowork-protocol/bridge";

const runtime = await negotiateCoworkRuntime({
  native: {
    isAvailable: () => Boolean(document.modelContext),
    readFocus: () => app.readCoworkFocus()
  },
  webMcp: {
    tools: hostCatalog,
    executeTool: hostExecuteTool
  },
  legacy: legacyHostCallbacks
});

console.log(runtime.mode);
```

Native availability and both fallback inputs are host-supplied. A failed probe or unusable catalog is recorded as a code-only diagnostic. Negotiation throws `CAPABILITY_UNAVAILABLE` when no supplied layer is usable.

## No-WebMCP host companion

```js
const legacyHostCallbacks = {
  sessionId: "browser-session-1",
  getTargetSnapshot: async ({ lens }) => ({
    pageVersion: app.pageVersion,
    target: app.semanticTargetAtCurrentFocus(lens)
  }),
  getNearbySemanticText: async ({ focus }) =>
    app.nearbySemanticText(focus.targetId),
  getAccessibilityRegionText: async ({ focus }) =>
    app.accessibilityRegionText(focus.targetId),
  requestVisualRegion: async ({ request }) =>
    host.captureOrReferenceRegion(request),
  presentActionOffer: async ({ offer }) =>
    app.renderVisibleOffer(offer),
  executeAuthorizedAction: async ({ offer, authorization }) =>
    app.executeAndVerify(offer, authorization)
};
```

Context grows through three recorded tiers, exactly one per successful call: nearby semantic text, accessibility-region text, then a pointer-centered request capped at 400×400 pixels. A new focus resets the tier. Skipped and replayed tiers fail closed before a host callback runs. The third callback result is bounded as JSON; an actual host should return a compact reference or semantic description and transport image bytes out of band.

`runtime.adapter.offerAction()` supports only the declared `legacy.offer_value` capability, bounds its exact JSON arguments to 350 characters, calls `presentActionOffer()` and never calls the executor. Confirmation is deliberately absent from the agent-facing adapter. The embedding host calls `runtime.host.confirmAction()` only from its trusted visible-click handler. Matching arguments, target, page version and expiry are checked before `executeAuthorizedAction()` runs. The package cannot independently prove that a browser event was trusted; that remains a host acceptance obligation.

Run the deterministic reference harness from the repository root:

```powershell
npm run demo:adapter
```
