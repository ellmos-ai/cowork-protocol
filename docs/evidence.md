# Local evidence ledger

This public ledger distinguishes implemented contracts from live acceptance. Counts are evidence snapshots, not promises that future commits will retain the same totals.

| Claim | Local evidence | Status boundary |
|---|---|---|
| Focus packets enforce 160/161 and 350-character rules | `packages/core/test/focus-packet.test.js`; `npm run eval` | Local contract proven; no host-token claim |
| Silence and unchanged state emit no packet | `packages/core/test/context-router.test.js`; eval cases | Local contract proven |
| Agent offers cannot authorize themselves | `packages/core/test/action-authorization.test.js` | Local negative path proven; trusted browser click acceptance open |
| Change causality is explicit, reference-bounded and latest-only | `packages/core/test/change-feedback.test.js`; `interaction-log.test.js`; eval case | Local delta/digest contract proven; live browser observation open |
| Feedback requires a human click and exposes only the latest event | `change-feedback.test.js`; `interaction-log.test.js`; eval case | Local negative/budget path proven; trusted browser click acceptance open |
| Solo work is lease-scoped | `packages/core/test/solo-lease.test.js`; FormBuilder connector action tests | Local limits proven; background/browser continuity open |
| Six Native WebMCP tools register and clean up | `packages/native-webmcp/test/registration.test.js` | Contract fake proven; real client discovery/invocation open |
| FormBuilder web validation/export is retained | attributed engine, `formbuilder-use-case.test.js`; upstream Web Companion 48/48 tests | Web logic proven; visual browser flow open |
| WebMCP Bridge is bounded and fail-closed | `packages/bridge/test/webmcp-bridge.test.js` | Explicit host-catalog adapter proven; foreign discovery open |
| Legacy fallback is bounded | `packages/bridge/test/legacy-bridge.test.js`; visual eval | Request contract proven; DOM snapshot/image capture open |
| Core jury journey is reproducible without credentials | `npm run proof`; `packages/evals/test/juror-proof.test.js` | Six deterministic integration steps proven; output explicitly denies browser and host-token claims |
| Independent code review closed the release-relevant findings | Claude Code 2.1.251 with the Fable model reviewed the full tree, then re-reviewed the bounded fix diff | Initial verdict `With fixes`; five Critical/Important paths fixed test-first; re-review verdict `Ready to publish code: Yes` with no Critical or Important findings |
| Public-preview tree is reproducible | clean clone of local `release/public-preview` at `540b659725db7a685b3921791eaaeed8861e0630` | `npm ci --ignore-scripts`, 54/54 tests, 10/10 token evals, 6/6 proof steps, 15-file Pages build, 38 syntax checks, 0 vulnerabilities, 0 secret findings, HTTP 200 for root/showcase/native module/license |

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

Local release preparation: `release/public-preview` at tested commit `540b659725db7a685b3921791eaaeed8861e0630` had the same tree as `main`, retained safe history through `c86eea4`, and excluded internal Prepare paths from its ancestry. It was not pushed; the repository had no remote.

The independent Fable review reproduced one release-blocking capability/value-visibility path and four Important state/budget inconsistencies. The resulting tests now cover read-only capability rejection, exact visible click arguments, core-level offer-summary bounds, attempt-based Solo accounting, bounded receipts, lease-expiry presentation and enforced action-mode rights. A focused Fable re-review verified all five paths closed and found no new Critical or Important issue.

## Explicitly not yet evidenced

- visual quality in a supported browser;
- live WebMCP client discovery and invocation;
- microphone permission, speech recognition and spoken output;
- public GitHub repository and license detection;
- deployed live URL;
- public YouTube video;
- Devpost project creation or submission.
