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
- a provider-neutral conversation package that turns speech or typed text into a maximum 1,200-character adapter packet containing only the utterance, compact focus and presence;
- an optional same-origin model host that discovers itself without browser configuration, keeps provider credentials on the server and translates bounded turns to an OpenAI-compatible chat-completions endpoint;
- a latest-only WebMCP conversation inbox and bounded reply tool, so an in-page agent can pull one human turn and return text or visible offers without executing them;
- a FormBuilder connector using stable field IDs;
- the pre-existing MIT-licensed FormBuilder web schema/validation/response engine, explicitly attributed and isolated to the showcase;
- a current WebMCP registration adapter using `document.modelContext.registerTool()` and `AbortSignal` ownership;
- a host-supplied WebMCP bridge catalog that emits bounded summaries, executes only read-only-hinted tools, normalizes small read results as JSON, converts oversized results into explicit 1,200-character previews and keeps every mutation offer-only;
- an adaptive, host-supplied runtime that selects native Cowork first, then a usable generic WebMCP catalog, then the legacy host companion, and reports bounded fallback diagnostics rather than pretending to discover a browser by itself;
- a legacy DOM/accessibility host companion with explain-only ephemeral targets, offer-only stable targets, one-step semantic expansion, an explicit 400×400 visual-region delivery callback, and a click-confirmed host action callback;
- a toggleable Manifest V3 browser companion for pages without Cowork or WebMCP: disabled by default, 350/1,200-character semantic tiers, a one-shot pointer crop capped at 400×400 pixels, explain-only sensitive targets and a trusted-click-only visible value offer;
- a responsive FormBuilder showcase with attention controls, exact-value action offers, enforced explain/suggest/delegated/paused rights, causal change receipts, one-click feedback, presence, scoped solo work, typed/audio conversation and spoken replies.

The native browser path now has both contract and browser evidence. An isolated Chrome 152 run with WebMCP testing enabled discovered all nine tools through `document.modelContext.getTools()`. It invoked focus and one-shot context, created two visible offers through `cowork_offer_action`, verified that neither offer changed the field, then used trusted browser clicks to apply both exact values and record human feedback. Native change and feedback reads returned only the second event with `omittedCount: 1`. The same run sent bounded typed turns to the honestly labeled local demo helper, pulled the latest one through `cowork_read_turn`, returned a bounded reply through `cowork_reply_turn`, and proved that both the helper offer and WebMCP reply offer remained inert until trusted clicks. The reproducible smoke explicitly reports `browserClaim: true`, `conversationClaim: true`, `webMcpReplyClaim: true`, `connectedModelClaim: false`, `agentClientClaim: false` and `hostTokenClaim: false`: it proves Chrome mediation and both local/WebMCP human loops, not a connected ChatGPT-agent journey. A separate Chrome 152 smoke proves the same-origin model-host plumbing with one 468-character turn, no browser credential, and a deterministic fixture whose offer remains inert until a trusted click. A provider-backed repetition then sent one 502-character turn through the same browser path to a local Ollama `qwen3:4b`; the model returned the exact visible `Grace Hopper` offer, the field stayed unchanged before the trusted click, and the report set `preferredModelClaim: true`, `connectedModelClaim: true`, `providerLocation: local`, and `externalModelClaim: false`. The browser gate keeps all 21 controls reachable at true 200% browser zoom. A separate current-surface accessibility smoke finds 21/21 named browser AX controls, 21/21 unique visible Tab stops and zero horizontal overflow at an emulated 390×844 browser viewport. The rendered-contrast smoke audits 649 visible text items across ten interaction states with no unsupported range and a 4.5656:1 minimum. A connected Edge session separately accepted AFK handoff/return and Human Solo. Real microphone input, screen-reader practice in the intended client, deployment, a remote provider and a connected ChatGPT-agent invocation remain pending.

A separate Chrome for Testing 152 acceptance explicitly disabled WebMCP and loaded the built Browser Companion extension. It proved default-off and toggle-on/off behavior, exact 350/1,200-character semantic tiers, a real one-shot 400×400 PNG pointer crop, one visible value offer that stayed inert, and mutation plus verification only after a trusted browser click. The report sets `browserCompanionClaim: true`, `visualCaptureClaim: true`, `visualDeliveryOneShot: true`, `webMcpAbsent: true` and keeps model-client, external-model, host-token and full-page-delivery claims false.

Only the browser-based FormBuilder use case belongs to the publication scope. Desktop, Python and native packaging code from the pre-existing FormBuilder repository are intentionally excluded. The showcase remains in this repository so the protocol, application and deployment form one reproducible submission.

## Architecture at a glance

[![Cowork Protocol architecture: human and preferred model collaborate through the panel, protocol core and three bounded connector paths](design/architecture-overview.png)](docs/architecture.md)

The runtime chooses the strongest connector the current page actually provides: native Cowork, a bounded bridge for existing WebMCP tools, or the default-off Browser Companion for a page without WebMCP. The [architecture document](docs/architecture.md) keeps the detailed component and sequence views beside their text alternatives.

## Why WebMCP

The agent reads a structured `cowork_read_focus` tool instead of guessing from the whole interface. FormBuilder contributes a stable target ID and only the capabilities relevant to that field. User-authored text is marked untrusted, selected text over 160 JavaScript UTF-16 code units becomes a length plus digest, and normal focus text is capped at 350 code units.

## Run the local showcase

Requirements: Node.js 22 or newer.

```powershell
npm start
```

Then open `http://127.0.0.1:4173/apps/formbuilder-showcase/` in a WebMCP-capable browser.

### Connect a preferred model without browser secrets

The optional host accepts an OpenAI-compatible chat-completions endpoint. Provider behavior may vary, so a real endpoint still needs its own acceptance run.

```powershell
$env:COWORK_MODEL_ENDPOINT='http://127.0.0.1:11434/v1/chat/completions'
$env:COWORK_MODEL_ID='your-model-id'
$env:COWORK_MODEL_API_KEY='optional-server-only-key'
$env:COWORK_MODEL_REASONING_EFFORT='none' # optional: none, low, medium, high, max
$env:COWORK_MODEL_MAX_TOKENS='200' # optional: 64–500; default 500
$env:COWORK_MODEL_TIMEOUT_MS='120000' # optional; maximum 120000
npm run start:model
```

Open the same local URL. The panel changes from `Local demo helper` to `Connected model bridge` only after same-origin discovery succeeds. The browser sends just `{ protocolVersion, turn }`; endpoint, model ID and API key stay in the server process. See [docs/model-host.md](docs/model-host.md).

## Verify the slice

```powershell
npm test
npm run demo:adapter
npm run eval
npm run proof
npm run build:companion
npm run smoke:companion
npm run smoke:model-host
npm run smoke:webmcp
npm run smoke:accessibility
npm run smoke:contrast
npm run check:secrets
```

The suite uses Node's built-in test runner and has no external runtime dependency.

`npm run demo:adapter` is a deterministic host-contract harness. It selects all three paths with explicit fixtures: native Cowork, host-supplied WebMCP and no-WebMCP legacy companion. The latter reads a semantic target and one bounded context tier through host callbacks. The output explicitly keeps browser-wide discovery, an extension transport and a connected model client false; those require a real browser host or extension and separate acceptance evidence.

`npm run eval` reports `adapter-characters`, defined here as JavaScript UTF-16 code units rather than browser or model tokens. Its twelve cases verify the 350-unit focus, change and feedback budgets; the 160/161 selected-text boundary; silence and unchanged-state suppression; one-step expansion; latest-only event and conversation snapshots; the bounded bridge catalog summary; the 1,200-unit bridge read-result preview; and a complete conversation packet below its 1,200-character ceiling without inventing unavailable host telemetry.

`npm run proof` is a deterministic eight-step juror dry-run. It exercises the real focus, one-shot related-context request, latest-only conversation inbox and bounded reply, offer, human-click authorization, verified change and feedback, scoped AFK lease and FormBuilder export contracts in seconds. Its output explicitly sets `browserClaim: false` and `hostTokenClaim: false`; it is reproducible core evidence, not a substitute for the required live WebMCP browser demonstration.

`npm run smoke:companion` builds the actual Manifest V3 extension and loads it into a fresh Chrome for Testing profile. The fixture explicitly disables WebMCP. The smoke requires default-off and toggle-on/off behavior, a stable pointer target, exact 350/1,200-character semantic tiers, a real 400×400 PNG pointer crop that is consumable once only inside the isolated extension host, an inert visible value offer and a trusted browser click followed by verified mutation. Set `COWORK_COMPANION_BROWSER_PATH` when Chrome for Testing is outside the optional local tools cache. The report does not claim a connected model, host tokens or delivery of the full page.

`npm run smoke:webmcp` starts the showcase and an isolated Chrome profile, enables the current Chrome WebMCP testing features, and discovers exactly the nine Cowork tools. It executes eight tool calls: focus, one-shot context, two inert visible offers, latest change, latest feedback, latest conversation turn and one bounded reply. Chrome DevTools dispatches trusted clicks that authorize the exact visible field values, human feedback, the local helper offer and the WebMCP reply offer; neither offer tool nor reply tool authorizes or applies a value. In the same browser runtime, a host-supplied two-tool calendar fixture proves the portable bridge: two read calls execute, an oversized result becomes a 1,200-character preview, and the booking mutation remains `offer-only` without reaching the host executor. The report distinguishes `browserHostClaim: true` from `foreignLiveSiteClaim: false`. It requires Chrome 150 or newer; set `COWORK_CHROME_PATH` when Chrome is installed outside the usual Windows, macOS or Linux locations. It never uses a personal browser profile or a non-local page.

`npm run smoke:model-host` starts the real same-origin host route with a deterministic reply fixture and a fresh Chrome profile. It requires the browser to discover the bridge, deliver exactly one bounded turn without page HTML or authorization credentials, display `Grace Hopper` as an inert offer, and change the field only after a trusted click. Its output explicitly keeps external- and connected-model claims false; this proves the host plumbing, not a provider response.

To repeat the optional provider-backed acceptance against an already available compatible endpoint, set `COWORK_ACCEPT_CONNECTED_MODEL=1` together with the model-host variables before the same smoke command. A passing provider run adds `preferredModelClaim: true` and `connectedModelClaim: true`; a loopback endpoint still keeps `externalModelClaim: false`. No model is downloaded by this command.

`npm run smoke:accessibility` opens another isolated Chrome profile at an exact 390×844 CSS viewport. It requires exactly 21 non-ignored interactive browser accessibility nodes with non-empty names and unique DOM identities, then drives 21 real Tab events and requires every stop to remain visible with `:focus-visible`. Horizontal control/text clipping and more than one pixel of document overflow fail the gate. This is browser accessibility-tree and keyboard/layout evidence, not screen-reader practice.

`npm run smoke:contrast` uses a separate temporary Chrome profile and audits the actual rendered foreground against Chrome-resolved background ranges. It requires exactly ten collaboration states, at least 30 visible text items in every state, zero unresolved backgrounds and an unrounded 4.5:1 minimum for every audited range. The deterministic Listening state substitutes only the recognition boundary; it does not claim microphone capture or audible output.

## Build the optional no-WebMCP companion

```powershell
npm run build:companion
```

Load the generated `dist-browser-companion` directory as an unpacked extension. It is a separate optional adapter artifact and is not included in the Pages deployment. See [apps/browser-companion/README.md](apps/browser-companion/README.md).

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
- `cowork_read_turn` returns only the latest pending bounded human conversation turn.
- `cowork_reply_turn` returns bounded text and at most three visible offers for that exact turn; it never executes an offer.

## Packages

- `packages/core` — protocol packets, causal changes, human feedback, state decisions, authorizations and budgets.
- `packages/conversation` — provider-neutral bounded turns and replies plus a latest-only pull inbox; silence and a paused agent never call the host model transport.
- `packages/model-transport` — browser discovery plus a server-side OpenAI-compatible gateway; the browser sees neither provider configuration nor credentials.
- `packages/formbuilder-connector` — maps a stable FormBuilder field into a native Cowork focus.
- `packages/native-webmcp` — registers the nine Cowork tools with the current WebMCP API.
- `packages/bridge` — negotiates native → generic WebMCP → no-WebMCP host companion, while adapting explicit host catalogs and bounded legacy semantic/visual-delivery callbacks without claiming browser-wide discovery or built-in image capture.
- `packages/evals` — reproducible character-budget and silence evals with no host-token claim.
- `apps/browser-companion` — optional default-off MV3 bridge for pages without Cowork/WebMCP, with bounded semantic tiers, a one-shot pointer crop and trusted-click-only value changes.
- `apps/formbuilder-showcase` — visible reference journey for focus, offer, confirmation, causal receipt, feedback, presence, solo lease and audio controls.
- `apps/formbuilder-showcase/src/form-engine.mjs` — attributed web-only FormBuilder engine for required-field validation and JSON response export.

See the [adapter runtime guide](packages/bridge/README.md), [browser companion guide](apps/browser-companion/README.md), [docs/architecture.md](docs/architecture.md), [docs/testing.md](docs/testing.md), [docs/deployment.md](docs/deployment.md), [docs/evidence.md](docs/evidence.md), and [PREEXISTING-AND-NEW.md](PREEXISTING-AND-NEW.md).

## License

MIT. The repository-wide license also covers the FormBuilder showcase. Any pre-existing FormBuilder source imported later must retain its original MIT notice and be recorded in [PREEXISTING-AND-NEW.md](PREEXISTING-AND-NEW.md).
