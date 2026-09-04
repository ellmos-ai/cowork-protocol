# Local evidence ledger

This public ledger distinguishes implemented contracts from live acceptance. Counts are evidence snapshots, not promises that future commits will retain the same totals.

| Claim | Local evidence | Status boundary |
|---|---|---|
| Focus packets enforce 160/161 and 350-code-unit rules | `packages/core/test/focus-packet.test.js`; `npm run eval` | Local contract proven; no host-token claim |
| Silence and unchanged state emit no packet | `packages/core/test/context-router.test.js`; eval cases | Local contract proven |
| Typed or spoken input becomes a provider-neutral bounded turn | `packages/conversation/test/conversation.test.js`; FormBuilder conversation integration tests; `npm run smoke:webmcp` | Silence and Human Solo make no transport call; Chrome proves the local-demo reply plus a latest-only WebMCP pull/reply and two click-gated offers, while `connectedModelClaim` remains false |
| A preferred model can attach without browser credentials or page HTML | model-transport and server tests; deterministic plus provider-backed `npm run smoke:model-host` | Chrome 152 first proved the 468-character fixture path, then delivered a 502-character turn to local Ollama `qwen3:4b`; the actual model offer applied only after a trusted click. `preferredModelClaim` and `connectedModelClaim` true; `providerLocation: local`, `externalModelClaim: false` |
| An agent can request one related context level without receiving the page | context-router, FormBuilder connector and native registration tests; eval, juror proof and Chrome 152 WebMCP smoke | Target binding, reason bound and 1,200-character one-shot response proven; Chrome invoked a 110-character response, connected-agent invocation open |
| Agent offers cannot authorize themselves | `packages/core/test/action-authorization.test.js`; connected Edge fallback interaction; native Chrome 152 WebMCP smoke | Two native offers stayed inert until trusted Chrome clicks applied their exact visible values |
| Change causality is explicit, reference-bounded and latest-only | `packages/core/test/change-feedback.test.js`; `interaction-log.test.js`; eval case; native Chrome smoke | Second trusted action read back as the only returned event with `omittedCount: 1` and explicit offer/click causes |
| Feedback requires a human click and exposes only the latest event | `change-feedback.test.js`; `interaction-log.test.js`; eval case; Edge fallback and native Chrome interactions | Two trusted feedback clicks accepted; WebMCP returned only the second event with `omittedCount: 1` and matching offer/change references |
| Solo work is lease-scoped | `packages/core/test/solo-lease.test.js`; FormBuilder connector action tests; connected Edge fallback interaction | Local limits, brief/longer delegated AFK, visible real-time expiry, return summary and agent-pause/Human-Solo path proven; background continuity open |
| Nine Native WebMCP tools register and clean up | `packages/native-webmcp/test/registration.test.js`; `npm run smoke:webmcp` | Contract fake plus Chrome 152 discovery and eight focus/context/offer/change/feedback/conversation invocations proven; connected-agent journey open |
| FormBuilder web validation/export is retained | attributed engine, `formbuilder-use-case.test.js`; upstream Web Companion 48/48 tests; connected Edge fallback interaction | Web logic and click-gated field change proven; full visual/WebMCP flow open |
| FormBuilder Studio designs, fills in and exports a form with zero Cowork dependency | `form-builder.mjs`/`fodt-export.mjs` tests incl. a source-scan solo-mode test; `npm run smoke:builder` | Chrome 152 added a field, filled it in, submitted a real `formularerstellen-response-v1` response and exercised all three export controls (schema JSON, response JSON, Flat ODF `.fodt`) with no agent; `buildFormSchema()` round-trips losslessly through `form-engine.mjs`'s `parseSchema()` |
| Canvas-editing capabilities reuse the existing offer/click/receipt path with no new WebMCP tool | `packages/formbuilder-connector/test/builder-canvas.test.js`; `apps/formbuilder-showcase/test/builder-cowork.test.js`; `npm run smoke:builder`; `npm run smoke:webmcp` | `form-add-field`/`form-update-field`/`form-move-field` proven at the connector, bridge and Chrome levels: an unclicked offer leaves the canvas untouched, a stale page-version click and an expired offer both fail closed, and a real trusted click produces exactly one verified receipt; native tool count stays 9 in Chrome |
| One builder field is individually addressable, not only the whole canvas (GAP-00) | `packages/formbuilder-connector/test/builder-canvas.test.js`; `apps/formbuilder-showcase/test/builder-cowork.test.js`; `npm run smoke:builder` | `buildFormBuilderFieldFocus()`/`builderFieldTargetId()` give one field a `form-field:<id>` target with exactly the two capabilities that make sense for an existing field; `form-update-field`/`form-move-field` reject a target that does not name the field their own arguments patch; Chrome pointed at a field, saw the shared `.is-focused` style and a live focus label, and a suggestion applied to exactly that field, not merely the last one added. Since the panel fold (below) that focus label is the one Cowork panel's own attention lens, which reads `Pointing at: <label> (Studio canvas)`; the Studio's local echo is gone |
| The Studio answers the page's WebMCP tools, not only the panel's lens | `apps/formbuilder-showcase/test/builder-cowork-ui.test.js`; `npm run smoke:webmcp` | Before this, `cowork_read_focus`, `cowork_request_context` and `cowork_offer_action` served the fixed sample form only: pointing at the Studio left all three at `STALE_FOCUS` while the panel's own lens already named the field, so an agent (or the extension reading through those tools) could follow the human on the sample form alone. Now the adapter answers for the canvas (`form-builder:canvas`, `form-add-field`) and for one field (`form-field:<id>`, `form-update-field`/`form-move-field`) on the same target ids the panel shows; the tool's one `value` string is the new field's label (optional palette prefix), the new label, or `up`/`down`. Node: STALE_FOCUS without a lens target, canvas and field focus, level-3 context naming the field kind, wrong target / unavailable capability / bad direction fail closed, an update offer inert until applied. Chrome 152 (`studioFollowedThroughToolsClaim`): pointer on a Studio row, `cowork_read_focus` returned `form-field:<id>` with `form-update-field`, `cowork_request_context` level 3 with `Short answer`, `cowork_offer_action` created one visible chip while the label stayed unchanged, and one trusted click renamed the field and emptied the list |
| Leaving the Desktop Companion hands the session back to the page | `npm run smoke:surface` (`leaveCompanionClaim`) | Before this, a page that had joined the Companion had no way back short of a reload: the panel stayed folded to header, status line, offers and receipts, and nothing said how to return. The Companion note now carries a `Leave Companion` button: the page stops the agent relay, drops the replica, becomes its own session authority again from its own last revision and takes the embedded surface back; the Companion keeps its copy, nothing reaches into it. Chrome 152: after the trusted click the snapshot's surface kind is `embedded`, the surface button reads `Desktop Companion` again, the panel is unfolded, local deltas are readable and the conversation input is enabled |
| A delegation grant authorizes solo work independent of presence (GAP-01) | `packages/core/test/delegation-grant.test.js`; `packages/core/test/solo-lease.test.js`; `packages/formbuilder-connector/test/builder-solo.test.js` | `createDelegationGrant()` requires a real human origin (click or utterance, never an agent) and a bounded goal; `authorizeSoloAction()` now succeeds with `humanPresence: "present"` where it previously threw `CANCELLED` - the exact regression-turned-feature the fix is about - while still rejecting a lease without a valid origin |
| A human utterance under an active grant authorizes an action directly (GAP-02) | `packages/core/test/directive-authorization.test.js`; `apps/formbuilder-showcase/test/builder-delegation.test.js`; `npm run smoke:builder` | `authorizeActionOffer()` accepts `origin: "human-utterance"` only with a grant that covers the exact capability/target and has not expired; an agent can never claim this origin; Chrome proved a recognized spoken phrase ("make it required") applying with no offer chip and no second click |
| A bounded return-from-handover summary and multi-field highlight exist (GAP-03) | `packages/core/test/handover-delta.test.js`; `apps/formbuilder-showcase/test/builder-delegation.test.js`; `npm run smoke:builder` | `createHandoverDeltaSummary()` caps target ids at 12 (de-duplicated) with a 350-character summary; `buildFocusSet()` highlights up to 12 targets at once, separate from the existing single-target focus lens; Chrome's "I'm back" click narrated the added fields and highlighted exactly those rows via a new `.is-new-since-handover` style. Since the panel fold (below) that narration is written to the panel's own status line `#system-status`, not to a Studio-local one; re-measured after the fold: the panel status line reported "6 fields added" and exactly 6 rows carried the highlight, which a real verdict click then cleared |
| The Builder canvas has a container-scoped solo/delegation path (GAP-04) | `packages/formbuilder-connector/test/builder-solo.test.js`; `apps/formbuilder-showcase/test/builder-delegation.test.js`; `npm run smoke:builder` | `planSoloBuilderFieldMutation()` plus a canvas-scoped grant let one window add several fields instead of the old fixed 2-call/120-second field lease. Since the panel fold (below) the grant is minted by the panel's own handover buttons with a fixed budget (`BUILDER_GRANT_MAX_CALLS = 6` drafts, `LEASE_DURATION_MS`) instead of a Delegate dialog with typed goal/budget/duration inputs, and it is adopted as the session lease so presence and expiry are shared with the demo form; `createDelegationGrant()` still accepts any budget, the page stopped exposing it. Chrome added 6 fields with 0 per-field clicks under one grant minted by the panel's own "I'm briefly away" button |
| The model watches and comments on a human's own change, only while advising (GAP-06) | `apps/formbuilder-showcase/test/advisor-comment.test.js`; `npm run smoke:webmcp` | `adviseCommentForHumanChange()` fires only for a human-sourced ChangeEvent in Explain mode with an active agent, never for an agent-caused change, never while paused, and never on silence/an unchanged value (`change` stays null); latest-only by construction (a single overwritten variable, not a list). No offer, no action - a silent, non-interactive panel line, so the interactive-control baseline is unaffected. Chrome confirmed the comment appears naming the changed field and hides live the moment Explain mode ends |
| The session enters an explicit awaiting-feedback state after a directive or a returned batch (GAP-05) | `apps/formbuilder-showcase/test/builder-delegation.test.js`; `packages/evals/test/juror-proof.test.js`; `npm run smoke:builder` | A verified directive or a batch return with touched fields sets `awaitingFeedback`; only a real feedback click (`accepted\|rejected\|revise`, `packages/core`'s existing verdict vocabulary) clears it; Chrome proved both the single-directive and whole-batch cases resolving via a real click |
| WebMCP Bridge is bounded and fail-closed | `packages/bridge/test/webmcp-bridge.test.js`; Chrome 152 browser-host fixture in `npm run smoke:webmcp` | Two host-supplied capabilities, two reads, 1,200-character preview and offer-only mutation proven in-browser; unrelated live-site discovery open |
| Adaptive runtime selects the strongest supplied layer | `packages/bridge/test/runtime.test.js`; `npm run demo:adapter` | Native → generic WebMCP → legacy-host selection and fail-closed exhaustion proven with host fixtures; no browser-wide discovery claim |
| Legacy host companion is bounded and click-gated | bridge companion tests, visual eval and `npm run demo:adapter`; real `npm run smoke:companion` | Callback contract plus Chrome 152 extension attachment proven: WebMCP absent, default off, 350/1,200-character tiers, real 160,000-pixel one-shot crop, inert offer, trusted click, verified mutation and toggle off; model-client/full-page claims false |
| Browser Companion works on a page without Cowork or WebMCP | Browser Companion protocol/build tests; Chrome for Testing 152 `npm run smoke:companion` | Self-contained MV3 artifact has no persistent host permission or automatic content script; a trusted action accelerator grants temporary `activeTab`, injects on demand, and accepts the real semantic/crop/trusted-click path; a connected extension model host remains open |
| Protocol and UI are independently selectable | `packages/integration-contract` tests; FormBuilder `window.coworkIntegration`; `npm run smoke:surface` | All three page policies are executable; external clients retain protocol access without a page mount; FormBuilder declares `protocol-and-ui` and keeps one session across embedded and Document PiP surfaces |
| Browser extension is Native-first and keeps UI outside the page DOM | MV3 main/isolated-world plus Side Panel build tests; Chrome 152 `npm run smoke:companion-native` and `npm run smoke:companion` | Both pages have zero Cowork extension worlds before the trusted action; on-demand Native FormBuilder exposes nine tools with `fallbackActive: false`, while the no-WebMCP fixture uses the bounded fallback; both report `userInitiatedActiveTabClaim: true` and `pageUiInjected: false` |
| Human/model work state is a shared visual and operable language | shared reference presentation tests; `npm run smoke:companion-cockpit`; embedded actor cycle in `npm run smoke:accessibility` | Chrome 152 accepted four 390×844 Side Panel states with 0 horizontal overflow and a complete 9-control keyboard path, then clicked the FormBuilder model through observing/paused/collaborating and the human through brief-away/long-away/present; all current paths stayed `structured` with the Computer Use pointer hidden, while state also changes text, symbol, pose and relay, so no color-only claim is made |
| Exact session state can join a persistent local Companion | Session Authority, Context Manager, Model Gateway, Companion Link and desktop-host tests; Chrome 152 `npm run smoke:surface` | Two contiguous authority deltas claim Desktop surface and renewable model seat; initial/hidden/visible page signals contain no page content and invoke no model; work committed while hidden reaches the returning replica as ordered deltas |
| Desktop Companion exposes the shared UI and Windows presence tray | Desktop cockpit/UI/host/launcher/tray tests; PowerShell parser; Chrome 152 `npm run smoke:surface` | The real 430×760 app window cycles collaborating, observing, paused and away actor states, has zero horizontal overflow, rejects model turns while paused, waits when away has no lease and animates Agent Solo only after a bounded lease; typed/audio controls and green/yellow/red tray mapping remain present, while audible speech and real microphone quality remain open |
| The movable cockpit identifies its active model and preserves a chosen background | Desktop host/UI tests; Chrome 152 `npm run smoke:surface` | Host model ID is visible without endpoint/key data; five presets plus a custom color survive a Chrome reload in the same shared session |
| Core jury journey is reproducible without credentials | `npm run proof`; `packages/evals/test/juror-proof.test.js` | Ten deterministic integration steps proven, including an exact-id conversation reply, a collaborative-form-design canvas edit and a full delegation-grant/spoken-directive/awaiting-feedback/verdict loop; output explicitly denies browser and host-token claims |
| Independent code review closed the baseline release findings | Claude Code 2.1.251 with the Fable model reviewed the full tree and the bounded baseline follow-up diffs | Baseline verdict `Ready to publish code: Yes` with no Critical or Important findings; two later context-request attempts and one 240-second visibility/delta review attempt timed out without output, while the final cockpit review retry was refused by the account's monthly spend limit, so those increments are not claimed as Fable-reviewed |
| Public-preview tree is reproducible | clean clone of local `release/public-preview` at `6dfc848277495903121b4f3fd414dd6a6f96d8e6` | `npm ci`, 161/161 tests, 12/12 character evals, 8/8 proof steps, no-WebMCP extension plus native WebMCP/model-host/accessibility/contrast Chrome 152 smokes, 19-file Pages and 10-file extension builds, 75 source plus 22 built-artifact syntax checks, 0 vulnerabilities, 0 secret findings and clean Git readback |
| Post-audit protocol/surface split is release-gated | implementation commit `008942e27e556edca014006258335af67e462ee8`; complete local gate on 2026-08-31 | 205/205 tests, 12/12 character evals, 8/8 proof steps, adapter demo, 100 source syntax checks, 22-file Pages and 16-file extension builds, architecture/secret/audit gates, plus legacy extension, Native-first extension, model-host, native WebMCP, surface handoff, accessibility and contrast Chrome 152 smokes all passed |
| A Fable-operator review batch is release-gated | commits `0dd7633`, `8b24ea8`, `549512d`, `10fd665`, `d21443b` (5 commits interleaved with a parallel README update) on `release/public-preview`; complete local gate on 2026-08-31 | 259/259 tests, 12/12 character evals, 8/8 proof steps, adapter demo, architecture validation, 0 high-confidence secret findings, 23-file Pages and 18-file browser-companion builds, plus the extended 390px accessibility smoke (25/25 named and keyboard-reachable controls, 0 document-level overflow, 0 page-wide overflowing text elements) all passed |
| Local browser fallback is interactive | connected Edge extension plus isolated headless Edge smoke against the local showcase | Exact-value offer, real click, page-version change, verified receipt, Adjust feedback, brief/longer AFK fail-closed/delegated/return, visible lease expiry, agent pause/Human Solo, first 12 keyboard focus stops, and context-preview fail-closed/success states accepted; `document.modelContext` absent, so no WebMCP claim |
| Audio controls fail safely under rapid activation | speech-controller tests plus isolated Chrome 152 SpeechRecognition/synthesis smoke | Two immediate activations produce no uncaught error; 22 synthesis voices and active synthesis observed; fake device returned `audio-capture`, so real microphone and audible output remain open |
| Current interaction surface is keyboard, zoom and narrow-layout coherent | `npm run smoke:accessibility`; Chrome 152 accessibility tree, real Tab dispatch, 390×844 viewport and true 200% page-zoom pass | Current 41/41 browser AX controls are named, all 41 Tab stops are visible with focus, 390px overflow is 0, and all controls remain reachable at 200% with bounded layout rounding; screen-reader practice remains open |
| Rendered text contrast covers the collaboration state matrix | `visual-theme.test.js`; `pixel-contrast-smoke.test.js`; `npm run smoke:contrast` | Chrome 152 audited 902 visible text items across 10 exact states: 0 unsupported, 0 failures, unrounded minimum 4.565644512773976:1; focused and working targets are labeled as well as colored; Listening is a visual fake-recognition boundary and makes no audio claim |
| Showcase has an accepted light, premium visual direction | `visual-theme.test.js`; inspected Chrome 152 captures at 1440×1200 and 390×844; rendered contrast smoke | Opaque warm reading surface, restrained gold, blue and teal hierarchy, six protected source pairs and the 10-state rendered contrast matrix accepted |
| A local reasoning model answers through the Companion seat | live run of `createOpenAiCompatibleGatewaySender` against Ollama `qwen3.8:27b-mlx` at `100.119.69.90:11434`, 2026-09-04 01:00 CEST | The Companion's real gateway packet at `max_tokens: 500` returned `finish_reason: length`, 2,136 reasoning characters and an empty content field in 35.1 s; the same packet with `reasoning_effort: "none"` returned valid JSON in 12.4 s with 126 completion tokens; through the shipped sender, which retries once and discloses it, the turn answered in 43.5 s with one offer. `"think": false` was ignored at `/v1/chat/completions`; `reasoning_effort` was not |
| A model turn that cannot reach its model says which problem it is | `packages/model-transport/test/openai-compatible.test.js`; live `GET /api/tags` before each run against `100.119.69.90:11434` | A refused connection reports `MODEL_ENDPOINT_UNREACHABLE` naming the setting to check, a slow one `MODEL_GATEWAY_TIMED_OUT` naming the cold-load cause; both reach the cockpit and the linked page, and no provider text is copied into either. The gates use a local fake endpoint, so no gate depends on the Mac Studio being up |
| A typed Companion turn becomes a click-gated change on the page | `npm run smoke:companion-mcp`, Chrome 152 | A human turn typed in the Companion window reached a reasoning provider that spent its budget thinking, was retried once with the retry disclosed as `MODEL_THOUGHT_PAST_ITS_BUDGET`, answered, and delivered one `cowork_offer_action` to the linked page; the page showed the Companion-side conversation and the suggestion while the field still read `Ada Lovelace`, and only the trusted click made it `Grace Hopper` with a `Verified` receipt |
| The trusted click on the model seat is the handover | `npm run smoke:accessibility`; `npm run smoke:surface`; `npm run smoke:webmcp` | The embedded seat cycles standby, away, executing under a minted grant and back to advising on the next click; the Companion cockpit reaches executing under a running grant and names its goal, refuses with `PAGE_NOT_LINKED` on a restored session and `NO_FOCUSED_TARGET` without a target, and the work-mode select still snaps back without a grant (`modelExecutionNeedsGrantClaim: true`) |

## Commit trail

- `6016dc8a4e7c3e715bb97fc450d41eaab1bf3b6b` — Native protocol, FormBuilder web use case, panel, server and base tests.
- `d9db5257e843925983ac48ee9d54fd7b817312bf` — Bounded host-supplied WebMCP bridge.
- `958134e75be376ccc770bdfb27e4b143464fd7f2` — Character-based token economy eval.
- `c86eea407e0e5625b42afe4cbfe4f3be8e0c108d` — Bounded legacy semantic/visual request bridge.
- `b6fcaae9` — Public evidence separated from internal submission drafts.
- `aef484d2d552172d89af9d50f07b950da4eebc93` — Causal changes, bounded human feedback and latest-only WebMCP reads.
- `4fc92b0e` — Allowlisted static artifact and manual-only Pages workflow.
- `d85154bf8e21fdb9f8c19c77f3b9f98a05590651` — Deterministic six-step juror proof over the real protocol and FormBuilder packages.
- `09d4df86122abb98ccafc4499f7a59d36fe20474` — Test-first closure of the independent Fable review findings.
- `f1237507753dac2b4f410aa04bde2ff3f15734ba` — Hardening of catalog, lease, offer and bounded-value contracts from the full Fable follow-up.
- `f107395d12e9bd8801e9bd1666aacdfa6be41b15` — Test-first closure of escaped-identity, lossless-JSON and Unicode-boundary edges.
- `54661ee` — Target-bound, reasoned and one-shot related-context requests across the core, FormBuilder connector, native WebMCP adapter, showcase, eval and juror proof.
- `a1b2bc0` — Reproducible native Chrome WebMCP discovery/invocation plus guarded rapid Push-to-talk activation and its 16-file release module closure.
- `0bac68c` — Accepted light editorial showcase theme with restrained gold accents and source-level contrast regression checks.
- `64fa1eb` — Native Chrome WebMCP human loop with two inert offers, trusted clicks and latest-only causal change/feedback readback.
- `09962c4` — Browser-host bridge acceptance with bounded reads, a 1,200-character preview and fail-closed offer-only mutation.
- `6b0473a5a755ccd7fc149ce48f6b94fbe5b3b94d` — Ten-state rendered contrast audit plus an opaque FormBuilder reading surface above decorative gradients.
- `bff18ed` — Provider-neutral bounded conversation transport, typed/audio showcase bridge, click-gated local helper and Chrome conversation acceptance.
- `e7020098bdc240b162ff299ffa2ab7713ef73cd3` — Latest-only WebMCP conversation inbox, exact-id bounded replies, inert visible reply offers and Chrome pull/reply acceptance.
- `f218136603aa7896d92935f068caa2642d998e55` — Current 21-control browser accessibility-tree, Tab-order and 390×844 narrow-layout acceptance.
- `7ab89692c7f6fadcb374e35134f43f0711ef962d` — Exact bounded same-origin model host, server-only OpenAI-compatible provider gateway and trusted-click Chrome acceptance fixture.
- `1753505c38310dda007cc9e9de40981fb67a97cf` — Provider-backed Chrome acceptance with configurable reasoning, 64–500 token answer budget and separate slow-turn timeout.
- `6dfc848277495903121b4f3fd414dd6a6f96d8e6` — Default-off no-WebMCP Browser Companion with bounded semantic tiers, a one-shot pointer crop, trusted-click authorization, self-contained MV3 build and real Chrome 152 acceptance.
- `008942e27e556edca014006258335af67e462ee8` — Provider-neutral integration policies, selected page Embed, Native-first extension Side Panel, exact Companion handoff, shared Context Manager/Model Gateway and Desktop/tray reference surface.

Historical Browser Companion baseline: a clean clone of commit `6dfc848277495903121b4f3fd414dd6a6f96d8e6` passed `npm ci`, 161/161 Node tests, 12/12 character evals and 8/8 proof steps. Its fresh Chrome for Testing 152 extension run explicitly disabled WebMCP and reported `browserCompanionClaim: true`, `defaultDisabled: true`, `semanticTierCharacters: [350, 1200]`, `visualPixelArea: 160000`, `visualDeliveryOneShot: true`, `trustedHumanClick: true`, `toggleOff: true`, `modelClientClaim: false`, `hostTokenClaim: false` and `fullPageContextDelivered: false`. The same clone passed native discovery of nine Cowork tools plus local helper/WebMCP-reply/browser-host/200%-zoom smokes, the deterministic 468-character model-host fixture, the 21-control accessibility-tree/Tab/390px smoke, the 10-state rendered contrast smoke with 649 audited text items, 75 source and 22 built syntax checks, a 19-file Pages build, a 10-file extension build, 0 secret findings, 0 dependency vulnerabilities and a clean Git readback.

The post-audit implementation commit `008942e27e556edca014006258335af67e462ee8` passed the complete current local gate: 205/205 Node tests, the 12-case character-budget eval, the eight-step juror proof, the adaptive adapter demo, 100 source syntax checks, a 22-file Pages build, a 16-file extension build, architecture validation, zero high-confidence secret findings and zero dependency vulnerabilities. Seven sequential Chrome 152 smokes then accepted the bounded no-WebMCP Side Panel, Native-first Side Panel with nine tools and no fallback, deterministic model host, native WebMCP click loop, no-extension Embed/Picture-in-Picture/Desktop handoff, 23/23 named and keyboard-reachable controls, and 699 contrast-audited text items with zero failures.

Commits `0dd7633`, `8b24ea8`, `549512d`, `10fd665` and `d21443b` on `release/public-preview` closed a Fable-operator review batch. `packages/model-transport` had no `package.json`, so it was never a real npm workspace even though the README lists it as one of the 17 packages; that left `package-lock.json` out of sync with `packages/open-compute-adapter` (added without a lockfile update), breaking `npm ci --ignore-scripts` in a clean clone. The 390px accessibility smoke previously scanned only the ~25 interactive controls for horizontal clipping, so running text (headings, ledes, help copy) that never receives focus could overflow the viewport undetected under the "zero horizontal overflow" gate; it now also scans every visible text-bearing element. `open-compute-adapter`'s `activate()` checked and set `activeSessionId` across an `await` boundary, so two concurrent sessions could both pass the seat check before either finished discovery and silently overwrite each other's claim; the seat is now reserved synchronously before the first await. `requestVisualLens()` verified only `type`/`data` on the returned image, not its declared size, so an oversized or dimensionless image would pass as a valid filtered lens; it now rejects anything missing or exceeding `profile.visualLens`. `executeAuthorizedAction()` returned a confirm-mode `needs_confirmation` result from the `do` tool as if the action had executed; it now throws `OPEN_COMPUTE_CONFIRMATION_PENDING` instead. `packages/bridge/src/companion.js`'s `confirmAction()` deleted the pending offer before `boundHostResult()` validated the executor's result, so an executor result that failed bounding (for example `undefined`) silently stranded the offer past the human's click; the offer is now removed only after a valid result is bound. Seven internal German `Error()` message strings in the attributed `form-engine.mjs` were translated to English; the German type-name matching literals (`Textfeld`, `Datum`, `Checkbox`, `Bild`, `Trennlinie`, `Beschreibung`, `Rahmen`, `Überschrift`/`Ueberschrift`) were deliberately left unchanged, since `formbuilder-use-case.js`'s live `SHOWCASE_SCHEMA` confirms they match literal type names produced by the real upstream FormBuilder schema format rather than display text. The complete local gate on end commit `d21443b` reported 259/259 Node tests, the 12-case character-budget eval, the eight-step juror proof, the adaptive adapter demo, architecture validation, zero high-confidence secret findings, a 23-file Pages build and an 18-file browser-companion build.

The reported 390px mobile-overflow regression (hero lede and form-intro text clipped at a 390px browser window, introduced by commits `bc37222`/`f61160e`) did not reproduce under a genuinely fixed 390px CSS viewport in this environment. `Emulation.setDeviceMetricsOverride` — the same mechanism `accessibility-browser-smoke.mjs` already uses — showed zero overflow both at the document level and across every visible element (a full per-element bounding-box scan, not just the ~25 interactive controls), including with the extended check from this batch. The literal `--window-size=390,844` headless-Chrome flag used in the reported repro command was independently found to be non-functional in this sandboxed environment: a content-free blank page (no CSS at all) also settled at an internal viewport of roughly 500×749 regardless of the requested window size, and larger requests (800×600, 1200×900) were honored normally, indicating a hard floor around 500px CSS width unrelated to Cowork's CSS. The operator subsequently resolved this on the host outside any sandbox: a DevTools measurement inside the same headless run (`--window-size=390,844`, `--force-device-scale-factor=1`) reported `innerWidth: 500` with zero overflowing elements, confirming a hard ~500px minimum window width in headless Chrome while the requested 390px only crops the screenshot. The reported clipping was therefore a screenshot artifact, not a layout defect; the CDP viewport override used by the accessibility smoke remains the authoritative narrow-layout measurement, and no CSS change was needed.

The provider-backed local Qwen evidence remains tied to the earlier clean clone of connected-model commit `1753505c38310dda007cc9e9de40981fb67a97cf`: one 502-character turn reached local Ollama `qwen3:4b`, returned the exact visible offer, stayed inert before the trusted click and reported `preferredModelClaim: true`, `connectedModelClaim: true`, `providerLocation: local` and `externalModelClaim: false`. That provider-backed run was not repeated for `008942e`; the post-audit implementation is therefore claimed only for the deterministic model-host fixture, not for a fresh provider-backed model run.

The independent Fable reviews reproduced the release-relevant capability, state, budget, lease, offer and JSON/Unicode boundary failures before their fixes. The resulting tests now cover read-only capability rejection, exact visible click arguments, core-level offer-summary bounds, attempt-based Solo accounting, bounded receipts, lease-expiry presentation, enforced action-mode rights, isolated over-budget tool identities, lossless JSON arguments and Unicode-safe truncation. The final Fable follow-up found no Critical or Important issue.

Current external readback on 2026-08-31 confirms the repository is public at
`https://github.com/ellmos-ai/cowork-protocol` and the deployed FormBuilder URL
returns HTTP 200 at
`https://ellmos-ai.github.io/cowork-protocol/apps/formbuilder-showcase/`.
Release readback must additionally match the published commit identity; an HTTP
200 alone proves availability, not that the post-audit artifact is deployed.
The identity check itself was carried out separately: an operator verification
run on 2026-08-31 (`_reports/OPERATOR-VERIFY-20260831.md` §3) took an anonymous
clone of the public repository, which matched local `HEAD`
`8088c194f80ee0b9f2e5b3ec497ff2cf5c78fb7c`, then compared all 22 files the
live Pages deployment serves against that commit's build; every file was
identical once Windows-checkout CRLF line endings were normalized (`index.html`
differed by exactly 260 bytes, matching 260 CRLF pairs, before normalization),
with one expected error for `.nojekyll` (HTTP 404, a control file Pages does
not serve). That closes the identity gap this ledger left open above; it is
recorded here as that run's finding, not a measurement repeated in this batch.

Commits `395f229` (Builder core: `form-builder.mjs`, `fodt-export.mjs`,
`builder-cowork.js`, and the three `formbuilder-connector` canvas
capabilities) and `1714983` (the Build/Fill/Export UI, `builder-cowork-ui.js`,
and `scripts/formbuilder-builder-browser-smoke.mjs`) added FormBuilder Studio
on `release/public-preview`. The complete local gate reported 301/301 Node
tests, the 12-case character-budget eval, the juror proof (extended from
eight to nine steps by `collaborative-form-design`, below),
`check:architecture` and `check:secrets` clean, a 28-file Pages build (up
from 23: the allowlist in `scripts/build-pages.mjs` needed the 5 new source
files added explicitly, or the deployed page would 404 on them) and an
unaffected 21-file browser-companion build. Six sequential Chrome 152 smokes
passed unchanged in behavior: `smoke:webmcp` (9 tools), `smoke:surface`,
`smoke:model-host`, `smoke:companion`, `smoke:companion-native` and
`smoke:companion-cockpit` (the latter needed one retry after a
"page target not found" flake with no stack-trace-adjacent cause, consistent
with resource contention from several headless Chrome launches in quick
succession, not a code regression). The new `smoke:builder` and the updated
`smoke:accessibility`/`smoke:contrast` are described above under "What each
check proves". The interactive-control count grew from 25 to 35 (10 new
baseline controls: 3 role="tab" buttons, a title input, a field-type select,
an Add button, a paste textarea, two load buttons and one suggestion
button); `accessibility-browser-smoke.mjs`'s AX-role allowlist gained `tab`
alongside the existing five roles, since the three new tab buttons are
genuinely interactive but weren't in the old list. `smoke:contrast` gained an
eleventh rendered state, `builder-offer-visible` (the FormBuilder Studio Build
tab with one visible "Model suggests a field" offer chip), added to
`EXPECTED_PIXEL_CONTRAST_STATES` in `pixel-contrast-smoke-lib.mjs`: 1,248
audited text items (up from 902 across the original ten states) with 0
unsupported/failing and the same unrounded 4.5656:1 minimum, because the new
UI reuses existing, already-vetted color tokens rather than introducing new
ones. Writing
`smoke:builder` caught one real bug before it shipped: `renderFillTab()`
dropped the Fill form's submit button permanently on the very first render
(0 fields), because the empty-state branch never re-appended it and every
later render re-queried a `<form>` that no longer contained it; fixed by
appending the button unconditionally. `apps/formbuilder-showcase/INTEGRATION.md`
documents the two-phase process (product first, Cowork integration second)
and what a different app would need to replicate it.

This batch also extended `packages/evals`'s deterministic juror proof with a
ninth step, `collaborative-form-design`: it
proposes a `form-add-field` offer against an empty canvas, confirms zero
fields exist before the click, authorizes and applies the offer, and checks
the resulting canvas holds exactly the offered field with a verified receipt
- the same offer/click/receipt contract as the existing eight steps, carried
by the three new capability ids instead of a new tool. `npm run proof` now
reports 9/9 passed.

A follow-up batch (video-worker code review, GAP-V4.md revision 2) closed five
protocol gaps a stricter creative review of the V3 story surfaced: the
Builder canvas had exactly one target (the whole canvas) and no addressable
field identity (GAP-00); `authorizeSoloAction()` rejected any solo work the
instant `humanPresence === "present"`, making "the human is right here and
has explicitly delegated this" an unreachable state (GAP-01); a human's own
utterance always produced a click-gated offer, never a direct authorization
(GAP-02); there was no bounded way to summarize or highlight what happened
during an ended delegation window (GAP-03); the Builder canvas had zero
presence/lease path of any kind, and the one that existed for the fixed demo
form was hard-capped at 2 calls and 120 seconds regardless of the task
(GAP-04); and no explicit "waiting for your verdict" state existed after an
unsupervised action (GAP-05). GAP-07 (the lease's `goal` field was read and
stored but never validated in `packages/core`) was folded into the GAP-01 fix
for free, since `createDelegationGrant()` needed to validate a goal anyway.

Fix order followed the dependency chain GAP-00 → (GAP-03 ‖ GAP-04) → GAP-01 →
GAP-02 → GAP-05 the gap analysis identified, across six commits
(`54b7598`, `a5413a8`, `dc2c019`, `e2cd61d`, `0670ff9`, plus this ledger
entry). Two real bugs surfaced only while wiring the fix into the actual UI,
neither designed in from the start:

- `soloExecute()` compared each call's page version against the grant's own
  frozen creation-time value, so a grant's *own* first successful call made
  every subsequent call in the same batch look stale and reject with
  `STALE_PAGE_VERSION` - the exact multi-call failure GAP-04 exists to fix.
  Fixed by having the bridge track the grant's own expected page version
  internally, advancing it only on that grant's own verified calls, while a
  page change from anything else still fails closed (new regression test
  proves both halves).
- `#builder-return-feedback` combined the existing `.feedback-controls` CSS
  class with the `hidden` attribute - a combination the original code never
  needed, since the main demo's feedback controls are only ever created and
  removed, never toggled. The class's own `display: grid` (an author rule)
  silently outranked the browser's default `[hidden] { display: none }`, so
  the Good/Adjust/Different buttons stayed visible and Tab-reachable at every
  page load. `smoke:accessibility` caught this, not any unit test, because
  unit tests never render real CSS cascade; fixed with a scoped
  `.feedback-controls[hidden] { display: none; }` override.

`packages/evals`'s juror proof gained a tenth step,
`delegation-directive-feedback`: a field-scoped grant with
`origin: "human-utterance"` authorizes a `form-update-field` change directly
(no offer, no click), the session enters `awaitingFeedback`, and only a real
feedback verdict (`accepted`) clears it. `npm run proof` now reports 10/10.

The interactive-control baseline grew from 35 to 41 (the Delegate dialog's
goal/call-budget/duration inputs and its button, plus the directive input and
its send button); `accessibility-browser-smoke.mjs`'s AX-role allowlist
gained `spinbutton` (Chrome's AX role for `<input type="number">`, needed for
the two new number inputs - the same kind of gap "tab" closed in the previous
batch). Chrome 152 confirmed 41/41 named, reachable, focus-visible controls
and 0 overflow. `smoke:contrast` needed no code change: 1,446 audited text
items (up from 1,248), 0 unsupported/failing, the same unrounded 4.5656:1
minimum, because the new panels reuse existing color tokens. `smoke:builder`
now drives the complete loop in real Chrome (delegate with a 3-call budget,
draft all 3, return with narration and a 3-field highlight, resolve the
feedback, then a spoken "make it required" directive with no offer chip).
All other Chrome smokes (webmcp, surface, model-host, companion,
companion-native, companion-cockpit) and native tool count (9, unchanged)
were reconfirmed unaffected. The complete local gate reported 362/362 Node
tests, 12/12 eval cases, 10/10 proof steps, `check:architecture` and
`check:secrets` clean, a 29-file Pages build (the new
`builder-directive-classifier.js` added to the allowlist) and an unaffected
21-file browser-companion build.

Honest scope notes on this batch: the Delegate dialog's "stay and watch vs.
step away" choice is not wired to the main Cowork demo panel's own
human-seat presence indicator - the Builder's delegation status is a
separate, self-contained readout, not a cross-module rewrite of the
already-tested main session state machine; the directive classifier
(`builder-directive-classifier.js`) is a small, disclosed keyword heuristic
- the same kind of scripted stand-in `local-conversation.js` already is for
the fixed demo form - not a claim of natural-language understanding; and
GAP-06 (the model commenting on human-made changes in an advise mode)
remains unbuilt, as it was P1 and video-uncritical per GAP-V4.md.

A follow-up pass closed two small findings from a video-worker screenshot
review (GAP-08 and a GAP-04 microcopy gap) and, while auditing the fixed
demo form's own AFK lease against the GAP-01 core change, found and fixed
one real regression the automated suite had not caught (commits `852f845`,
`3e119b8`).

GAP-08: `builder-view.js` rendered the raw `formularerstellen-form-v1`
`typeString` ("Textfeld (Lang)") as every long-answer field's kind badge,
uppercased by CSS - Susan's six drafted questions all looked identical.
The German typeString is unchanged (it is the real schema value
`classifyType()` and the upstream desktop app key off); `form-builder.mjs`
gained a `displayName` per palette entry and a `classificationDisplayName()`
covering all nine classifications, and both the kind badge and the Add-field
palette (plus the "Add ... (&lt;type&gt;)" offer-chip detail text, which had
the identical leak) now render it. New tests cover every classification
including the shared heading-h1/heading-h2 name; `smoke:builder` checks the
rendered text directly ("Short answer", "Long answer").

The regression: `authorizeSoloAction()`'s GAP-01 change requires a lease's
`origin` field to be a real human signal, but `app.js`'s `startAway()` -
the fixed demo form's own AFK/Agent-Solo lease, unrelated to the Builder's
new delegation - built its lease object with no `origin` field at all. The
first genuine `cowork_execute_solo` call against that lease would have
thrown `HUMAN_CONFIRMATION_REQUIRED`, silently breaking the pre-existing
Agent-Solo demo. `grep` across every Chrome smoke found the reason it
survived local review unnoticed: only `pixel-contrast-browser-smoke.mjs`
ever clicked `#away-short`, and only to capture the visual "agent-solo"
state, never to drive a real solo tool call; `smoke:webmcp` discovered and
exercised eight tools but never `cowork_execute_solo` or
`cowork_read_presence`. Fixed by setting `origin: "human-click"` on the
lease (accurate, since `startAway()` is reachable only from a real
button/actor click) and extracting `LEASE_MAX_CALLS`/`LEASE_DURATION_MS` as
named constants. `smoke:webmcp` now closes the coverage gap that let this
happen: it switches to Delegated lease, clicks away, then genuinely calls
`cowork_execute_solo` and `cowork_read_presence` via
`document.modelContext.executeTool()` and requires `effectiveMode:
"agent-solo"` and `status: "verified"` with `#email` actually updated -
confirmed live against the fixed code (`soloExecutionStatus: "verified"` in
the smoke's own output), not merely reasoned through.

GAP-04 microcopy: the fixed demo form's Handoff panel stated "The demo
lease lasts two minutes, permits at most two attempts..." as a hand-typed
string. Once the Builder's own Delegate dialog made call-budget and
duration human-configurable on the same page, that static claim sat next
to a dialog visibly contradicting it. The line (`#lease-microcopy`) is now
generated from `LEASE_MAX_CALLS`/`LEASE_DURATION_MS` at load time, clarifies
this lease is scoped to one field (distinct from the Builder's
canvas-scoped delegation), and points to where the configurable version
lives.

365/365 Node tests; `smoke:webmcp` (with the two newly-exercised tools),
`smoke:accessibility` (41/41 controls, 0 overflow - the longer microcopy
did not introduce overflow) and `smoke:contrast` (0 unsupported/failing)
all Chrome-verified green; `smoke:builder`, `smoke:surface`,
`smoke:model-host`, `smoke:companion`, `smoke:companion-native` and
`smoke:companion-cockpit` reconfirmed unaffected.

A final, deliberately small pass (commit `59758a9`) closed GAP-06 - "Rolle
3: Modell als Beobachter und Kommentator" - as a real product capability, not
only the story's role model: while a human is present and working and the
agent is only advising (Explain mode), a human-caused ChangeEvent may draw
exactly one silent, bounded comment. `advisor-comment.js` is a new, pure,
disclosed heuristic in the same family as `local-conversation.js` and
`builder-directive-classifier.js` - not a claim of language understanding -
built test-first (10 tests written and confirmed red before the
implementation existed, then green): it fires only for `change.source ===
"human"`, only in `explain` mode, never while `agentPresence === "paused"`,
never for silence or an unchanged value (the caller never even constructs a
`ChangeEvent` for those), and is bounded at 350 characters like every other
Cowork-adjacent text. The comment names the changed field and states whether
it is required, and for a required field names how many *other* required
fields are still empty - a pattern derived directly from the existing schema
and value state, not invented text. `app.js` stores it in a single
overwritten variable (latest-only by construction, not a list) and
`render()` gates its visibility live on the *current* mode/presence, so
leaving Explain mode or pausing the agent hides an already-shown comment
immediately, not only future ones. It renders as one non-interactive `<p>`
reusing the existing `.microcopy` styling with the transcript's quiet
left-border treatment - no offer, no button, no new AX control, so the
interactive-control baseline stays exactly 41. `smoke:webmcp` gained a real
Chrome check: switching to Explain mode and editing a field shows the exact
comment naming that field, and switching away hides it live in the same
render pass, with no fixed delay between the two assertions.

While extending `smoke:builder` for this pass, two consecutive runs failed
early (`Cannot set properties of null`, then `Expected one field row after
Add, got 0`) immediately after its fixed 800ms post-navigation wait, then
passed on retry - a pattern distinct from the earlier `smoke:companion-cockpit`
retry, and specifically isolated before proceeding rather than assumed away:
neither failure touched code this pass changed (GAP-06 lives entirely in the
fixed demo form's flow, not the Builder's own init sequence), and three
further runs failed twice more at the exact same point. The smoke's fixed
delay was replaced with `waitForExpression()` (already used elsewhere in this
repo, e.g. `pixel-contrast-browser-smoke.mjs`) polling for
`document.readyState === "complete" && document.querySelector("#builder-add-field")
!== null` instead of guessing a duration; three consecutive runs then passed
cleanly. This is recorded as a smoke-script robustness fix, not a GAP-06 code
change, and is not claimed as a definitive root-cause diagnosis of the
underlying timing sensitivity - only as the fix that resolved the observed
flakiness in this environment.

An independent operator review on 2026-09-03 (second host, ASUS-GEI, Chrome
152.0.7977.65) found that the live GitHub Pages showcase had been unable to
start since the post-audit release: `apps/formbuilder-showcase/src/app.js`
imports `packages/companion-link` and `packages/context-manager` statically,
but `scripts/build-pages.mjs` never listed them, so both returned HTTP 404 and
the whole ES module graph aborted - every local gate stayed green because
`npm start` serves the repository without the allowlist. Commit `dd8019b`
ships both modules (with test assertions) and the redeploy was read back live
with HTTP 200 for both. The same run moved the browser smokes onto a shared
`scripts/smoke-runtime.mjs` (`a35e666`): five green smokes had exited 1 on
this host because Chrome's crashpad/SQLite handles outlived the process and
the temporary profile could not be removed within 5x200 ms, and the native
companion smoke had a Chrome for Testing path pinned to one host's exact
version. All nine smokes exit 0 on the second host. The review batch that
followed closed the remaining findings: the grant-minting Builder handlers and
the demo's away buttons now check `event.isTrusted` like every other consent
handler; the utterance path enforces the grant's `maxCalls` and `pageVersion`
(previously decorative on that path); `readActiveGrant` reports an expired
grant as gone and a directive releases its one-shot grant instead of leaving
the UI in delegation mode; structural Builder edits (reorder, required, help
text, options, heading level) bump the page version so stale offers fail
closed; offers made for an earlier page version stop counting against the
pending budget; `runSoloBatch` tracks the live page version; `MAX_RECEIPTS`
exceeds the 12-call budget so the handover delta counts every call; the
directive classifier no longer treats "later"/"earlier" without "move" as a
move command; a filled-in response is invalidated when the form changes; and
the `.fodt` writer drops XML-illegal control characters, renders line breaks
and uses paragraph-family heading styles. Every DOM-free fix is covered by a new unit test (eleven in total,
389 tests on the fixed tree).

Commit `afceec6` gave the showcase a visible model seat and made the direct
model connection reachable from the page itself. `apps/formbuilder-showcase/src/model-seat.js`
resolves one of four seats in a fixed order - an injected transport, a direct
OpenAI-compatible endpoint entered in the page, the same-origin model host, or
the scripted demo helper - and each seat carries its own badge tone and speaker
name, so a reply is never attributed to a model that is not there. The
none-state is honest rather than silent: with nothing connected the seat reads
"No model connected", the speaker is `System`, and the reply says so instead of
pretending to think. The `#demo-mode` switch is on by default and discloses in
the panel that a scripted helper, not a language model, is answering. The
`<details id="model-connect">` disclosure holds the endpoint, model id and
optional API key, which stay in the tab. `apps/formbuilder-showcase/src/builder-model-suggester.js`
routes a Builder field suggestion through the same seat and rejects a reply
that does not name a field type the palette actually offers. The browser
extension gained the matching route and seat notes in
`apps/browser-companion/sidepanel.*` and `src/cockpit-presentation.js`, and the
Desktop Companion says which page it is bound to and why an execution mode is
unavailable (`apps/desktop-companion/ui/`). Two smoke regressions introduced by
the new section were traced to their causes rather than to the new markup: a
closed `<details>` still lays its content out in Chrome 152, so four collapsed
fields were counted as visible controls while being unfocusable and absent from
the accessibility tree, and inserting the model seat as a sibling `<section>`
flipped `.focus-readout` from an even to an odd `nth-of-type` position, which
let a translucent gradient rule win that Chrome cannot resolve into an opaque
contrast range. Both were fixed in `apps/formbuilder-showcase/styles.css`, and
the pinned control count in `scripts/webmcp-browser-smoke-lib.mjs` moved from 41
to the measured 43. Spoken replies now prefer the Windows Natural voice used in
the project's videos (Andrew, then Ava/Emma/Aria, then any en-US Natural or
Neural voice, then the browser default) through `selectSpeechVoice` in
`apps/formbuilder-showcase/src/speech-controller.js`, without naming the voice
in the transcript or the console. Measured on this tree with Chrome
152.0.7977.65: 417 unit tests pass; the showcase exposes 43 interactive
controls, 43 uniquely named AX nodes, 43 tab stops and 43 focus-visible controls
(21 buttons, 9 textboxes, 4 comboboxes, 3 checkboxes, 3 tabs, 2 spinbuttons, 1
link); the pixel-contrast audit resolves 1556 visible text items across 11
rendered states with 0 unsupported backgrounds, 0 failures and a minimum
contrast of 4.57; the native companion smoke still reports 9 WebMCP tools; the
Pages artifact is 35 files (after the two allowlist fixes 02c27e1 and 12c6d50, which ship model-seat.js, builder-model-suggester.js and openai-compatible.js) and the extension artifact 21. All nine Chrome 152 browser smokes exit 0 on this tree, measured before the two allowlist commits, which touch only scripts/build-pages.mjs.

### Work-mode matrix (0.2)

The interaction rhythm *Point / Offer / Click / Verify* and the separate
"Action rights" selector are gone. Both mixed the two participants: the rhythm
described one scripted exchange rather than the session's state, and a paused
model was reachable through two controls that could disagree. In their place,
each partner answers three questions - `availability` (here / standby / away),
`area` (the page, task, focused target or granted goal), and `role` (executing
or advising) - and `resolveWorkMode()` in `packages/core/src/index.js` derives
the work mode, the authority holder and every action right from them. The modes
are only names for combinations: Sparring (one executes, one advises, and the
authority swaps), Doubling (both execute, each confined to a different area),
solo (the partner is not here) and idle. Authority *is* the click right:
`canExecute` means holding it, `canPropose` means being present without it. The
old `explain` and `suggest` action modes turned out to be one state and are now
one (`advising`); `delegated` became the model executing inside a grant, and
`paused` became model standby. The full concept is `docs/work-modes.md`, with a
one-page German summary in `docs/work-modes.de.md`.

Two rules carry the safety of the model, and both are enforced in the resolver
rather than in a surface. First, **a model executes only inside a valid
delegation grant or solo lease** - human-authored goal, call budget, expiry.
`modelAuthorityValid` is that record and nothing else; a present human is never
a substitute for it, because presence means someone can intervene, not that the
model is authorized or bounded. Without the record the model advises, its
proposals still need a human click, and `authorityLapsed` tells the surface why.
An earlier draft of this rework let a present human stand in for the record;
that softened the security core, was caught in review and is now asserted by a
test that walks every human status. Second, **the human's hand wins**: when both
partners execute on the same or an unknown area, the human keeps authority and
the model falls back to advising. That is the return path of the typical
session, not an invented tie-break.

Doubling is gated by the work itself rather than by a preference. It is offered
only while both partners name an area and the areas differ; on the same area, or
with an area unclaimed, the surfaces do not list it at all, because nothing
proves the two would stay out of each other's way. The `allow simultaneous`
checkbox an earlier draft carried was removed with it - one fewer control, and
the user's requirement that the default flow work without any setting.

All three surfaces read their wording from one vocabulary in
`packages/reference-ui/src/index.js` (`STATUS_STEPS`, `buildWorkModePresentation`,
`workModeChoices`, `statusForWorkModeChoice`), and a test asserts that no surface
script spells a status label itself. The three-step bar `Present · Working on ·
Role` replaced the rhythm bar in all three. A four-step "Clarify" bar was built
first and cut back: its fourth step named the model's job, which is not a fourth
question but the role read off the same answer, and listing a derived value
beside its own sources invites setting it separately.

Two findings surfaced during the rebuild and were fixed rather than worked
around: the browser extension's handoff control could never mint a lease and
therefore never perform a handoff, so it is now an honest hint control; and
`fromLegacyPresence()` initially forced a present human into the executing role,
which made "model executes while the human watches" unreachable from 0.1 input
and rendered two Desktop Companion states identically. The 0.1 wire carries its
single "who is working" bit on the agent, and the bridge now reads it there.

The 0.1 wire is otherwise unchanged: presence events, offers, authorizations,
receipts, leases, grants and the nine native WebMCP tools keep their published
shapes. `toLegacyPresence()` derives the legacy `effectiveMode` from the legacy
values it just produced, so a 0.1 consumer that re-resolves the mode always
agrees; a regression test asserts that agreement for every matrix cell.

Measured on this tree with Chrome 152.0.7977.65: 445 unit tests pass (417
before); all nine browser smokes exit 0; `check:secrets` and
`check:architecture` exit 0. The showcase exposes 44 interactive controls, 44
uniquely named AX nodes, 44 tab stops and 44 focus-visible controls (22 buttons,
9 textboxes, 4 comboboxes, 3 checkboxes, 3 tabs, 2 spinbuttons, 1 link) with 0
horizontal overflow. That is one more control than the 43 of 0.1: the
action-rights selector was replaced by a work-mode selector, the simultaneous
checkbox an early draft added was removed again with the doubling rule, and one
button was added - `Hand over, I'll watch` - because without it the panel could
mint a grant only by sending the human away, which left two of six modes
unreachable. The webmcp smoke asserts both halves of that: choosing
`sparring-model` without a grant is refused, and the same choice after the
hand-over click reaches it. The pixel-contrast audit resolves 1611 visible text
items across 11 rendered states with 0 unsupported backgrounds, 0 failures and a
minimum contrast of 4.57. The native companion smoke reports 9 WebMCP tools. The
surface smoke drives the Desktop Companion through the headline turn - the model
executing under a grant while the human is present and advising, labelled
`Sparring · model executes` - which is the only surface with a real model seat to
show it on. The Pages artifact is 35 files and the extension artifact 21, and
every relative import in both build outputs resolves against the artifact itself.


### One Cowork surface (panel fold)

Until this change the showcase carried **two** Cowork integrations: the
page-level Cowork panel, and three sections of its own inside the FormBuilder
Studio Build tab — "Model suggestions" (`#builder-suggest-add`,
`#builder-offer-list`, `#builder-receipt-list`, `#builder-seat-badge`,
`#builder-clear-history`), "Delegate to the model" (goal, call-budget and
duration inputs plus `#builder-start-delegation`, `#builder-solo-step`,
`#builder-solo-batch`, `#builder-end-delegation`, `#builder-delegate-status`,
`#builder-return-narration`, `#builder-return-feedback`) and "Say what to do"
(`#builder-directive-input`, `#builder-directive-send`,
`#builder-directive-status`). The user's decision removed all three: the
fields largely repeated what the panel already offered, and a protocol whose
whole claim is that it is provider-agnostic and brings *one* instrument should
not grow a second one per integrated region. The backend was explicitly kept,
on the grounds that it is not the protocol but the layer sitting on top of it.

Removed from the DOM: those three sections plus the Studio's local focus echo
`#builder-focus-label`, since the panel's attention lens now follows Studio
fields as well. Kept and untouched: `src/builder-cowork.js` (grants,
`soloExecute`, `directiveFromUtterance`, `endDelegation`, awaiting-feedback),
`src/builder-model-suggester.js` and `src/builder-directive-classifier.js`.
Three files carry the fold itself — `apps/formbuilder-showcase/index.html`,
`src/app.js` and `src/builder-cowork-ui.js` — which is this ledger's evidence
that it was a surface change and not a rewrite of the integration. Four more
files follow from it rather than adding to it: `src/builder-view.js` and
`styles.css` each lost two lines that addressed removed elements, and
`scripts/formbuilder-builder-browser-smoke.mjs` plus
`scripts/pixel-contrast-browser-smoke.mjs` were repointed at the panel. No
file under `packages/` was touched.

`builder-cowork-ui.js` became a headless adapter, exporting
`initBuilderCowork` where it previously exported `initBuilderCoworkUi`
(177 lines added, 394 removed). It still owns the Studio's attention target,
pending offers, active grant, drafts and directives, and touches the DOM only
for the two canvas-row states no panel can own: `.is-focused` on the
pointed-at row and `.is-new-since-handover` on the rows a returned delegation
touched. `app.js` grew by 322 lines (13 removed) to serve the second canvas
from the one panel: a second attention target, a second offer source
(chips whose detail line begins `Studio canvas ·`), a merged receipt list and
count, the Studio handover, and a conversation turn that tries a directive
before it asks for a field. `index.html` lost 66 lines and gained 1.

Two behaviour changes are recorded rather than absorbed silently:

- **The Studio grant's budget stopped being a human input.** It is now
  `BUILDER_GRANT_MAX_CALLS = 6` drafts and `LEASE_DURATION_MS`, both named
  constants in `app.js`, with `#lease-microcopy` generated from them so the
  sentence cannot drift from the grant. What the human still chooses is the
  button: "Hand over, I'll watch" draws one draft per click, "I'm briefly
  away"/"I'm away longer" spend the budget as a batch. A per-run configurable
  budget is no longer reachable from the UI; `createDelegationGrant()` in
  `packages/core` still accepts any budget.
- **A paused model now proposes nothing on the Studio canvas either.** The
  removed sections never consulted the session's work mode, so putting the
  model on standby silenced the demo form but not the Builder. The panel
  applies one gate to both canvases (`builderProposalsAllowed()` in `app.js`,
  the same `workMode.model.canPropose` check `createVisibleOffer()` has always
  made). This is a real behaviour change, not a refactor.
- **The Studio grant is adopted as the session lease**
  (`adoptBuilderGrantAsLease` in `app.js`). This closes the gap the GAP-01…05
  batch above recorded honestly as open — "the Delegate dialog's *stay and
  watch* vs. *step away* state is not connected to the main Cowork demo
  panel's own human-seat presence indicator" — so the page now has one
  presence readout and one expiry clock for both canvases instead of two.

### After the fold: what the page is for

Three follow-on changes, recorded because each one changes what a visitor
sees first:

- **Building is the use case.** FormBuilder Studio moved into the workspace
  column beside the panel; the fixed "Event registration" form moved below it
  and is now labelled as what it is - a sample form whose fields the WebMCP
  proof and four smokes read. It stays visible and unchanged for exactly that
  reason. The skip link points at the builder.
- **An empty model seat reads as an absent model.** With demo mode off and
  nothing connected, the collaboration view used to show a model that advises.
  `modelSeat.resolve().kind === "none"` now puts the model on `away`, applied
  on the tick where the seat changes so a human who parks the model on `away`
  keeps that choice and `away` stays a real option in `ACTOR_STATUS_CYCLE`.
  Proven end to end in `smoke:builder` (`emptySeatReadsAsAbsentModelClaim`).
- **The demo switch is marked as what it is.** The model seat keeps the
  panel's colours because it is part of the work mode; only the demo switch
  and its disclosure text sit in neutral slate under "Showcase add-on - not
  part of Cowork Protocol or FormBuilder".

A collapsible "How to enable WebMCP in this browser" names the browser in use
and gives both routes: the flags page (described as a search, since its label
is not ours to promise) and the command line with `--enable-features=WebMCP,WebMCPTesting`,
the same feature names the smokes launch Chrome with.

No new WebMCP tool: a surface change leaves the nine-tool contract untouched.
No `<input type="number">` remains anywhere in
`apps/formbuilder-showcase/index.html`, so the `spinbutton` AX role the
GAP-01…05 batch added to `accessibility-browser-smoke.mjs`'s role allowlist no
longer occurs on the page; the allowlist entry is harmless, the pinned control
count is not. The unit tests needed no change:
`test/builder-cowork.test.js` and `test/builder-delegation.test.js` import
`src/builder-cowork.js` directly and never imported the UI module — keeping the
DOM glue in a layer that owns no contract is what made the surface rewrite
cheap.

**Measured on this tree** (2026-09-03, after the fold; not carried over from
the previous batch, where these numbers would be wrong):

- Node tests: 454 of 454 passed, 0 failed (445 for the fold itself; the browser companion gained 9 alongside it)
- `npm run proof`: 10 passed, 0 failed
- `npm run smoke:builder`: exit 0 on Chrome/152.0.7977.65; 6 fields drafted under the fixed budget, 6 highlighted on return, 0 offer chips created by the directive, and all nine removed selectors absent from the DOM
- `npm run smoke:accessibility`: exit 0; 38 interactive controls, 38 named AX nodes, 38 unique Tab stops, 38 focus-visible stops, 0 px horizontal overflow. 44 before the fold, 36 after it, 38 once the WebMCP help became a collapsible section and `<summary>` was counted as the keyboard control it is - the DOM selector and the AX role allowlist had both been missing it
- `npm run smoke:contrast`: exit 0; 1398 audited text items across 11 states, 0 unsupported ranges, minimum contrast 4.5656:1
- the other six Chrome smokes (`webmcp`, `surface`, `model-host`, `companion`, `companion-native`, `companion-cockpit`): exit 0 each. The native tool count stays unread in headless Chrome without the WebMCP flag (`nativeToolCountUnchanged: null`), so no claim is made about it here
- provenance, for honesty: the browser-companion work of a second agent
  working in the same clone was swept into two of the panel-fold commits by a
  `git add -A`. It was not reverted, because it is real and tested work - it is
  what raised the test total from 445 to 455 - but it landed under commit
  messages that do not describe it.
- build artifacts: `build:pages` 35 files (25 modules reachable from `app.js`, no unresolved import), `build:companion` 21 files

**Selectors repointed in the same change.** Two smokes drove ids that the
fold removed and were rewritten to drive the panel instead:
`scripts/formbuilder-builder-browser-smoke.mjs` (the whole Cowork half of its
run) and `scripts/pixel-contrast-browser-smoke.mjs` (its eleventh state, which
now adds a Studio field, points at it and asks the panel's demo control for a
proposal). `apps/formbuilder-showcase/src/builder-view.js` also toggled two
removed controls on every field-list render, which would have thrown; that
line is gone. The builder smoke additionally asserts that all nine removed ids
are absent from the DOM, so a partial fold cannot pass unnoticed.

### Local agents over MCP

A local agent can now use the Cowork Companion as a tool. The Companion runs a
stdio MCP server (`apps/desktop-companion/src/mcp-server.js`, `npm run
start:companion-mcp`) that publishes the same nine `cowork_*` tools the page
registers over WebMCP. The list is produced by running that registration, not
by restating its schemas, so the two surfaces cannot drift apart.

Each `tools/call` reaches the Companion over loopback HTTP, waits in a
per-session queue until the linked page pulls it, and returns whatever the page
answered. The route adds a caller, not authority: offers stay inert and solo
execution still requires a lease, because the page enforces both and the page
runs the call. A browser cannot place calls on that route - it is refused when
an `Origin` header is present, which a cross-origin browser request always
carries.

**Measured on this tree** (2026-09-03):

- Node tests: 478 of 478 passed, 0 failed; 23 of them new (15 for the MCP server and the host relay, 8 for the page-side relay)
- `npm run smoke:companion-mcp`: exit 0 on Chrome/152.0.7977.65. A real MCP client process speaks stdio JSON-RPC to the server: the handshake returns `protocolVersion 2025-06-18` and `serverInfo.name cowork-companion`, `tools/list` returns the nine names in the same order the page registers them, `cowork_read_focus` returns a packet for the focused `form-field:full-name`, and `cowork_offer_action` creates an offer with `requiresHumanConfirmation: true` while the field stays empty
- `npm run smoke:surface` and `npm run smoke:companion-cockpit`: exit 0 after the host and page changes; `check:secrets` PASS, `check:architecture` exit 0
- failure paths are asserted, not assumed: no linked page, a page that never answers within 15 seconds, a page that refuses the call, an unknown tool, and a website trying the local agent route each produce the expected code

**The click gap this work opened, and closed in `4281fde`.** While the Companion was
connected, the page collapsed its whole panel, so an offer made over MCP was
correct and inert but had no surface a human could click. Two causes, both
fixed: `.cowork-panel.is-companion-connected` now keeps the offer list and the
verified receipts (`.authorize-here`) with a line saying why they stayed -
"Session lives in the Desktop Companion - proposals are still authorized here";
and `commitSession()` dropped the transition in replica mode, which discarded
the receipt for a click that had already happened on the page. It now reflects
that locally while still authoring no delta - the Companion's next delta
replaces the state wholesale, so authority is unchanged.

The smoke proves the whole chain in one run: `cowork_offer_action` over MCP,
the offer visible and 305 px wide with the Companion connected, a trusted click
that sets the field to `Ada Lovelace`, exactly one receipt reading `Verified:`
with the three verdicts Good/Adjust/Different, and a trusted verdict click
recorded as `Good`.

**Provenance, for honesty:** the `coworkToolDefinitions()` export in
`packages/native-webmcp/src/index.js` was written for this work but landed in
commit `7061b45` ("fix(smoke): count `<summary>` in the zoom reflow check
too"), swept in by another agent's wide `git add` in the shared clone. It was
not reverted; it is the export the MCP server and its drift test depend on.

## The workspace switcher, and the Studio lens it fixed

A user reported on the live page that the panel followed the pointer only on
the sample form, never in the Studio. Reproduced in Chrome for Testing
152.0.7977.65 and traced to one line: the Studio's attention lens listened on
`#builder-field-list` only. That list is **empty on a fresh page**, so until a
row existed and the pointer happened to cross it, the entire left-hand canvas
was invisible to the panel - while the sample form, populated from the first
paint, answered immediately. The Fill tab was worse than silent: its fields
carry `data-field-id` but no `.form-field` class, so pointing at one left the
panel naming whichever Build row it was last stuck on.

The lens now listens on the whole `.builder-studio` section and resolves three
cases: any `[data-field-id]` (which covers Build rows and Fill fields alike),
Studio chrome (title, palette, empty canvas, Export tab) as the canvas target
named by the form's own title, and nothing at all when the panel's attention is
switched off - the Studio was previously reporting a target with attention
`off`, which the demo form never did. Chrome retargets on a click but not on a
passing pointer, so the field a human is working on survives the trip to the
panel that acts on it (GAP-02 directives read that focus).

Measured before and after, same page, same browser:

| Pointer at | Before | After |
|---|---|---|
| empty Studio canvas, no fields yet | `Point to or select a form field` | `Pointing at: Untitled form (Studio canvas)` |
| Studio title input / palette | `Point to or select a form field` | `Pointing at: Untitled form (Studio canvas)` |
| Fill tab field 2 | `Short answer` (the stale Build row) | `Long answer` (the field under the pointer) |
| any Studio row, attention `off` | still reported a target | silent, highlight included |

The two canvases now sit behind one `role="tablist"` at the top of the
workspace - "Build your own form" (first) and "Fill the sample form" - so only
one is on the page and the panel can never name a surface nobody can see. Both
tabs stay in the Tab order (no roving `tabindex`), arrow keys move between
them, and the choice is stored in `localStorage` behind try/catch.

Gate numbers for that change:

- `node --test`: 480 of 480 passed, 0 failed
- all ten browser smokes plus `smoke:companion-mcp` exit 0 on Chrome/152.0.7977.65; `npm run proof` 10 of 10 passed; `check:secrets` PASS; `check:architecture` exit 0; `build:pages` 36 files, dist module graph 20 files all present, Studio panel first in the dist markup
- `CURRENT_INTERACTIVE_CONTROL_COUNT` re-measured **38 → 35** on the canvas the workspace opens on: the sample form's five controls leave the default view and the two switcher tabs join it. At the 390 px viewport the walk reports 35 interactive, 35 reachable, 35 focus-visible, 35 unique in the Tab sequence
- every smoke that reads sample-form fields now activates the "Fill the sample form" tab with a trusted click first; `smoke:contrast` switches back to the Studio tab for its Studio section, and the zoom census in `smoke:webmcp` deliberately still runs on the default canvas
- the switcher's two tab buttons pass the pixel contrast audit unchanged (minimum contrast 4.57); `flex-wrap` on the tab row was required, because at 200 % zoom the two labels overflowed the column horizontally

## The panel folds, and says what its marks mean

A reader met the whole panel at once: six sections, every control of every one
of them, and seven Unicode glyphs standing in for icons. The sections are now
native disclosures. Model seat, Attention lens and Role stay open because they
carry the live state; Conversation is deliberately not foldable, because a
shared session that can hide its own talk is no longer shared; Handoff and
Verified receipts start closed and open themselves the moment a grant, an
absence or a first receipt exists. A fold the reader sets by hand is kept in
`localStorage` behind try/catch; a fold the panel opens for them is help for
that sitting and is never written back. The mode selector and the pause control
left their heading rows on the way in - a control inside a `<summary>` answers
the click meant for the disclosure.

The marks come from one family now: monoline, a 24-unit box, stroked in
`currentColor`, written inline. The three status steps carry their path data in
`packages/reference-ui`, beside the labels they belong to, so the embedded
panel, the extension side panel and the Desktop Companion draw the same three
without any of them holding a copy. No icon font, no sprite, no asset that can
fail to load. `Push to talk` and `Stop voice` show a microphone and a crossed
microphone, on both surfaces that carry them.

Two wordings were added where the panel had been silent: the proposals now say
that a click there is the authorization, and a line under them says how a
proposal goes away - 60 seconds (`OFFER_LIFETIME_MS` in `builder-cowork.js`,
`60_000` in `app.js`), at most three at once (`MAX_PENDING_OFFERS`, and the
view model's `slice(0, 3)`), and an edit of your own clears the stale ones
(the page-version filter in `expireOffers`). There is no Dismiss control,
because it would only do early what already happens.

Gate numbers for that change:

- `node --test`: 483 of 483 passed, 0 failed
- `smoke:accessibility`, `smoke:webmcp`, `smoke:surface`, `smoke:builder`,
  `smoke:contrast`, `smoke:companion`, `smoke:companion-cockpit`,
  `smoke:companion-native`, `smoke:companion-webmcp` and `smoke:companion-mcp`
  all exit 0 on Chrome/152.0.7977.77 and .65; `check:secrets` PASS;
  `check:architecture` exit 0; `build:pages` 36 files, `build:companion` 22
  (`icon-32.png` joined the artifact)
- `CURRENT_INTERACTIVE_CONTROL_COUNT` re-measured **35 → 34** on the canvas the
  workspace opens on: five section summaries join the walk, the Role section's
  detail disclosure trades its demo button for a summary of its own, and the
  folded Handoff section takes its six controls out of the default view. At the
  390 px viewport the walk reports 34 interactive, 34 named in the AX tree, 34
  reachable, 34 focus-visible, 34 unique in the Tab sequence, horizontal
  overflow 0
- the nine native tool names and the tool count are untouched; this change is
  the surface only
- `smoke:contrast` still audits ten states with a minimum contrast of 4.57
- three smokes and the panel tour open the Handoff section, and two of them the
  Role detail, before reaching into either: a trusted click needs the control
  visible, which is exactly the step a reader takes. Nothing was removed from
  what they prove
- `design/panel-tour/` re-captured from a locally served copy of this branch,
  because `capture.mjs` shoots the deployed URL by default and this is not
  deployed: exit 0, all five images, all ten markers found and re-measured in
  the browser, so the overlay still points at what it names. `docs/panel-tour.md`
  records which URL the current set came from
- the capture is what caught the one real defect this change introduced: the
  two surface buttons lost their icons on the first render, because `render()`,
  `openInCompanion()` and its catch each wrote the whole button's
  `textContent`. All four sites now go through one `setButtonLabel()` that
  writes the label node and leaves the icon alone - and through the panel's own
  `$()`, whose fallback to the panel element is what keeps the detached
  Picture-in-Picture surface working. `button.textContent` still reads as the
  label alone, which is what `smoke:surface` and `smoke:companion-mcp` assert

## The bridge at rest (2026-09-04)

A bridge has a place; a vehicle carries a model across it. Both surfaces that
are bridges now say which of four things is true of their place, and both were
measured saying it.

- **The extension's Side Panel, rest to rest.** `npm run smoke:companion-cockpit`
  drives the shipped panel through `resting -> arriving -> crossing -> leaving ->
  resting` at 390x844 in Chrome for Testing 152 and records each step. The
  validator rejects a step that offers the attention lens or the actor controls
  with no model on the bridge, one that hides the on/off switch, one that drops
  the shared bridge mark, and a journey with the arrival missing. Report field:
  `bridgeRestArriveDepartClaim: true`. The resting frame is
  `cockpit-00-bridge-resting.png` when `COWORK_COMPANION_EVIDENCE_DIR` is set.
- **Only an agent fills the bridge.** `npm run smoke:companion-webmcp` reads the
  real content runtime on a page the extension registered its four tools into:
  `bridgeEmptyBeforeAgent: true` with the relay enabled and no agent yet, and
  `panelBridgeAfterAgent: "crossing"` after the agent's own
  `cowork_read_focus` / `cowork_read_presence` / `cowork_offer_action` calls.
  Enabling the relay and pressing panel controls are the human's hand and do
  not count.
- **The page's own bridge, same behaviour.** `npm run smoke:builder` switches
  demo mode off and observes `data-bridge="leaving"` with *The model left the
  bridge.*, then `resting` with the model seat still shown and the attention
  lens, receipts and actor controls gone; switching demo mode back on gives
  `arriving` with *A model is coming across the bridge.* and then `crossing`
  with the lens back. Report field: `bridgeRestAndArrivalClaim: true`.
- **A connected Companion is not a resting bridge.** The first cut of the fold
  hid the offer list and its receipts while the Desktop Companion held the
  session, which took the click with them: `smoke:surface` and
  `smoke:companion-mcp` both failed. The rule now applies only to the bridge's
  own three states, and both smokes pass.
- **The accessibility baseline is unchanged at 34.**
  `CURRENT_INTERACTIVE_CONTROL_COUNT` still measures 34 interactive, named,
  reachable, focus-visible and Tab-unique controls in
  `npm run smoke:accessibility` and `npm run smoke:webmcp`, because demo mode is
  on at load: the seat is occupied and the page opens with a model already on
  the bridge. That number therefore describes the panel *with* a model, which is
  the state a visitor meets. The resting walk is a different, smaller one and is
  covered where it is produced, by the demo switch in `smoke:builder`.
- **Timeout.** Ninety seconds of agent silence is the departure, chosen to
  outlast a slow model turn plus a tool round trip and to fall short of leaving
  a panel open in front of an agent that stopped answering. A standing offer
  overrides it for as long as the person takes to decide, because an offer
  waiting for a click is an agent waiting for an answer.
- **Gates at this commit.** `node --test` 496 of 496; pages artifact 36 files;
  extension artifact 22 files; `check:secrets` and `check:architecture` pass.
- **Panel tour re-recorded** from a locally served copy of this branch
  (`COWORK_PANEL_TOUR_URL=http://127.0.0.1:4191/apps/formbuilder-showcase/`),
  adding `panel-bridge-resting.png` and replacing the stale extension frame with
  a crossing and a resting one from the cockpit smoke.

## Answer choices reach the field, not the label (2026-09-04)

- **Measured against `qwen3.8:27b-mlx`** through the real suggester and transport: "create a field that asks the question how many kids do you have and answer options are 1 2 3 4 5 6 7 8 or more" returned `checkbox-single`, the label `How many kids do you have?` with no choices in it, and `["1","2","3","4","5","6","7","8 or more"]` as a list, in 21.3 s and again in 18.9 s. Before the change the same request produced a Choose-one field labelled `How many kids do you have? (1, 2, 3, 4, 5, 6, 7, 8+)` whose options stayed "Option 1, Option 2" - the offer value could only say `<paletteId>: <label>`, and the 350-character transcript spent 243 on the fixed instruction, cutting the human's own 110-character sentence at 106 so the model never read the choices and invented its own. Instruction now 214 characters, goal intact; `node --test` 508 pass.

## Explicitly not yet evidenced

- screen-reader practice and final submission-asset branding;
- connected ChatGPT-agent WebMCP discovery and invocation beyond the accepted Chrome in-page client;
- real microphone permission, captured speech and audibly confirmed spoken output;
- remote preferred-model demonstration through the host transport; the local Qwen provider path is accepted;
- the reported 390px hero-lede/form-intro clipping regression: not reproduced under a genuinely fixed 390px CSS viewport in this environment (see the Fable-operator review batch note above); needs reproduction with a tool that reliably honors a true 390px viewport before it can be confirmed or fixed.
- the FormBuilder Studio `.fodt` export was proven well-formed XML by a dependency-free tag-balance parser and inspected manually, but not opened in a real LibreOffice install in this environment; the OASIS Flat ODF template it fills in was written and reviewed by hand against the format's public specification, not verified by round-tripping it through LibreOffice.
- sending a filled-in FormBuilder Studio form by mail and collecting responses back into one place (noted as a roadmap item, not a claim, in `apps/formbuilder-showcase/README.md`).
- the FormBuilder Studio's own three Cowork sections were removed and their behaviour folded into the one Cowork panel (see "One Cowork surface (panel fold)" above). The separate-presence-readout gap this list previously carried is closed by the grant being adopted as the session lease. The fold is measured: the gate numbers in that section are results, not placeholders.
- `builder-directive-classifier.js`'s recognized phrases (required/optional/move up or down/"make this the first question") are a small, disclosed keyword heuristic, the same kind of scripted stand-in `local-conversation.js` already is - not a claim that the Builder understands natural language.
- a real Claude Code, Codex CLI or agy session using the Companion over MCP: the stdio client in `npm run smoke:companion-mcp` is a test client written for this repository, and no run by a shipped agent has been measured.
