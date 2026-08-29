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
| Repository is reproducible | clean clone of `aef484d2d552172d89af9d50f07b950da4eebc93` | `npm ci --ignore-scripts`, 46/46 tests, 10/10 evals, 0 vulnerabilities, 0 secret findings, HTTP 200 with feedback copy |

## Commit trail

- `6016dc8a4e7c3e715bb97fc450d41eaab1bf3b6b` — Native protocol, FormBuilder web use case, panel, server and base tests.
- `d9db5257e843925983ac48ee9d54fd7b817312bf` — Bounded host-supplied WebMCP bridge.
- `958134e75be376ccc770bdfb27e4b143464fd7f2` — Character-based token economy eval.
- `c86eea407e0e5625b42afe4cbfe4f3be8e0c108d` — Bounded legacy semantic/visual request bridge.
- `b6fcaae9` — Public evidence separated from internal submission drafts.
- `aef484d2d552172d89af9d50f07b950da4eebc93` — Causal changes, bounded human feedback and latest-only WebMCP reads.

## Explicitly not yet evidenced

- visual quality in a supported browser;
- live WebMCP client discovery and invocation;
- microphone permission, speech recognition and spoken output;
- public GitHub repository and license detection;
- deployed live URL;
- public YouTube video;
- Devpost project creation or submission.
