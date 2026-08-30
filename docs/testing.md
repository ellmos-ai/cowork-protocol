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
- target-bound native context-request tests for the 200-character reason and 1,200-character one-shot expansion boundaries;
- speech-controller tests proving rapid repeated activation starts only one recognition session, idle stop is a no-op and synchronous start failure unlocks retry;
- native browser-evidence validation that rejects a partial tool catalog or an unbounded/reusable context expansion;
- an integration test from the real FormBuilder connector output through the WebMCP tool callback;
- a registration contract test for the current `document.modelContext.registerTool()` shape, including the latest-only change and feedback tools;
- bridge tests for 350-code-unit host capability summaries, isolated rejection of an identity that cannot fit after JSON escaping, JSON-normalized small results and read-result previews, malformed or duplicate declarations, unserializable results, required arguments and offer-only mutation handling;
- Unicode-boundary tests proving bounded protocol text, parameter names, dynamically fitted descriptions, WebMCP bridge previews and legacy summaries never end with half of a surrogate pair;
- action-surface tests proving expired, stale or malformed stored offers disappear, expiry timers are schedulable, visible values stay within 350 Unicode code points and `form.clear_value` cannot silently rewrite a non-empty proposal;
- lease validation tests for non-negative integer attempt counts, positive integer limits and malformed scope arrays;
- legacy tests for ephemeral versus stable targets, 350/1,200-code-unit semantic tiers, rejected level jumps and the 160,000-pixel visual request ceiling.

Tests use the real protocol and connector. Only the browser-owned `ModelContext` boundary is represented by a small contract fake, because Node does not implement WebMCP.

The eval output deliberately uses `adapter-characters`, defined as JavaScript UTF-16 code units. It does not convert those units to tokens or claim visibility into a browser/agent host. A passing run covers eleven named cases, including the native target-bound 1,200-unit context request, the 1,200-unit bridge read-result preview and latest-only 350-unit change and feedback snapshots, reports both included and avoided source units where meaningful, and records the bounded visual request without claiming an image was captured.

## Reproducible juror dry-run

Run `npm run proof` for a compact integration journey through the actual protocol and FormBuilder packages. The seven steps cover native field focus, a reasoned one-shot related-context request, an offer that cannot authorize itself, a matching human click, verified causal change plus feedback, a scoped AFK lease and the real `formularerstellen-response-v1` export. The command exits non-zero if any step fails and reports both `browserClaim: false` and `hostTokenClaim: false` so this local proof cannot be mistaken for browser acceptance.

## Connected-browser acceptance snapshot

A connected Edge extension session loaded the local showcase and explicitly reported that `document.modelContext` was unavailable. Within that honest fallback boundary, a real browser click selected a field, created an exact-value offer, authorized it, changed page version 1 to 2 and produced one verified receipt. A subsequent `Adjust` click recorded bounded human feedback. Brief and longer AFK both failed closed until delegated mode and a focus existed, then exposed distinct presence text and an Agent Solo lease; return restored Cowork with a bounded summary. Pausing the agent switched the visible mode to Human Solo, and resume restored the agent. Twelve consecutive Tab presses followed the skip link, the four form controls, export, attention controls, action mode, offer and pause controls in logical order. A later headless Edge smoke verified that the context-preview button reports `STALE_FOCUS` before focus and returns one 110-adapter-character related field context after a pointer focus, while still showing `WebMCP unavailable`.

## Native WebMCP browser snapshot

`npm run smoke:webmcp` used Chrome 152.0.7977.64 with the current WebMCP testing features and a fresh temporary profile. The secure local origin exposed `registerTool`, `getTools` and `executeTool`; the showcase reported `Native WebMCP`; Chrome discovered exactly seven Cowork tools and executed the read-only focus and context-request tools. The observed focus contained 9 adapter characters and the target-bound one-shot expansion contained 110. Chrome 152 accepted JSON-string arguments through its current in-page execution surface after rejecting the newer object form, and the smoke records that compatibility fact. The report sets `browserClaim: true`, `agentClientClaim: false` and `hostTokenClaim: false`.

The same Chrome build exposed `SpeechRecognition`, `speechSynthesis` and 22 synthesis voices. After the guarded-session fix, two immediate Push-to-talk activations produced no uncaught exception; Reduced Motion reduced the control transition to 0.01 ms, and the three audio controls were present in Chrome's accessibility tree. The isolated fake device returned `audio-capture`, so this proves API wiring and rapid-activation safety, not microphone capture, transcript quality or audible speaker output.

A separate Chrome 152 accessibility pass found 19 interactive accessibility-tree nodes and no unnamed control. Real Tab key dispatch followed the skip link, four FormBuilder controls, export, every Cowork attention/action/handoff control, Speak replies, Push to talk and Stop voice; each active control was visible and had a 3-pixel focus outline. Human and agent presence were expressed as `Human present` and `Agent active` text in addition to color. At a 390×844 viewport the document had zero horizontal overflow and no control crossed the viewport edge. The pass confirms the current keyboard, name, focus, non-color status, reduced-motion and narrow-layout contracts; it is not a substitute for screen-reader practice, 200% zoom or pixel-based contrast review.

The showcase visual direction is a light editorial surface with restrained gold decision accents, deep blue actions and teal status cues. A source-level contrast test checks six foreground/background variable pairs, including primary copy, secondary copy and the gold, coral and primary-action controls, against the WCAG AA 4.5:1 threshold. Chrome screenshots at 1440×1200 and 390×844 were inspected for hierarchy, clipping and color balance. This is a bounded theme acceptance, not a claim that every composited pixel or browser state has received a complete contrast audit.

## Still required before acceptance

- Connected ChatGPT/in-app-agent discovery and invocation; the current Chrome smoke is an in-page WebMCP client, not an agent conversation.
- Host-level proof that a foreign WebMCP tool catalog can actually be supplied and invoked; the local bridge test is not discovery evidence.
- Latest-only change and feedback readback through a real WebMCP client.
- Real microphone permission, captured speech, silence handling and transcript quality. Rapid repeated activation is now accepted in Chrome 152.
- Screen-reader practice, 200% zoom and a complete pixel-based contrast review. Current names, Tab order, focus indicators, reduced motion, non-color presence text, 390-pixel layout and six core theme contrast pairs are accepted in Chrome 152 or source-level checks.
- License, live URL and video readbacks before submission. The local clean-clone, native Chrome WebMCP smoke, secret-scan and dependency-audit gates are complete for the theme-bearing tree at `0bac68c`.

The connected Edge result proves only the local fallback interaction path. The isolated Chrome result separately proves native WebMCP browser registration, discovery and read-only invocation, but not a connected ChatGPT-agent journey.
