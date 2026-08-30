# Local evidence ledger

This public ledger distinguishes implemented contracts from live acceptance. Counts are evidence snapshots, not promises that future commits will retain the same totals.

| Claim | Local evidence | Status boundary |
|---|---|---|
| Focus packets enforce 160/161 and 350-code-unit rules | `packages/core/test/focus-packet.test.js`; `npm run eval` | Local contract proven; no host-token claim |
| Silence and unchanged state emit no packet | `packages/core/test/context-router.test.js`; eval cases | Local contract proven |
| An agent can request one related context level without receiving the page | context-router, FormBuilder connector and native registration tests; eval, juror proof and Chrome 152 WebMCP smoke | Target binding, reason bound and 1,200-character one-shot response proven; Chrome invoked a 110-character response, connected-agent invocation open |
| Agent offers cannot authorize themselves | `packages/core/test/action-authorization.test.js`; connected Edge fallback interaction | Local negative path and real local click path proven; WebMCP-hosted click acceptance open |
| Change causality is explicit, reference-bounded and latest-only | `packages/core/test/change-feedback.test.js`; `interaction-log.test.js`; eval case | Local delta/digest contract proven; live browser observation open |
| Feedback requires a human click and exposes only the latest event | `change-feedback.test.js`; `interaction-log.test.js`; eval case; connected Edge fallback interaction | Local negative/budget path and real feedback click proven; WebMCP readback open |
| Solo work is lease-scoped | `packages/core/test/solo-lease.test.js`; FormBuilder connector action tests; connected Edge fallback interaction | Local limits, brief/longer delegated AFK, visible real-time expiry, return summary and agent-pause/Human-Solo path proven; background continuity open |
| Seven Native WebMCP tools register and clean up | `packages/native-webmcp/test/registration.test.js`; `npm run smoke:webmcp` | Contract fake plus Chrome 152 discovery and two read-only invocations proven; connected-agent journey open |
| FormBuilder web validation/export is retained | attributed engine, `formbuilder-use-case.test.js`; upstream Web Companion 48/48 tests; connected Edge fallback interaction | Web logic and click-gated field change proven; full visual/WebMCP flow open |
| WebMCP Bridge is bounded and fail-closed | `packages/bridge/test/webmcp-bridge.test.js` | Explicit host-catalog adapter proven; foreign discovery open |
| Legacy fallback is bounded | `packages/bridge/test/legacy-bridge.test.js`; visual eval | Request contract proven; DOM snapshot/image capture open |
| Core jury journey is reproducible without credentials | `npm run proof`; `packages/evals/test/juror-proof.test.js` | Seven deterministic integration steps proven; output explicitly denies browser and host-token claims |
| Independent code review closed the baseline release findings | Claude Code 2.1.251 with the Fable model reviewed the full tree and the bounded baseline follow-up diffs | Baseline verdict `Ready to publish code: Yes` with no Critical or Important findings; two read-only Fable attempts for the later context-request diff timed out without output, so that increment is not claimed as Fable-reviewed |
| Public-preview tree is reproducible | clean clone of local `release/public-preview` at `a1b2bc0` | `npm ci`, 89/89 tests, 11/11 character evals, 7/7 proof steps, native Chrome 152 WebMCP smoke, 16-file Pages build, 43 syntax checks, 0 vulnerabilities, 0 secret findings and clean scoped history |
| Local browser fallback is interactive | connected Edge extension plus isolated headless Edge smoke against the local showcase | Exact-value offer, real click, page-version change, verified receipt, Adjust feedback, brief/longer AFK fail-closed/delegated/return, visible lease expiry, agent pause/Human Solo, first 12 keyboard focus stops, and context-preview fail-closed/success states accepted; `document.modelContext` absent, so no WebMCP claim |
| Audio controls fail safely under rapid activation | speech-controller tests plus isolated Chrome 152 SpeechRecognition/synthesis smoke | Two immediate activations produce no uncaught error; 22 synthesis voices and active synthesis observed; fake device returned `audio-capture`, so real microphone and audible output remain open |
| Current interaction surface is keyboard and narrow-layout coherent | Chrome 152 accessibility tree, real Tab dispatch, reduced-motion emulation and 390×844 viewport pass | 19 named interactive nodes, 0 unnamed, visible 3px focus, text presence cues and no horizontal/control overflow proven; screen reader, 200% zoom and pixel contrast remain open |
| Showcase has an accepted light, premium visual direction | `visual-theme.test.js`; inspected Chrome 152 captures at 1440×1200 and 390×844 | Six core text/control pairs meet the 4.5:1 source-level threshold; restrained gold, blue and teal hierarchy accepted; complete composited-pixel contrast review remains open |

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

Local release preparation: `release/public-preview` at tested commit `a1b2bc0` retains the deliberately scoped public history and excludes internal Prepare paths, `_reports`, dependencies and design drafts from its 64 tracked files and ancestry. A fresh single-branch clone passed every local gate listed above. It was not pushed; the repository has no remote.

The independent Fable reviews reproduced the release-relevant capability, state, budget, lease, offer and JSON/Unicode boundary failures before their fixes. The resulting tests now cover read-only capability rejection, exact visible click arguments, core-level offer-summary bounds, attempt-based Solo accounting, bounded receipts, lease-expiry presentation, enforced action-mode rights, isolated over-budget tool identities, lossless JSON arguments and Unicode-safe truncation. The final Fable follow-up found no Critical or Important issue.

## Explicitly not yet evidenced

- screen-reader practice, 200% zoom, complete pixel-based contrast and final submission-asset branding;
- connected ChatGPT-agent WebMCP discovery and invocation beyond the accepted Chrome in-page client;
- real microphone permission, captured speech and audibly confirmed spoken output;
- public GitHub repository and license detection;
- deployed live URL;
- public YouTube video;
- Devpost project creation or submission.
