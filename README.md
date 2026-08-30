# Cowork Protocol

Cowork Protocol is a small collaboration contract for people and web agents. It gives an agent the smallest useful context, makes proposed changes visible, keeps human clicks distinct from agent calls, and supports tightly scoped solo work while the human is away.

> Native when available. Bridged when necessary.

## Current local prototype

The repository currently contains:

- a protocol core for character-bounded focus packets that reduce unnecessary model context;
- bounded `ChangeEvent` and click-authenticated `FeedbackEvent` contracts;
- explicit human-click authorization for proposed actions;
- exact human-visible offer values capped at 350 Unicode code points for meaningful review;
- presence modes and fail-closed solo leases;
- a one-step context escalation router that emits nothing for silence or unchanged state and exposes one bounded, reasoned WebMCP context request;
- a FormBuilder connector using stable field IDs;
- the pre-existing MIT-licensed FormBuilder web schema/validation/response engine, explicitly attributed and isolated to the showcase;
- a current WebMCP registration adapter using `document.modelContext.registerTool()` and `AbortSignal` ownership;
- a host-supplied WebMCP bridge catalog that emits bounded summaries, executes only read-only-hinted tools, normalizes small read results as JSON, converts oversized results into explicit 1,200-character previews and keeps every mutation offer-only;
- a legacy DOM/accessibility fallback with explain-only ephemeral targets, offer-only stable targets, one-step semantic expansion and a 400×400 visual-region request contract;
- a responsive FormBuilder showcase with attention controls, exact-value action offers, enforced explain/suggest/delegated/paused rights, causal change receipts, one-click feedback, presence, scoped solo work and an audio fallback.

The native browser path has a tested registration contract and the showcase is served locally. A connected Edge session accepted the local click-gated offer, verified receipt, bounded feedback, brief and longer AFK handoff/return, agent pause/Human Solo and basic keyboard focus path. That browser reported `document.modelContext` unavailable, so real WebMCP discovery/invocation, microphone acceptance, full visual/accessibility acceptance in the intended client and deployment remain pending. This README does not claim those gates as complete.

Only the browser-based FormBuilder use case belongs to the publication scope. Desktop, Python and native packaging code from the pre-existing FormBuilder repository are intentionally excluded. The showcase remains in this repository so the protocol, application and deployment form one reproducible submission.

## Why WebMCP

The agent reads a structured `cowork_read_focus` tool instead of guessing from the whole interface. FormBuilder contributes a stable target ID and only the capabilities relevant to that field. User-authored text is marked untrusted, selected text over 160 JavaScript UTF-16 code units becomes a length plus digest, and normal focus text is capped at 350 code units.

## Run the local showcase

Requirements: Node.js 22 or newer.

```powershell
npm start
```

Then open `http://127.0.0.1:4173/apps/formbuilder-showcase/` in a WebMCP-capable browser.

## Verify the slice

```powershell
npm test
npm run eval
npm run proof
npm run check:secrets
```

The suite uses Node's built-in test runner and has no external runtime dependency.

`npm run eval` reports `adapter-characters`, defined here as JavaScript UTF-16 code units rather than browser or model tokens. It verifies the 350-unit focus, change and feedback budgets; the 160/161 selected-text boundary; silence and unchanged-state suppression; one-step expansion; latest-only event snapshots; the bounded bridge catalog summary; and the 1,200-unit bridge read-result preview without inventing unavailable host telemetry.

`npm run proof` is a deterministic seven-step juror dry-run. It exercises the real focus, one-shot related-context request, offer, human-click authorization, verified change and feedback, scoped AFK lease and FormBuilder export contracts in seconds. Its output explicitly sets `browserClaim: false` and `hostTokenClaim: false`; it is reproducible core evidence, not a substitute for the required live WebMCP browser demonstration.

## Build the web-only release

```powershell
npm run build:pages
npm run preview:pages
```

The allowlisted `dist/` artifact contains only the browser showcase and required runtime modules. The included GitHub Pages workflow is manual-only; neither a local build nor a later push deploys automatically. See [docs/deployment.md](docs/deployment.md).

## Native WebMCP tools

- `cowork_read_focus` returns the current character-bounded focus packet.
- `cowork_request_context` returns one reasoned, target-bound related-context level capped at 1,200 adapter characters.
- `cowork_offer_action` creates a visible offer; it never authorizes or executes the change.
- `cowork_read_presence` returns the explicit human/agent work mode.
- `cowork_execute_solo` executes only inside a valid, scoped and unexpired solo lease.
- `cowork_read_changes` returns only the latest digest-based causal change while the lens is enabled.
- `cowork_read_feedback` returns only the latest bounded, click-authenticated human evaluation.

## Packages

- `packages/core` — protocol packets, causal changes, human feedback, state decisions, authorizations and budgets.
- `packages/formbuilder-connector` — maps a stable FormBuilder field into a native Cowork focus.
- `packages/native-webmcp` — registers the six Cowork tools with the current WebMCP API.
- `packages/bridge` — adapts an explicit host tool catalog or bounded legacy semantic snapshots without claiming browser-wide discovery or image capture.
- `packages/evals` — reproducible character-budget and silence evals with no host-token claim.
- `apps/formbuilder-showcase` — visible reference journey for focus, offer, confirmation, causal receipt, feedback, presence, solo lease and audio controls.
- `apps/formbuilder-showcase/src/form-engine.mjs` — attributed web-only FormBuilder engine for required-field validation and JSON response export.

See [docs/architecture.md](docs/architecture.md), [docs/testing.md](docs/testing.md), [docs/deployment.md](docs/deployment.md), [docs/evidence.md](docs/evidence.md), and [PREEXISTING-AND-NEW.md](PREEXISTING-AND-NEW.md).

## License

MIT. The repository-wide license also covers the FormBuilder showcase. Any pre-existing FormBuilder source imported later must retain its original MIT notice and be recorded in [PREEXISTING-AND-NEW.md](PREEXISTING-AND-NEW.md).
