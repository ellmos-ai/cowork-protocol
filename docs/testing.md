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
- conversation tests proving silence and Human Solo make no host call, turns contain only bounded utterance/focus/presence data, replies never execute offers and overlong proposed values fail closed;
- native browser-evidence validation that rejects a partial tool catalog, an unbounded/reusable context expansion, a prematurely applied offer or feedback not bound to the latest verified offer;
- rendered-contrast validation that rejects missing interaction states, unresolved backgrounds and any text/background range below an unrounded 4.5:1 ratio;
- an integration test from the real FormBuilder connector output through the WebMCP tool callback;
- a registration contract test for the current `document.modelContext.registerTool()` shape, including the latest-only change and feedback tools;
- bridge tests for 350-code-unit host capability summaries, isolated rejection of an identity that cannot fit after JSON escaping, JSON-normalized small results and read-result previews, malformed or duplicate declarations, unserializable results, required arguments and offer-only mutation handling;
- adaptive runtime tests proving native-first selection, fallback to a usable host WebMCP catalog, fallback to the no-WebMCP companion, code-only probe diagnostics and fail-closed exhaustion;
- no-WebMCP companion tests for callback-backed semantic tiers, bounded visual delivery, explain-only ephemeral targets, inert visible offers and execution only after a matching human-click confirmation;
- Unicode-boundary tests proving bounded protocol text, parameter names, dynamically fitted descriptions, WebMCP bridge previews and legacy summaries never end with half of a surrogate pair;
- action-surface tests proving expired, stale or malformed stored offers disappear, expiry timers are schedulable, visible values stay within 350 Unicode code points and `form.clear_value` cannot silently rewrite a non-empty proposal;
- lease validation tests for non-negative integer attempt counts, positive integer limits and malformed scope arrays;
- legacy tests for ephemeral versus stable targets, 350/1,200-code-unit semantic tiers, rejected level jumps and the 160,000-pixel visual request ceiling.

Tests use the real protocol and connector. Only the browser-owned `ModelContext` boundary is represented by a small contract fake, because Node does not implement WebMCP.

`npm run demo:adapter` is the reference host harness for the adaptive runtime. It executes native, generic WebMCP and legacy-companion fixtures, including the explicit visual-region callback and the visible-offer/confirm/action callback chain. It is deterministic library evidence, not proof of browser-wide discovery, extension transport or a connected model client.

The eval output deliberately uses `adapter-characters`, defined as JavaScript UTF-16 code units. It does not convert those units to tokens or claim visibility into a browser/agent host. A passing run covers eleven named cases, including the native target-bound 1,200-unit context request, the 1,200-unit bridge read-result preview and latest-only 350-unit change and feedback snapshots, reports both included and avoided source units where meaningful, and records the bounded visual request without claiming an image was captured.

## Reproducible juror dry-run

Run `npm run proof` for a compact integration journey through the actual protocol and FormBuilder packages. The seven steps cover native field focus, a reasoned one-shot related-context request, an offer that cannot authorize itself, a matching human click, verified causal change plus feedback, a scoped AFK lease and the real `formularerstellen-response-v1` export. The command exits non-zero if any step fails and reports both `browserClaim: false` and `hostTokenClaim: false` so this local proof cannot be mistaken for browser acceptance.

## Connected-browser acceptance snapshot

A connected Edge extension session loaded the local showcase and explicitly reported that `document.modelContext` was unavailable. Within that honest fallback boundary, a real browser click selected a field, created an exact-value offer, authorized it, changed page version 1 to 2 and produced one verified receipt. A subsequent `Adjust` click recorded bounded human feedback. Brief and longer AFK both failed closed until delegated mode and a focus existed, then exposed distinct presence text and an Agent Solo lease; return restored Cowork with a bounded summary. Pausing the agent switched the visible mode to Human Solo, and resume restored the agent. Twelve consecutive Tab presses followed the skip link, the four form controls, export, attention controls, action mode, offer and pause controls in logical order. A later headless Edge smoke verified that the context-preview button reports `STALE_FOCUS` before focus and returns one 110-adapter-character related field context after a pointer focus, while still showing `WebMCP unavailable`.

## Native WebMCP browser snapshot

`npm run smoke:webmcp` used Chrome 152.0.7977.64 with the current WebMCP testing features and a fresh temporary profile. The secure local origin exposed `registerTool`, `getTools` and `executeTool`; the showcase reported `Native WebMCP`; Chrome discovered exactly seven Cowork tools and completed six tool calls. Focus contained 9 adapter characters and the target-bound one-shot expansion contained 110. Two native offer calls exposed `Ada Lovelace` and then `Lukas Geiger` while leaving the field unchanged. Two trusted browser clicks applied and verified those exact values; two further trusted clicks recorded `Good`. Native change and feedback reads each returned only the second of two events with `omittedCount: 1`, while retaining the offer, trusted-click and observed-change references. Chrome 152 accepted JSON-string arguments through its current in-page execution surface after rejecting the newer object form, and the smoke records that compatibility fact. The report sets `browserClaim: true`, `agentClientClaim: false` and `hostTokenClaim: false`.

The same isolated Chrome runtime imported the real bridge module and supplied a calendar-shaped host catalog with one read and one mutation. The bridge emitted two summaries within 350 adapter characters, executed the read tool twice, normalized a small result and reduced a 5,016-character host result to a 1,200-character labeled preview. The mutation stayed `offer-only`, returned `HUMAN_CONFIRMATION_REQUIRED` and never reached the host executor. This sets `browserHostClaim: true` and `foreignLiveSiteClaim: false`: it is browser-host acceptance of the portable adapter, not discovery or invocation on an unrelated live website.

The same Chrome build exposed `SpeechRecognition`, `speechSynthesis` and 22 synthesis voices. After the guarded-session fix, two immediate Push-to-talk activations produced no uncaught exception. The current showcase also accepts a typed fallback. The isolated fake device returned `audio-capture`, so this proves API wiring and rapid-activation safety, not microphone capture, transcript quality or audible speaker output.

The current Chrome smoke submits `Can you fill this for me?` through the real conversation UI. Only the compact full-name focus and presence cross the provider-neutral transport. The local demo helper returns `Lukas` as an exact visible offer; the field remains `Lukas Geiger` until a trusted browser click applies and verifies the suggestion. The report sets `conversationClaim: true`, `connectedModelClaim: false` and `transport: local-demo`.

Before the typed conversation controls were added, a separate Chrome 152 accessibility pass found 19 interactive accessibility-tree nodes and no unnamed control. Real Tab key dispatch followed the skip link, four FormBuilder controls, export, every then-current Cowork attention/action/handoff control, Speak replies, Push to talk and Stop voice; each active control was visible and had a 3-pixel focus outline. Human and agent presence were expressed as `Human present` and `Agent active` text in addition to color. At a 390×844 viewport the document had zero horizontal overflow and no control crossed the viewport edge. The current 21-control surface has separately passed true 200% zoom and rendered contrast; a refreshed accessibility-tree/name/narrow-layout pass remains required together with screen-reader practice.

The true-browser-zoom portion of `npm run smoke:webmcp` sets Chrome page zoom to 200%, rather than emulating pinch zoom or merely shrinking the viewport. Chrome reported a 712×524 CSS viewport over 1424×1048 physical pixels. All 21 controls remained visible and reachable; the only reported overflow delta was one pixel of layout rounding, within the gate's explicit bound.

`npm run smoke:contrast` audits rendered foreground/background ranges in ten required states: native ready, keyboard focus, focused field, validation errors, visible offer, receipt controls, recorded feedback, Agent Solo, Human Solo and Listening. Chrome 152 contributed CSS background ranges; where Chrome returned no direct opaque range, the runner fails closed unless it can compose solid ancestor colors and alpha exactly. The current result covers 649 visible text items, 0 unsupported items and 0 failures, with an unrounded minimum ratio of 4.565644512773976:1. The test enforces 4.5:1 even for large text. Listening uses a deterministic fake `SpeechRecognition` boundary solely to expose that visual state, so this result makes no audio claim.

The showcase visual direction is a light editorial surface with restrained gold decision accents, deep blue actions and teal status cues. A source-level contrast test protects six core variable pairs, while the browser smoke covers the rendered state matrix. Chrome screenshots at 1440×1200 and 390×844 were inspected for hierarchy, clipping and color balance.

## Still required before acceptance

- Connected ChatGPT/in-app-agent discovery and invocation; the current Chrome smoke is an in-page WebMCP client, not an agent conversation.
- Discovery and invocation of an unrelated live website's WebMCP catalog. The isolated Chrome host fixture proves adapter execution but explicitly sets `foreignLiveSiteClaim: false`.
- A real browser extension or equivalent host transport supplying semantic snapshots, visual-region delivery and trusted-click callbacks on websites that expose neither Cowork Protocol nor WebMCP. The package contract and deterministic host harness are implemented; browser-wide attachment and acceptance remain open.
- Real microphone permission, captured speech, silence handling and transcript quality. Rapid repeated activation is now accepted in Chrome 152.
- Screen-reader practice in the intended client. Current names, Tab order, focus indicators, reduced motion, non-color presence text, 390-pixel layout, true 200% browser zoom and the rendered contrast matrix are accepted in Chrome 152 or source-level checks.
- License, public-repository, live-URL and video readbacks before submission. The latest clean-clone reference is recorded in the evidence ledger after each release-proof run.

The connected Edge result proves only the local fallback interaction path. The isolated Chrome result separately proves native WebMCP browser registration, discovery, click-gated action and latest-only readback, but not a connected ChatGPT-agent journey.
