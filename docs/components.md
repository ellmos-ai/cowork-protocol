# Component reference

[English](components.md) · [Deutsch](components_de.md) · [README English](../README.md#packages) · [README Deutsch](../README_de.md#packages)

This source-backed inventory records the roles of the protocol packages and reference applications.

## Packages

- `packages/core` — protocol packets, causal changes, human feedback, state decisions, authorizations and budgets.
- `packages/conversation` — provider-neutral bounded turns and replies plus a latest-only pull inbox; silence and a paused agent never call the host model transport.
- `packages/model-transport` — browser discovery plus a server-side OpenAI-compatible gateway; the browser sees neither provider configuration nor credentials.
- `packages/formbuilder-connector` — maps a stable FormBuilder field into a native Cowork focus, plus the same offer/plan contract for three canvas-editing capabilities (add/update/move a field) used by the Builder below.
- `packages/native-webmcp` — registers the nine Cowork tools with the current WebMCP API.
- `packages/integration-contract` — declares provider-neutral protocol hosts,
  replaceable surface clients and the three operator-controlled page-UI modes.
- `packages/reference-ui` — shared Cowork reference-surface identity, human/model
  icons and the single work-mode vocabulary (status labels, mode labels, the three
  status steps) consumed by FormBuilder Embed, the extension Side Panel and the
  Desktop Companion. No surface writes its own status wording.
- `packages/session-authority` — owns versioned collaboration snapshots, bounded deltas, exact-revision surface handoffs and compact optional model briefings shared across Cowork surfaces.
- `packages/companion-link` — performs a loopback-only, exact-revision
  Companion join and ordered delta acknowledgement.
- `packages/context-manager` — persists a compact summary plus a bounded recent
  turn window and creates cross-provider Handoff Capsules.
- `packages/model-gateway` — enforces the active model-seat lease, deduplicates
  turn IDs and serializes inference across Cowork-owned surfaces.
- `packages/bridge` — negotiates native → generic WebMCP → no-WebMCP host companion, while adapting explicit host catalogs and bounded legacy semantic/visual-delivery callbacks without claiming browser-wide discovery or built-in image capture.
- `packages/open-compute-adapter` — lazy, operator-enabled Computer Use path for
  the Desktop Companion; its bundled profile exposes only focus-near semantics, a
  requested visual lens and exact click-authorized actions.
- `packages/evals` — reproducible character-budget and silence evals with no host-token claim.
- `apps/browser-companion` — optional default-off MV3 bridge for
  pages without Cowork/WebMCP, with bounded semantic tiers, a one-shot pointer
  crop and trusted-click-only value changes; its visual surface lives on the
  extension origin declared as the Chrome/Edge Side Panel, while its content
  relay injects no page UI.
- `apps/desktop-companion` — persistent loopback-only Session Authority with a
  movable reference window, shared model conversation, audio controls and a
  Windows presence tray.
- `apps/formbuilder-showcase` — visible reference journey for focus, offer, confirmation, causal receipt, feedback, work modes, solo lease and audio controls.
- `apps/formbuilder-showcase/src/form-engine.mjs` — attributed web-only FormBuilder engine for required-field validation and JSON response export.
- `apps/formbuilder-showcase/src/form-builder.mjs`, `fodt-export.mjs`, `builder-view.js` — the new, Cowork-free FormBuilder Studio product (design a form from a palette, fill it in, export schema/response/printable `.fodt`); see [`apps/formbuilder-showcase/INTEGRATION.md`](../apps/formbuilder-showcase/INTEGRATION.md) for how it was then connected to Cowork on top.
- `apps/formbuilder-showcase/src/builder-cowork.js`, `builder-model-suggester.js`, `builder-directive-classifier.js` — the layer on top of Cowork Protocol that knows what a form field is: three canvas capabilities (`form-add-field`, `form-update-field`, `form-move-field`) offered, clicked and verified through the same path as every other FormBuilder capability, plus grants, solo drafting and utterance-authorized directives. No new WebMCP tool.
- `apps/formbuilder-showcase/src/builder-cowork-ui.js` — the headless adapter (`initBuilderCowork`) between that layer and the page. It owns the Studio canvas's attention target, offers, grant and directives and renders nothing: the page's one Cowork panel is the only Cowork surface and serves both the demo form and the Studio canvas. The Studio's own "Model suggestions", "Delegate to the model" and "Say what to do" sections were removed for that reason; see [`apps/formbuilder-showcase/INTEGRATION.md`](../apps/formbuilder-showcase/INTEGRATION.md).

See the [adapter runtime guide](../packages/bridge/README.md), [Browser Bridge guide](../apps/browser-companion/README.md), [docs/architecture.md](../docs/architecture.md), [docs/testing.md](../docs/testing.md), [docs/deployment.md](../docs/deployment.md), [docs/evidence.md](../docs/evidence.md), and [PREEXISTING-AND-NEW.md](../PREEXISTING-AND-NEW.md).
