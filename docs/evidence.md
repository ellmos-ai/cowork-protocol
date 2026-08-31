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
| Core jury journey is reproducible without credentials | `npm run proof`; `packages/evals/test/juror-proof.test.js` | Eight deterministic integration steps proven, including an exact-id conversation reply; output explicitly denies browser and host-token claims |
| Independent code review closed the baseline release findings | Claude Code 2.1.251 with the Fable model reviewed the full tree and the bounded baseline follow-up diffs | Baseline verdict `Ready to publish code: Yes` with no Critical or Important findings; two later context-request attempts and one 240-second visibility/delta review attempt timed out without output, while the final cockpit review retry was refused by the account's monthly spend limit, so those increments are not claimed as Fable-reviewed |
| Public-preview tree is reproducible | clean clone of local `release/public-preview` at `6dfc848277495903121b4f3fd414dd6a6f96d8e6` | `npm ci`, 161/161 tests, 12/12 character evals, 8/8 proof steps, no-WebMCP extension plus native WebMCP/model-host/accessibility/contrast Chrome 152 smokes, 19-file Pages and 10-file extension builds, 75 source plus 22 built-artifact syntax checks, 0 vulnerabilities, 0 secret findings and clean Git readback |
| Post-audit protocol/surface split is release-gated | implementation commit `008942e27e556edca014006258335af67e462ee8`; complete local gate on 2026-08-31 | 205/205 tests, 12/12 character evals, 8/8 proof steps, adapter demo, 100 source syntax checks, 22-file Pages and 16-file extension builds, architecture/secret/audit gates, plus legacy extension, Native-first extension, model-host, native WebMCP, surface handoff, accessibility and contrast Chrome 152 smokes all passed |
| A Fable-operator review batch is release-gated | commits `0dd7633`, `8b24ea8`, `549512d`, `10fd665`, `d21443b` (5 commits interleaved with a parallel README update) on `release/public-preview`; complete local gate on 2026-08-31 | 259/259 tests, 12/12 character evals, 8/8 proof steps, adapter demo, architecture validation, 0 high-confidence secret findings, 23-file Pages and 18-file browser-companion builds, plus the extended 390px accessibility smoke (25/25 named and keyboard-reachable controls, 0 document-level overflow, 0 page-wide overflowing text elements) all passed |
| Local browser fallback is interactive | connected Edge extension plus isolated headless Edge smoke against the local showcase | Exact-value offer, real click, page-version change, verified receipt, Adjust feedback, brief/longer AFK fail-closed/delegated/return, visible lease expiry, agent pause/Human Solo, first 12 keyboard focus stops, and context-preview fail-closed/success states accepted; `document.modelContext` absent, so no WebMCP claim |
| Audio controls fail safely under rapid activation | speech-controller tests plus isolated Chrome 152 SpeechRecognition/synthesis smoke | Two immediate activations produce no uncaught error; 22 synthesis voices and active synthesis observed; fake device returned `audio-capture`, so real microphone and audible output remain open |
| Current interaction surface is keyboard, zoom and narrow-layout coherent | `npm run smoke:accessibility`; Chrome 152 accessibility tree, real Tab dispatch, 390×844 viewport and true 200% page-zoom pass | Current 25/25 browser AX controls are named, all 25 Tab stops are visible with focus, 390px overflow is 0, and all controls remain reachable at 200% with bounded layout rounding; screen-reader practice remains open |
| Rendered text contrast covers the collaboration state matrix | `visual-theme.test.js`; `pixel-contrast-smoke.test.js`; `npm run smoke:contrast` | Chrome 152 audited 902 visible text items across 10 exact states: 0 unsupported, 0 failures, unrounded minimum 4.565644512773976:1; focused and working targets are labeled as well as colored; Listening is a visual fake-recognition boundary and makes no audio claim |
| Showcase has an accepted light, premium visual direction | `visual-theme.test.js`; inspected Chrome 152 captures at 1440×1200 and 390×844; rendered contrast smoke | Opaque warm reading surface, restrained gold, blue and teal hierarchy, six protected source pairs and the 10-state rendered contrast matrix accepted |

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
tests, the 12-case character-budget eval, the eight-step juror proof,
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

## Explicitly not yet evidenced

- screen-reader practice and final submission-asset branding;
- connected ChatGPT-agent WebMCP discovery and invocation beyond the accepted Chrome in-page client;
- real microphone permission, captured speech and audibly confirmed spoken output;
- remote preferred-model demonstration through the host transport; the local Qwen provider path is accepted;
- final updated YouTube demo and final Devpost field readback. The Devpost project is already published and submitted to The WebMCP Challenge.
- the reported 390px hero-lede/form-intro clipping regression: not reproduced under a genuinely fixed 390px CSS viewport in this environment (see the Fable-operator review batch note above); needs reproduction with a tool that reliably honors a true 390px viewport before it can be confirmed or fixed.
- the FormBuilder Studio `.fodt` export was proven well-formed XML by a dependency-free tag-balance parser and inspected manually, but not opened in a real LibreOffice install in this environment; the OASIS Flat ODF template it fills in was written and reviewed by hand against the format's public specification, not verified by round-tripping it through LibreOffice.
- sending a filled-in FormBuilder Studio form by mail and collecting responses back into one place (noted as a roadmap item, not a claim, in `apps/formbuilder-showcase/README.md`).
