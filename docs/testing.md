# Testing strategy

The test design is risk-based. The most serious failures are excessive context, simulated human consent, lease escape and a connector claiming native guarantees without a stable target.

## Fast blocking gate

Run on every local change and future commit:

```powershell
npm test
npm run eval
```

This gate contains:

- unit tests for 160/161 and 350-character boundaries;
- decision-table tests for presence and solo-lease limits;
- session tests for action-mode rights, attempt-based lease accounting, bounded receipts and visible lease expiry;
- negative tests for agent-simulated confirmation, stale focus and stale page versions;
- negative tests preventing read-only capabilities from becoming mutations and proving visible chips carry the exact authorized value;
- negative tests for synthetic feedback, unknown feedback verdicts and overstated causal confidence;
- interaction-log tests proving unchanged values emit no change and feedback snapshots return only the latest event;
- context-router tests for silence, unchanged state and one-step escalation;
- an integration test from the real FormBuilder connector output through the WebMCP tool callback;
- a registration contract test for the current `document.modelContext.registerTool()` shape, including the latest-only change and feedback tools;
- bridge tests for bounded host catalogs, missing schemas, required arguments and offer-only mutation handling.
- legacy tests for ephemeral versus stable targets, 350/1,200-character semantic tiers, rejected level jumps and the 160,000-pixel visual request ceiling.

Tests use the real protocol and connector. Only the browser-owned `ModelContext` boundary is represented by a small contract fake, because Node does not implement WebMCP.

The eval output deliberately uses `adapter-characters`. It does not convert characters to tokens or claim visibility into a browser/agent host. A passing run covers ten named cases, including latest-only 350-character change and feedback snapshots, reports both included and avoided source characters where meaningful, and records the bounded visual request without claiming an image was captured.

## Reproducible juror dry-run

Run `npm run proof` for a compact integration journey through the actual protocol and FormBuilder packages. The six steps cover native field focus, an offer that cannot authorize itself, a matching human click, verified causal change plus feedback, a scoped AFK lease and the real `formularerstellen-response-v1` export. The command exits non-zero if any step fails and reports both `browserClaim: false` and `hostTokenClaim: false` so this local proof cannot be mistaken for browser acceptance.

## Still required before acceptance

- Browser system test in ChatGPT's in-app browser or supported Chrome with WebMCP enabled.
- Host-level proof that a foreign WebMCP tool catalog can actually be supplied and invoked; the local bridge test is not discovery evidence.
- Visible human-click test proving an agent tool argument cannot authorize a mutation.
- FormBuilder end-to-end focus → offer → click → verified receipt.
- FormBuilder end-to-end receipt → trusted feedback click → latest-only WebMCP readback.
- AFK return, lease expiry and pause paths in the visible panel.
- Accessibility check for keyboard-only controls, focus order, labels and non-color status cues.
- Clean-clone, license, secret-scan, live URL and video readbacks before submission.

No local unit or contract test is presented as a live browser acceptance result.
