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
- conversation tests proving silence and Human Solo make no host call, turns contain only bounded utterance/focus/presence data, the inbox exposes one latest unique turn, stale/replayed replies fail closed, replies never execute offers and overlong proposed values fail closed;
- model-host tests proving exact turn validation, same-origin discovery, server-only credentials, generic failure messages and OpenAI-compatible reply normalization;
- native browser-evidence validation that rejects a partial tool catalog, an unbounded/reusable context expansion, a prematurely applied offer or feedback not bound to the latest verified offer;
- rendered-contrast validation that rejects missing interaction states, unresolved backgrounds and any text/background range below an unrounded 4.5:1 ratio;
- current-surface accessibility validation that rejects unnamed browser AX controls, duplicate DOM identities, an incomplete Tab path or narrow-layout clipping/overflow;
- an integration test from the real FormBuilder connector output through the WebMCP tool callback;
- a registration contract test for the current `document.modelContext.registerTool()` shape, including latest-only change, feedback and conversation tools;
- bridge tests for 350-code-unit host capability summaries, isolated rejection of an identity that cannot fit after JSON escaping, JSON-normalized small results and read-result previews, malformed or duplicate declarations, unserializable results, required arguments and offer-only mutation handling;
- adaptive runtime tests proving native-first selection, fallback to a usable host WebMCP catalog, fallback to the no-WebMCP companion, code-only probe diagnostics and fail-closed exhaustion;
- no-WebMCP companion tests for callback-backed semantic tiers, bounded visual delivery, explain-only ephemeral targets, inert visible offers and execution only after a matching human-click confirmation;
- Browser Companion unit/build tests for stable versus sensitive DOM targets, bounded screenshot crop geometry, the restricted page-message allowlist and the self-contained Manifest V3 artifact;
- integration-policy tests proving protocol-only, automatic selected UI and user-activated selected UI stay provider-neutral;
- Session Authority and Companion Link tests for contiguous revisions, stale-surface rejection, persistence, exact snapshot handoff and pull-only page replication;
- Context Manager and Handoff Capsule tests for deterministic compaction, bounded newest-turn projection and restart continuity without HTML/history replay;
- Model Gateway tests proving one renewable exclusive seat, serialized inference, exact turn-ID deduplication and fail-closed provider-context separation;
- Desktop Companion host, cockpit UI, app-window and Windows tray tests covering loopback/origin gates, persisted context, shared turns, collaborating/observing/paused engagement, lease-truthful relay state and green/yellow/red presence projection;
- Unicode-boundary tests proving bounded protocol text, parameter names, dynamically fitted descriptions, WebMCP bridge previews and legacy summaries never end with half of a surrogate pair;
- action-surface tests proving expired, stale or malformed stored offers disappear, expiry timers are schedulable, visible values stay within 350 Unicode code points and `form.clear_value` cannot silently rewrite a non-empty proposal;
- lease validation tests for non-negative integer attempt counts, positive integer limits and malformed scope arrays;
- legacy tests for ephemeral versus stable targets, 350/1,200-code-unit semantic tiers, rejected level jumps and the 160,000-pixel visual request ceiling.

Tests use the real protocol and connector. Only the browser-owned `ModelContext` boundary is represented by a small contract fake, because Node does not implement WebMCP.

`npm run demo:adapter` is the reference host harness for the adaptive runtime. It executes native, generic WebMCP and legacy-companion fixtures, including the explicit visual-region callback and the visible-offer/confirm/action callback chain. It is deterministic library evidence, not proof of browser-wide discovery, extension transport or a connected model client.

`npm run smoke:companion` is the real no-WebMCP extension acceptance. It builds `dist-browser-companion`, starts Chrome for Testing 152 in a fresh profile, loads the unpacked Manifest V3 artifact and explicitly disables WebMCP on the fixture page. It first requires that no Cowork MAIN bridge or extension isolated world exists. A real `_execute_action` browser accelerator then grants temporary `activeTab` access and performs on-demand injection. The enabled relay must expose a stable pointer target, return exactly bounded 350- and 1,200-character semantic tiers, capture and immediately crop a real 400×400 PNG, deliver that crop once only inside the isolated extension host, keep a Side Panel exact-value offer inert, accept a trusted browser click, verify the new field value and toggle off again. The page must contain no injected Cowork UI root. The report sets `browserCompanionClaim`, `userInitiatedActiveTabClaim`, `sidePanelSurfaceClaim`, `visualCaptureClaim` and `visualDeliveryOneShot` true and `pageUiInjected` false while keeping model-client, external-model, host-token and full-page-delivery claims false.

`npm run smoke:companion-native` is the complementary Native-first acceptance. It enables WebMCP on FormBuilder and loads the same extension. Before the trusted accelerator there may be no Cowork extension world; afterward the on-demand main-world bridge must discover nine native Cowork tools, while the isolated extension runtime reports `mode: native-cowork`, returns the page's native focus packet, keeps `fallbackActive: false` and inserts no visual root into the page.

`npm run smoke:companion-cockpit` isolates the production Side Panel visual
surface from the fallback pixel-capture pipeline. Chrome renders the shipped
HTML/CSS/JS at 390×844 and drives the real controls through Cowork,
observe-only, paused and leased Agent-Solo presentations. The validator
requires zero horizontal overflow, no clipped or unnamed controls, the exact
nine-control keyboard sequence and real focus/context instrument responses. It
also requires `executionMode: structured` with the Computer Use pointer hidden
in every current state, preventing the bounded bridge from impersonating the
more expensive visual-control executor.

`npm run smoke:surface` exercises the Cowork-owned continuity path without an extension. Chrome moves FormBuilder's selected reference UI from Embed to Document Picture-in-Picture and back, grants the user-mediated loopback permission, sends one exact snapshot plus compact context to the Companion, and applies the two contiguous authority deltas for Desktop surface and model seat. After handoff it first requires an immediate token-free `page-visible` report, then emits a real hidden visibility change, requires the Companion authority to receive only the bounded SurfaceEvent without a model request, commits deterministic background work, returns the page to visible and requires the page replica to pull and apply every intervening delta. It then opens a separate 430×760 Companion window with zero horizontal overflow, verifies the shared reference identity, visible page-availability indicator, actual host model identifier and three audio controls, and drives the real actor buttons through collaborating, observing, paused and short-away presentations. Short-away stays dormant without a lease, while a later bounded lease produces the directional Agent-Solo relay. The smoke selects a cockpit background and requires it plus the same shared session to survive a Companion reload, captures the visual states, submits one deterministic turn through the serialized Model Gateway, observes human plus assistant context, and confirms that the embedded model input is disabled after handoff.

The eval output deliberately uses `adapter-characters`, defined as JavaScript UTF-16 code units. It does not convert those units to tokens or claim visibility into a browser/agent host. A passing run covers twelve named cases, including the native target-bound 1,200-unit context request, the 1,200-unit bridge read-result preview, latest-only 350-unit change and feedback snapshots, and a complete latest-only conversation turn below 1,200 units. It reports both included and avoided source units where meaningful and records the bounded visual request without claiming an image was captured.

## Reproducible juror dry-run

Run `npm run proof` for a compact integration journey through the actual protocol and FormBuilder packages. The eight steps cover native field focus, a reasoned one-shot related-context request, a latest-only conversation turn with an exact-id reply, an offer that cannot authorize itself, a matching human click, verified causal change plus feedback, a scoped AFK lease and the real `formularerstellen-response-v1` export. The command exits non-zero if any step fails and reports both `browserClaim: false` and `hostTokenClaim: false` so this local proof cannot be mistaken for browser acceptance.

## Connected-browser acceptance snapshot

A connected Edge extension session loaded the local showcase and explicitly reported that `document.modelContext` was unavailable. Within that honest fallback boundary, a real browser click selected a field, created an exact-value offer, authorized it, changed page version 1 to 2 and produced one verified receipt. A subsequent `Adjust` click recorded bounded human feedback. Brief and longer AFK both failed closed until delegated mode and a focus existed, then exposed distinct presence text and an Agent Solo lease; return restored Cowork with a bounded summary. Pausing the agent switched the visible mode to Human Solo, and resume restored the agent. Twelve consecutive Tab presses followed the skip link, the four form controls, export, attention controls, action mode, offer and pause controls in logical order. A later headless Edge smoke verified that the context-preview button reports `STALE_FOCUS` before focus and returns one 110-adapter-character related field context after a pointer focus, while still showing `WebMCP unavailable`.

## Native WebMCP browser snapshot

The runner waits for a complete document, page-owned
`modelContext.getTools` and the rendered `Native WebMCP` state before invoking
a tool, so browser registration startup is not mistaken for product absence.

`npm run smoke:webmcp` used Chrome 152.0.7977.64 with the current WebMCP testing features and a fresh temporary profile. The secure local origin exposed `registerTool`, `getTools` and `executeTool`; the showcase reported `Native WebMCP`; Chrome discovered exactly nine Cowork tools and completed eight tool calls. Focus contained 9 adapter characters and the target-bound one-shot expansion contained 110. Two native offer calls exposed `Ada Lovelace` and then `Lukas Geiger` while leaving the field unchanged. Two trusted browser clicks applied and verified those exact values; two further trusted clicks recorded `Good`. Native change and feedback reads each returned only the second of two events with `omittedCount: 1`, while retaining the offer, trusted-click and observed-change references. A second bounded typed turn was returned through `cowork_read_turn`; `cowork_reply_turn` matched its exact id and exposed one inert visible offer, which changed the field only after another trusted click. Chrome 152 accepted JSON-string arguments through its current in-page execution surface after rejecting the newer object form, and the smoke records that compatibility fact. The report sets `browserClaim: true`, `conversationClaim: true`, `webMcpReplyClaim: true`, `agentClientClaim: false` and `hostTokenClaim: false`.

The same isolated Chrome runtime imported the real bridge module and supplied a calendar-shaped host catalog with one read and one mutation. The bridge emitted two summaries within 350 adapter characters, executed the read tool twice, normalized a small result and reduced a 5,016-character host result to a 1,200-character labeled preview. The mutation stayed `offer-only`, returned `HUMAN_CONFIRMATION_REQUIRED` and never reached the host executor. This sets `browserHostClaim: true` and `foreignLiveSiteClaim: false`: it is browser-host acceptance of the portable adapter, not discovery or invocation on an unrelated live website.

The same Chrome build exposed `SpeechRecognition`, `speechSynthesis` and 22 synthesis voices. After the guarded-session fix, two immediate Push-to-talk activations produced no uncaught exception. The current showcase also accepts a typed fallback. The isolated fake device returned `audio-capture`, so this proves API wiring and rapid-activation safety, not microphone capture, transcript quality or audible speaker output.

The current Chrome smoke submits typed turns through the real conversation UI. Only the compact full-name focus and presence cross the provider-neutral transport. The local demo helper first returns `Lukas` as an exact visible offer; the field remains `Lukas Geiger` until a trusted browser click applies and verifies the suggestion. A later turn is pulled through the two conversation WebMCP tools, and its `Ada Byron` reply offer also remains inert until a trusted click. The report sets `conversationClaim: true`, `webMcpReplyClaim: true`, `connectedModelClaim: false` and `transport: local-demo`.

## Same-origin model-host browser snapshot

`npm run smoke:model-host` used Chrome 152.0.7977.64 with a fresh profile and the production status/turn routes. The page discovered `Connected model bridge`, delivered one exact 468-character turn with compact full-name focus, and sent neither an authorization header nor provider configuration. A deterministic server fixture returned `Grace Hopper` as an offer. The field stayed empty before the trusted browser click, changed only after that click, and produced a verified receipt. This establishes `modelHostClaim: true` and `browserCredentials: false`, while deliberately retaining `externalModelClaim: false` and `connectedModelClaim: false`; no external provider was contacted.

The provider-acceptance mode was then run through the same Chrome page and same-origin routes against an already installed local Ollama 0.32.15 `qwen3:4b`, with `reasoning_effort: none` and a 200-token upstream answer budget. The browser sent one 502-character bounded turn; the actual model produced the exact `Grace Hopper` offer; the field remained empty before the trusted click and the click produced a verified receipt. The report sets `preferredModelClaim: true`, `connectedModelClaim: true`, `providerLocation: local`, `externalModelClaim: false`, and `browserCredentials: false`. This proves a connected preferred-model journey, but neither a remote provider nor a ChatGPT in-app-agent journey.

`npm run smoke:accessibility` refreshed the current Chrome 152 surface after the actor controls were added. At an exact 390×844 CSS viewport, the browser accessibility tree contained 25 non-ignored interactive nodes and no unnamed control: 14 buttons, 2 checkboxes, 3 comboboxes, 1 link and 5 textboxes. Twenty-five real Tab events followed the skip link, four FormBuilder controls, export, detachable/Companion controls, both actors and every attention/action/handoff/conversation/audio control in DOM order; every stop was visible and matched `:focus-visible`. The same run clicked model and human through their full state cycles. The document had zero horizontal overflow and no control or button/select/link text was horizontally clipped. Human and model presence remain expressed as text, pose and symbol in addition to color. This is current browser AX/keyboard/narrow-layout evidence, not screen-reader practice.

The true-browser-zoom portion of `npm run smoke:webmcp` sets Chrome page zoom to 200%, rather than emulating pinch zoom or merely shrinking the viewport. Chrome reported a 712×524 CSS viewport over 1424×1048 physical pixels. All 25 controls remained visible and reachable; the only reported overflow delta was one pixel of layout rounding, within the gate's explicit bound.

`npm run smoke:contrast` audits rendered foreground/background ranges in ten required states: native ready, keyboard focus, focused field, validation errors, visible offer, receipt controls, recorded feedback, Agent Solo, Human Solo and Listening. Chrome 152 contributed CSS background ranges; where Chrome returned no direct opaque range, the runner fails closed unless it can compose solid ancestor colors and alpha exactly. The current result covers 902 visible text items, 0 unsupported items and 0 failures, with an unrounded minimum ratio of 4.565644512773976:1. The focused-field marker also requires the default `Follow me` mode and labeled blue `Model focus` spotlight; the visible-offer marker requires the labeled coral `Model working` state. The test enforces 4.5:1 even for large text. Listening uses a deterministic fake `SpeechRecognition` boundary solely to expose that visual state, so this result makes no audio claim.

The showcase visual direction is a light editorial surface with restrained gold decision accents, deep blue actions and teal status cues. A source-level contrast test protects six core variable pairs, while the browser smoke covers the rendered state matrix. Chrome screenshots at 1440×1200 and 390×844 were inspected for hierarchy, clipping and color balance.

## Still required before acceptance

- Connected ChatGPT/in-app-agent discovery and invocation; the current Chrome smoke is an in-page WebMCP client, not an agent conversation.
- A remote preferred-model response through the same-origin host; the local Qwen provider journey is accepted, but no remote provider is claimed.
- Discovery and invocation of an unrelated live website's WebMCP catalog. The isolated Chrome host fixture proves adapter execution but explicitly sets `foreignLiveSiteClaim: false`.
- Real microphone permission, captured speech, silence handling and transcript quality. Rapid repeated activation is now accepted in Chrome 152.
- Screen-reader practice in the intended client. Current browser AX names, complete Tab order, focus indicators, reduced motion, non-color presence text, 390-pixel layout, true 200% browser zoom and the rendered contrast matrix are accepted in Chrome 152 or source-level checks.
- License, public-repository, live-URL and video readbacks before submission. The latest clean-clone reference is recorded in the evidence ledger after each release-proof run.

The connected Edge result proves only the local fallback interaction path. The isolated Chrome result separately proves native WebMCP browser registration, discovery, click-gated action and latest-only readback, but not a connected ChatGPT-agent journey.
