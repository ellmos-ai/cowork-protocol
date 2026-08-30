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
- a latest-only WebMCP conversation inbox and bounded reply tool, so an in-page agent can pull one human turn and return text or visible offers without executing them;
- a FormBuilder connector using stable field IDs;
- the pre-existing MIT-licensed FormBuilder web schema/validation/response engine, explicitly attributed and isolated to the showcase;
- a current WebMCP registration adapter using `document.modelContext.registerTool()` and `AbortSignal` ownership;
- a host-supplied WebMCP bridge catalog that emits bounded summaries, executes only read-only-hinted tools, normalizes small read results as JSON, converts oversized results into explicit 1,200-character previews and keeps every mutation offer-only;
- an adaptive, host-supplied runtime that selects native Cowork first, then a usable generic WebMCP catalog, then the legacy host companion, and reports bounded fallback diagnostics rather than pretending to discover a browser by itself;
- a legacy DOM/accessibility host companion with explain-only ephemeral targets, offer-only stable targets, one-step semantic expansion, an explicit 400×400 visual-region delivery callback, and a click-confirmed host action callback;
- a responsive FormBuilder showcase with attention controls, exact-value action offers, enforced explain/suggest/delegated/paused rights, causal change receipts, one-click feedback, presence, scoped solo work, typed/audio conversation and spoken replies.

The native browser path now has both contract and browser evidence. An isolated Chrome 152 run with WebMCP testing enabled discovered all nine tools through `document.modelContext.getTools()`. It invoked focus and one-shot context, created two visible offers through `cowork_offer_action`, verified that neither offer changed the field, then used trusted browser clicks to apply both exact values and record human feedback. Native change and feedback reads returned only the second event with `omittedCount: 1`. The same run sent bounded typed turns to the honestly labeled local demo helper, pulled the latest one through `cowork_read_turn`, returned a bounded reply through `cowork_reply_turn`, and proved that both the helper offer and WebMCP reply offer remained inert until trusted clicks. The reproducible smoke explicitly reports `browserClaim: true`, `conversationClaim: true`, `webMcpReplyClaim: true`, `connectedModelClaim: false`, `agentClientClaim: false` and `hostTokenClaim: false`: it proves Chrome mediation and both local/WebMCP human loops, not a connected ChatGPT-agent journey. The browser gate keeps all 21 controls reachable at true 200% browser zoom. A separate rendered-contrast smoke audits 649 visible text items across ten interaction states with no unsupported range and a 4.5656:1 minimum. A connected Edge session separately accepted AFK handoff/return, Human Solo and the basic keyboard path. Real microphone input, screen-reader practice in the intended client, deployment and a connected-agent invocation remain pending.

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
npm run demo:adapter
npm run eval
npm run proof
npm run smoke:webmcp
npm run smoke:contrast
npm run check:secrets
```

The suite uses Node's built-in test runner and has no external runtime dependency.

`npm run demo:adapter` is a deterministic host-contract harness. It selects all three paths with explicit fixtures: native Cowork, host-supplied WebMCP and no-WebMCP legacy companion. The latter reads a semantic target and one bounded context tier through host callbacks. The output explicitly keeps browser-wide discovery, an extension transport and a connected model client false; those require a real browser host or extension and separate acceptance evidence.

`npm run eval` reports `adapter-characters`, defined here as JavaScript UTF-16 code units rather than browser or model tokens. Its twelve cases verify the 350-unit focus, change and feedback budgets; the 160/161 selected-text boundary; silence and unchanged-state suppression; one-step expansion; latest-only event and conversation snapshots; the bounded bridge catalog summary; the 1,200-unit bridge read-result preview; and a complete conversation packet below its 1,200-character ceiling without inventing unavailable host telemetry.

`npm run proof` is a deterministic eight-step juror dry-run. It exercises the real focus, one-shot related-context request, latest-only conversation inbox and bounded reply, offer, human-click authorization, verified change and feedback, scoped AFK lease and FormBuilder export contracts in seconds. Its output explicitly sets `browserClaim: false` and `hostTokenClaim: false`; it is reproducible core evidence, not a substitute for the required live WebMCP browser demonstration.

`npm run smoke:webmcp` starts the showcase and an isolated Chrome profile, enables the current Chrome WebMCP testing features, and discovers exactly the nine Cowork tools. It executes eight tool calls: focus, one-shot context, two inert visible offers, latest change, latest feedback, latest conversation turn and one bounded reply. Chrome DevTools dispatches trusted clicks that authorize the exact visible field values, human feedback, the local helper offer and the WebMCP reply offer; neither offer tool nor reply tool authorizes or applies a value. In the same browser runtime, a host-supplied two-tool calendar fixture proves the portable bridge: two read calls execute, an oversized result becomes a 1,200-character preview, and the booking mutation remains `offer-only` without reaching the host executor. The report distinguishes `browserHostClaim: true` from `foreignLiveSiteClaim: false`. It requires Chrome 150 or newer; set `COWORK_CHROME_PATH` when Chrome is installed outside the usual Windows, macOS or Linux locations. It never uses a personal browser profile or a non-local page.

`npm run smoke:contrast` uses a separate temporary Chrome profile and audits the actual rendered foreground against Chrome-resolved background ranges. It requires exactly ten collaboration states, at least 30 visible text items in every state, zero unresolved backgrounds and an unrounded 4.5:1 minimum for every audited range. The deterministic Listening state substitutes only the recognition boundary; it does not claim microphone capture or audible output.

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
- `packages/formbuilder-connector` — maps a stable FormBuilder field into a native Cowork focus.
- `packages/native-webmcp` — registers the nine Cowork tools with the current WebMCP API.
- `packages/bridge` — negotiates native → generic WebMCP → no-WebMCP host companion, while adapting explicit host catalogs and bounded legacy semantic/visual-delivery callbacks without claiming browser-wide discovery or built-in image capture.
- `packages/evals` — reproducible character-budget and silence evals with no host-token claim.
- `apps/formbuilder-showcase` — visible reference journey for focus, offer, confirmation, causal receipt, feedback, presence, solo lease and audio controls.
- `apps/formbuilder-showcase/src/form-engine.mjs` — attributed web-only FormBuilder engine for required-field validation and JSON response export.

See the [adapter runtime guide](packages/bridge/README.md), [docs/architecture.md](docs/architecture.md), [docs/testing.md](docs/testing.md), [docs/deployment.md](docs/deployment.md), [docs/evidence.md](docs/evidence.md), and [PREEXISTING-AND-NEW.md](PREEXISTING-AND-NEW.md).

## License

MIT. The repository-wide license also covers the FormBuilder showcase. Any pre-existing FormBuilder source imported later must retain its original MIT notice and be recorded in [PREEXISTING-AND-NEW.md](PREEXISTING-AND-NEW.md).
