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
| WebMCP Bridge is bounded and fail-closed | `packages/bridge/test/webmcp-bridge.test.js`; Chrome 152 browser-host fixture in `npm run smoke:webmcp` | Two host-supplied capabilities, two reads, 1,200-character preview and offer-only mutation proven in-browser; unrelated live-site discovery open |
| Adaptive runtime selects the strongest supplied layer | `packages/bridge/test/runtime.test.js`; `npm run demo:adapter` | Native → generic WebMCP → legacy-host selection and fail-closed exhaustion proven with host fixtures; no browser-wide discovery claim |
| Legacy host companion is bounded and click-gated | `packages/bridge/test/legacy-bridge.test.js`; `packages/bridge/test/companion.test.js`; visual eval; `npm run demo:adapter` | Semantic tiers, explicit bounded visual-delivery callback and offer/confirm/action callback chain proven; real extension attachment, capture and trusted-event readback open |
| Core jury journey is reproducible without credentials | `npm run proof`; `packages/evals/test/juror-proof.test.js` | Eight deterministic integration steps proven, including an exact-id conversation reply; output explicitly denies browser and host-token claims |
| Independent code review closed the baseline release findings | Claude Code 2.1.251 with the Fable model reviewed the full tree and the bounded baseline follow-up diffs | Baseline verdict `Ready to publish code: Yes` with no Critical or Important findings; two read-only Fable attempts for the later context-request diff timed out without output, so that increment is not claimed as Fable-reviewed |
| Public-preview tree is reproducible | clean clone of local `release/public-preview` at `e384fcec39fb5692f8e338ec4157881bb3d70fb3` | `npm ci`, 105/105 tests, 11/11 character evals, 7/7 proof steps, native Chrome 152 human-loop/browser-host/200%-zoom smoke, 10-state rendered contrast smoke, 16-file Pages build, 47 tracked-source plus 10 built-artifact syntax checks, 0 vulnerabilities, 0 secret findings and clean scoped history |
| Local browser fallback is interactive | connected Edge extension plus isolated headless Edge smoke against the local showcase | Exact-value offer, real click, page-version change, verified receipt, Adjust feedback, brief/longer AFK fail-closed/delegated/return, visible lease expiry, agent pause/Human Solo, first 12 keyboard focus stops, and context-preview fail-closed/success states accepted; `document.modelContext` absent, so no WebMCP claim |
| Audio controls fail safely under rapid activation | speech-controller tests plus isolated Chrome 152 SpeechRecognition/synthesis smoke | Two immediate activations produce no uncaught error; 22 synthesis voices and active synthesis observed; fake device returned `audio-capture`, so real microphone and audible output remain open |
| Current interaction surface is keyboard, zoom and narrow-layout coherent | `npm run smoke:accessibility`; Chrome 152 accessibility tree, real Tab dispatch, 390×844 viewport and true 200% page-zoom pass | Current 21/21 browser AX controls are named, all 21 Tab stops are visible with focus, 390px overflow is 0, and all controls remain reachable at 200% with bounded layout rounding; screen-reader practice remains open |
| Rendered text contrast covers the collaboration state matrix | `visual-theme.test.js`; `pixel-contrast-smoke.test.js`; `npm run smoke:contrast` | Chrome 152 audited 649 visible text items across 10 exact states: 0 unsupported, 0 failures, unrounded minimum 4.565644512773976:1; Listening is a visual fake-recognition boundary and makes no audio claim |
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

Local release preparation: a clean clone of model-host commit `7ab89692c7f6fadcb374e35134f43f0711ef962d` passed `npm ci`, 148/148 Node tests, 12/12 character evals, 8/8 proof steps, the 468-character click-gated model-host fixture, native Chrome 152 discovery of nine Cowork tools plus local helper/WebMCP-reply/browser-host/200%-zoom smokes, the current 21-control accessibility-tree/Tab/390px smoke, the 10-state rendered contrast smoke with 649 audited text items, a 19-file Pages build, 0 secret findings, 0 dependency vulnerabilities and a clean Git readback. This commit is local and has not been pushed during this gate.

The independent Fable reviews reproduced the release-relevant capability, state, budget, lease, offer and JSON/Unicode boundary failures before their fixes. The resulting tests now cover read-only capability rejection, exact visible click arguments, core-level offer-summary bounds, attempt-based Solo accounting, bounded receipts, lease-expiry presentation, enforced action-mode rights, isolated over-budget tool identities, lossless JSON arguments and Unicode-safe truncation. The final Fable follow-up found no Critical or Important issue.

## Explicitly not yet evidenced

- screen-reader practice and final submission-asset branding;
- connected ChatGPT-agent WebMCP discovery and invocation beyond the accepted Chrome in-page client;
- real microphone permission, captured speech and audibly confirmed spoken output;
- public GitHub repository readback; the current GitHub repository is private, while the local root license is MIT;
- deployed live URL;
- remote preferred-model demonstration through the host transport; the local Qwen provider path is accepted;
- final updated YouTube demo and final Devpost field readback. The Devpost project is already published and submitted to The WebMCP Challenge.
