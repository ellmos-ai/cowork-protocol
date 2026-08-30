# Testing strategy

The test design is risk-based. The most serious failures are excessive context, simulated human consent, lease escape and a connector claiming native guarantees without a stable target.

## Fast blocking gate

Run on every local change and future commit:

```powershell
npm test
npm run eval
```

This gate contains:

- unit tests for 160/161 and 350-code-unit boundaries;
- decision-table tests for presence and solo-lease limits;
- session tests for action-mode rights, attempt-based lease accounting, bounded receipts and visible lease expiry;
- negative tests for agent-simulated confirmation, stale focus, stale page versions and lossy JSON argument values;
- negative tests preventing read-only capabilities from becoming mutations and proving visible chips carry the exact authorized value;
- negative tests for synthetic feedback, unknown feedback verdicts and overstated causal confidence;
- interaction-log tests proving unchanged values emit no change and feedback snapshots return only the latest event;
- context-router tests for silence, unchanged state and one-step escalation;
- an integration test from the real FormBuilder connector output through the WebMCP tool callback;
- a registration contract test for the current `document.modelContext.registerTool()` shape, including the latest-only change and feedback tools;
- bridge tests for 350-code-unit host capability summaries, isolated rejection of an identity that cannot fit after JSON escaping, JSON-normalized small results and read-result previews, malformed or duplicate declarations, unserializable results, required arguments and offer-only mutation handling;
- Unicode-boundary tests proving bounded protocol text, parameter names, dynamically fitted descriptions, WebMCP bridge previews and legacy summaries never end with half of a surrogate pair;
- action-surface tests proving expired, stale or malformed stored offers disappear, expiry timers are schedulable, visible values stay within 350 Unicode code points and `form.clear_value` cannot silently rewrite a non-empty proposal;
- lease validation tests for non-negative integer attempt counts, positive integer limits and malformed scope arrays;
- legacy tests for ephemeral versus stable targets, 350/1,200-code-unit semantic tiers, rejected level jumps and the 160,000-pixel visual request ceiling.

Tests use the real protocol and connector. Only the browser-owned `ModelContext` boundary is represented by a small contract fake, because Node does not implement WebMCP.

The eval output deliberately uses `adapter-characters`, defined as JavaScript UTF-16 code units. It does not convert those units to tokens or claim visibility into a browser/agent host. A passing run covers eleven named cases, including the 1,200-unit bridge read-result preview and latest-only 350-unit change and feedback snapshots, reports both included and avoided source units where meaningful, and records the bounded visual request without claiming an image was captured.

## Reproducible juror dry-run

Run `npm run proof` for a compact integration journey through the actual protocol and FormBuilder packages. The six steps cover native field focus, an offer that cannot authorize itself, a matching human click, verified causal change plus feedback, a scoped AFK lease and the real `formularerstellen-response-v1` export. The command exits non-zero if any step fails and reports both `browserClaim: false` and `hostTokenClaim: false` so this local proof cannot be mistaken for browser acceptance.

## Connected-browser acceptance snapshot

A connected Edge extension session loaded the local showcase and explicitly reported that `document.modelContext` was unavailable. Within that honest fallback boundary, a real browser click selected a field, created an exact-value offer, authorized it, changed page version 1 to 2 and produced one verified receipt. A subsequent `Adjust` click recorded bounded human feedback. Brief and longer AFK both failed closed until delegated mode and a focus existed, then exposed distinct presence text and an Agent Solo lease; return restored Cowork with a bounded summary. Pausing the agent switched the visible mode to Human Solo, and resume restored the agent. Twelve consecutive Tab presses followed the skip link, the four form controls, export, attention controls, action mode, offer and pause controls in logical order.

## Still required before acceptance

- Browser system test in ChatGPT's in-app browser or supported Chrome with WebMCP enabled.
- Host-level proof that a foreign WebMCP tool catalog can actually be supplied and invoked; the local bridge test is not discovery evidence.
- Latest-only change and feedback readback through a real WebMCP client.
- Lease expiry in the visible panel.
- Microphone acceptance including rapid repeated push-to-talk activation in a real SpeechRecognition host.
- Complete accessibility acceptance for all focus states, reduced motion and non-color status cues in the intended browser/client.
- Clean-clone, license, secret-scan, live URL and video readbacks before submission.

The connected Edge result proves only the local fallback interaction path; it is not presented as a live WebMCP acceptance result.
