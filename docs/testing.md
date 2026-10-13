# Testing strategy

[English](testing.md) · [Deutsch](testing_de.md) · [Project README](../README.md)


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
- work-mode matrix tests proving the click right is derived from the three status answers rather than chosen, that a model never executes without a valid grant or lease, and that an expired record visibly downgrades it to advising;
- session tests for attempt-based lease accounting, bounded receipts and visible lease expiry;
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
- Browser Bridge unit/build tests for stable versus sensitive DOM targets, bounded screenshot crop geometry, the restricted page-message allowlist and the self-contained Manifest V3 artifact;
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

## Command-by-command reference

These contracts explain what each named command establishes and where its evidence stops. Dated browser outcomes are collected in the [evidence ledger](evidence.md#accepted-browser-runs).

### What each check proves

`npm run demo:adapter` is a deterministic host-contract harness. It selects all three paths with explicit fixtures: native Cowork, host-supplied WebMCP and no-WebMCP legacy companion. The latter reads a semantic target and one bounded context tier through host callbacks. The output explicitly keeps browser-wide discovery, an extension transport and a connected model client false; those require a real browser host or extension and separate acceptance evidence.

`npm run eval` reports `adapter-characters`, defined here as JavaScript UTF-16 code units rather than browser or model tokens. Its twelve cases verify the 350-unit focus, change and feedback budgets; the 160/161 selected-text boundary; silence and unchanged-state suppression; one-step expansion; latest-only event and conversation snapshots; the bounded bridge catalog summary; the 1,200-unit bridge read-result preview; and a complete conversation packet below its 1,200-character ceiling without inventing unavailable host telemetry.

`npm run proof` is a deterministic ten-step juror dry-run. It exercises the real focus, one-shot related-context request, latest-only conversation inbox and bounded reply, offer, human-click authorization, verified change and feedback, scoped AFK lease, collaborative form design (a `form-add-field` offer applied to an empty canvas and independently verified), a full delegation-grant → utterance-authorized directive → awaiting-feedback → verdict loop (a `form-update-field` change authorized by a human-utterance grant instead of a click, then held for a real Good/Adjust/Different verdict), and FormBuilder export contracts in seconds. Its output explicitly sets `browserClaim: false` and `hostTokenClaim: false`; it is reproducible core evidence, not a substitute for the required live WebMCP browser demonstration.

`npm run check:architecture` validates the published architecture artifact: it reports the supported connector paths, the provider-neutral surface claim, the accessible SVG and the rendered PNG dimensions, so the diagram cannot drift away from the connector paths the code actually offers.

`npm run smoke:companion` builds the actual Manifest V3 extension and loads it into a fresh profile for the selected browser. Historical accepted extension runs used Chrome for Testing; this care run used Edge 154. Chrome was unavailable in this care run, so it was not tested. The fixture explicitly disables WebMCP. The smoke proves that no Cowork page world exists before a trusted `_execute_action` shortcut grants temporary `activeTab` access and injects the relay. It then requires toggle-on/off behavior, a stable pointer target, exact 350/1,200-character semantic tiers, a real 400×400 PNG pointer crop that is consumable once only inside the isolated extension host, an inert extension-origin Side Panel offer and a trusted browser click followed by verified mutation. It also requires `pageUiInjected: false`. The three historical Chrome-based extension-smoke runs used Chrome for Testing. In one recorded run, the branded Chrome 152.0.7977.77 build under test ignored `--load-extension`; support for the flag depends on the browser build. To install Chrome for Testing into a project-local cache, for example, run `npx @puppeteer/browsers install chrome@152.0.7977.65 --path ./browser-cache`; set `COWORK_COMPANION_BROWSER_PATH` or `COWORK_CHROME_PATH` to select a browser outside that cache. If the selected build does not load extensions headlessly, set `COWORK_COMPANION_HEADFUL=1` and `COWORK_COMPANION_VISIBLE=1`; the bounded pixel proof needs the temporary test window to remain on-screen. The report does not claim a connected model, host tokens or delivery of the full page.

`npm run smoke:companion-cockpit` renders the shipped Side Panel code at an
exact 390×844 CSS viewport with a bounded runtime fixture. It captures and
validates the four work modes one relayed page can reach: sparring with the
model advising while the human executes, sparring with the human advising while
the model executes, the model working alone, and the human working alone. The
validator requires zero horizontal overflow, named controls and the complete
nine-control keyboard order, and executes the real focus and context instruments. Set
`COWORK_COMPANION_EVIDENCE_DIR` to retain the four PNG frames and JSON report.
The accepted Native/WebMCP/Bridge states all remain `executionMode: structured`
and the smoke fails if they falsely display the Computer Use pointer.

`npm run smoke:companion-native` runs the complementary Native-first branch.
With WebMCP enabled on FormBuilder, the extension must discover nine Cowork
tools in the page's main execution world, return a native focus packet, keep
the legacy fallback inactive and keep all extension UI outside the page DOM.

`npm run smoke:companion-webmcp` covers the route in between. On a fixture page
with no Cowork tools of its own, the extension registers `cowork_read_focus`,
`cowork_request_context`, `cowork_offer_action` and `cowork_read_presence`
through WebMCP and answers them from its own bounded relay, so any WebMCP agent
in the browser can read focus and propose there. The Side Panel reports this as
the `bridge-webmcp` route and still carries no model seat of its own; the
proposed value changes nothing until a trusted click in the panel.

`npm run smoke:webmcp` starts the showcase and an isolated Chrome profile, enables the current Chrome WebMCP testing features, and discovers exactly the nine Cowork tools. It executes ten tool calls: focus, one-shot context, two inert visible offers, latest change, latest feedback, latest conversation turn, one bounded reply, `cowork_read_presence` and `cowork_execute_solo`. Chrome DevTools dispatches trusted clicks that authorize the exact visible field values, human feedback, the local helper offer, the WebMCP reply offer, and a real Delegated-lease "briefly away" click; the solo call afterward is verified directly through `document.modelContext.executeTool()` with no click at all, matching a genuine AFK model call. Neither offer tool nor reply tool authorizes or applies a value on its own. In the same browser runtime, a host-supplied two-tool calendar fixture proves the portable bridge: two read calls execute, an oversized result becomes a 1,200-character preview, and the booking mutation remains `offer-only` without reaching the host executor. The report distinguishes `browserHostClaim: true` from `foreignLiveSiteClaim: false`. It requires Chrome 150 or newer; set `COWORK_CHROME_PATH` when Chrome is installed outside the usual Windows, macOS or Linux locations. It never uses a personal browser profile or a non-local page.

`npm run smoke:model-host` starts the real same-origin host route with a deterministic reply fixture and a fresh Chrome profile. It requires the browser to discover the bridge, deliver exactly one bounded turn without page HTML or authorization credentials, display `Grace Hopper` as an inert offer, and change the field only after a trusted click. Its output explicitly keeps external- and connected-model claims false; this proves the host plumbing, not a provider response.

To repeat the optional provider-backed acceptance against an already available compatible endpoint, set `COWORK_ACCEPT_CONNECTED_MODEL=1` together with the model-host variables before the same smoke command. A passing provider run adds `preferredModelClaim: true` and `connectedModelClaim: true`; a loopback endpoint still keeps `externalModelClaim: false`. No model is downloaded by this command.

`npm run smoke:surface` proves the no-install Embed → Document PiP → Embed → Desktop Companion journey in
  Chrome. Its complete continuity contract is listed under [Surface continuity acceptance
  details](#surface-continuity-acceptance-details).

### Surface continuity acceptance details

The smoke exercises the Cowork-owned continuity path without an extension. Chrome moves FormBuilder's selected
  reference UI from Embed to Document Picture-in-Picture and back, grants the user-mediated loopback permission,
  sends one exact snapshot plus compact context to the Companion, and applies the two contiguous authority
  deltas for Desktop surface and model seat. After handoff it first requires an immediate token-free
  `page-visible` report, then emits a real hidden visibility change, requires the Companion authority to receive
  only the bounded `SurfaceEvent` without a model request, commits deterministic background work, returns the
  page to visible and requires the page replica to pull and apply every intervening delta. It then opens a
  separate 430×760 Companion window with zero horizontal overflow, verifies the shared reference identity,
  visible page-availability indicator, actual host model identifier and three audio controls, and drives the
  real actor buttons through collaborating, observing, paused and short-away presentations. Short-away stays
  dormant without a lease, while a later bounded lease produces the directional Agent-Solo relay. The smoke
  selects a cockpit background and requires it plus the same shared session to survive a Companion reload,
  captures the visual states, submits one deterministic turn through the serialized Model Gateway, observes
  human plus assistant context, and confirms that the embedded model input is disabled after handoff.

`npm run smoke:accessibility` opens another isolated Chrome profile at an exact 390×844 CSS viewport. It requires exactly 36 non-ignored interactive browser accessibility nodes (including the FormBuilder Studio Build/Fill/Export controls, the ARIA `tab` role and Chrome's `DisclosureTriangle` role for the panel's collapsible sections alongside `button`/`checkbox`/`combobox`/`link`/`textbox`; the Studio's Delegate and Directive controls are gone, and with them the last `spinbutton` on the page, while the folded Handoff section keeps its six controls out of the default view) with non-empty names and unique DOM identities, then drives the same number of real Tab events and requires every stop to remain visible with `:focus-visible`. It also clicks the embedded model through observing, paused and collaborating and the human through brief-away, long-away and present. Horizontal control/text clipping and more than one pixel of document overflow fail the gate. This is browser accessibility-tree and keyboard/layout evidence, not screen-reader practice.

`npm run smoke:builder` opens the FormBuilder Studio Build/Fill/Export section in an isolated Chrome profile and proves it end to end with no agent involved: add a field from the palette, fill it in on the Fill tab, submit a valid `formularerstellen-response-v1` response, and confirm all three export controls are present. It then proves one addressable field (not just the canvas) can be pointed at and targeted (GAP-00) — the page's one Cowork panel, not a second surface inside the Studio, is where that target is read back — and that the Cowork integration is click-gated like everything else: a "Model suggests a field" offer stays inert in the panel's offer list until a real trusted click, after which exactly one verified receipt appears there. It then drives the full delegation flow through the panel's own handover buttons: stepping away under a canvas-scoped grant adds six fields with no per-field click (GAP-01/GAP-04), "I'm back" reports what changed and highlights exactly those fields and waits for a verdict (GAP-03/GAP-05), a real feedback click resolves it, and a recognized directive ("make it required") applies with no offer chip and no second click (GAP-02) — the smoke types it into the panel's conversation input, so what is proven is the `human-utterance` authorization origin, not speech recognition or a microphone before entering awaiting-feedback again. It also checks that `document.modelContext.getTools().length` (when WebMCP is enabled) is still 9.

`npm run smoke:contrast` uses a separate temporary Chrome profile and audits the actual rendered foreground against Chrome-resolved background ranges. It requires exactly eleven collaboration states (ten Cowork demo states plus one FormBuilder Studio state, `builder-offer-visible`: a Studio field suggestion visible as an offer chip — which now means a chip in the Cowork panel, since the Studio no longer has an offer list of its own), at least 30 visible text items in every state, zero unresolved backgrounds and an unrounded 4.5:1 minimum for every audited range. The deterministic Listening state substitutes only the recognition boundary; it does not claim microphone capture or audible output.

## Reproducible juror dry-run

`npm run proof` is the deterministic ten-step integration journey described in [What each check proves](#what-each-check-proves). It exits non-zero on failure and reports `browserClaim: false` and `hostTokenClaim: false`.

## Connected-browser acceptance snapshot

A connected Edge extension session loaded the local showcase and explicitly reported that `document.modelContext` was unavailable. Within that honest fallback boundary, a real browser click selected a field, created an exact-value offer, authorized it, changed page version 1 to 2 and produced one verified receipt. A subsequent `Adjust` click recorded bounded human feedback. Brief and longer AFK both failed closed until delegated mode and a focus existed, then exposed distinct presence text and an Agent Solo lease; return restored Cowork with a bounded summary. Pausing the agent switched the visible mode to Human Solo, and resume restored the agent. Twelve consecutive Tab presses followed the skip link, the four form controls, export, attention controls, action mode, offer and pause controls in logical order. A later headless Edge smoke verified that the context-preview button reports `STALE_FOCUS` before focus and returns one 110-adapter-character related field context after a pointer focus, while still showing `WebMCP unavailable`.

## Native WebMCP browser snapshot

The runner waits for a complete document, page-owned
`modelContext.getTools` and the rendered `Native WebMCP` state before invoking
a tool, so browser registration startup is not mistaken for product absence.

`npm run smoke:webmcp` used Chrome 152.0.7977.64 with the current WebMCP testing features and a fresh temporary profile. The secure local origin exposed `registerTool`, `getTools` and `executeTool`; the showcase reported `Native WebMCP`; Chrome discovered exactly nine Cowork tools and completed ten tool calls, the eight read/offer/reply calls plus `cowork_read_presence` and `cowork_execute_solo`. Focus contained 9 adapter characters and the target-bound one-shot expansion contained 110. Two native offer calls exposed `Ada Lovelace` and then `Lukas Geiger` while leaving the field unchanged. Two trusted browser clicks applied and verified those exact values; two further trusted clicks recorded `Good`. Native change and feedback reads each returned only the second of two events with `omittedCount: 1`, while retaining the offer, trusted-click and observed-change references. A second bounded typed turn was returned through `cowork_read_turn`; `cowork_reply_turn` matched its exact id and exposed one inert visible offer, which changed the field only after another trusted click. Chrome 152 accepted JSON-string arguments through its current in-page execution surface after rejecting the newer object form, and the smoke records that compatibility fact. The report sets `browserClaim: true`, `conversationClaim: true`, `webMcpReplyClaim: true`, `agentClientClaim: false` and `hostTokenClaim: false`. The same smoke was repeated on the installed branded Google Chrome 152.0.7977.77 by setting `COWORK_CHROME_PATH` to `C:\Program Files\Google\Chrome\Application\chrome.exe`, with the same two features enabled; it discovered nine tools. Its report sets `browserClaim: true`, `conversationClaim: true`, `webMcpReplyClaim: true`, `agentClientClaim: false` and `hostTokenClaim: false`. For the earlier extension run, the recorded Chrome 152.0.7977.77 build ignored `--load-extension`; this is a build-specific result, not a blanket claim about branded Chrome.

The same isolated Chrome runtime imported the real bridge module and supplied a calendar-shaped host catalog with one read and one mutation. The bridge emitted two summaries within 350 adapter characters, executed the read tool twice, normalized a small result and reduced a 5,016-character host result to a 1,200-character labeled preview. The mutation stayed `offer-only`, returned `HUMAN_CONFIRMATION_REQUIRED` and never reached the host executor. This sets `browserHostClaim: true` and `foreignLiveSiteClaim: false`: it is browser-host acceptance of the portable adapter, not discovery or invocation on an unrelated live website.

The same Chrome build exposed `SpeechRecognition`, `speechSynthesis` and 22 synthesis voices. After the guarded-session fix, two immediate Push-to-talk activations produced no uncaught exception. The current showcase also accepts a typed fallback. The isolated fake device returned `audio-capture`, so this proves API wiring and rapid-activation safety, not microphone capture, transcript quality or audible speaker output.

The current Chrome smoke submits typed turns through the real conversation UI. Only the compact full-name focus and presence cross the provider-neutral transport. The local demo helper first returns `Lukas` as an exact visible offer; the field remains `Lukas Geiger` until a trusted browser click applies and verifies the suggestion. A later turn is pulled through the two conversation WebMCP tools, and its `Ada Byron` reply offer also remains inert until a trusted click. The report sets `conversationClaim: true`, `webMcpReplyClaim: true`, `connectedModelClaim: false` and `transport: local-demo`.

## Same-origin model-host browser snapshot

`npm run smoke:model-host` used Chrome 152.0.7977.64 with a fresh profile and the production status/turn routes. The page discovered `Connected model bridge`, delivered one exact 468-character turn with compact full-name focus, and sent neither an authorization header nor provider configuration. A deterministic server fixture returned `Grace Hopper` as an offer. The field stayed empty before the trusted browser click, changed only after that click, and produced a verified receipt. This establishes `modelHostClaim: true` and `browserCredentials: false`, while deliberately retaining `externalModelClaim: false` and `connectedModelClaim: false`; no external provider was contacted.

The provider-acceptance mode was then run through the same Chrome page and same-origin routes against an already installed local Ollama 0.32.15 `qwen3:4b`, with `reasoning_effort: none` and a 200-token upstream answer budget. The browser sent one 502-character bounded turn; the actual model produced the exact `Grace Hopper` offer; the field remained empty before the trusted click and the click produced a verified receipt. The report sets `preferredModelClaim: true`, `connectedModelClaim: true`, `providerLocation: local`, `externalModelClaim: false`, and `browserCredentials: false`. This proves a connected preferred-model journey, but neither a remote provider nor a ChatGPT in-app-agent journey.

`npm run smoke:accessibility` re-measured the current Chrome 152 surface after the panel's sections learned to fold. At an exact 390×844 CSS viewport, the browser accessibility tree contained 36 non-ignored interactive nodes and no unnamed control, across `button`, `checkbox`, `combobox`, `link`, `textbox`, the ARIA `tab` role and Chrome's `DisclosureTriangle` role for the panel's collapsible sections. Thirty-six real Tab events followed the skip link, the FormBuilder and Studio controls, export, detachable/Companion controls, both actors and every attention/handoff/conversation/audio control in DOM order; every stop was visible and matched `:focus-visible`. The same run clicked model and human through their full state cycles. The document had zero horizontal overflow and no control or button/select/link text was horizontally clipped. Human and model presence remain expressed as text, pose and symbol in addition to color. This is current browser AX/keyboard/narrow-layout evidence, not screen-reader practice.

The true-browser-zoom portion of `npm run smoke:webmcp` sets Chrome page zoom to 200%, rather than emulating pinch zoom or merely shrinking the viewport. Chrome reported a 712×524 CSS viewport over 1424×1048 physical pixels. All 36 controls remained visible and reachable (the pinned count in `scripts/webmcp-browser-smoke-lib.mjs` followed the panel folds down from 41 through 38 and 35 to 34, then back up to 36 for the `Keep listening` choice and the `Chat window` button; each step is recorded in `docs/evidence.md`); the only reported overflow delta was one pixel of layout rounding, within the gate's explicit bound.

`npm run smoke:contrast` audits rendered foreground/background ranges in eleven required states: native ready, keyboard focus, focused field, validation errors, visible offer, receipt controls, recorded feedback, Agent Solo, Human Solo, Listening and the FormBuilder Studio field suggestion, which is now an offer chip in the one Cowork panel. Chrome 152 contributed CSS background ranges; where Chrome returned no direct opaque range, the runner fails closed unless it can compose solid ancestor colors and alpha exactly. The current result covers 1,398 visible text items, 0 unsupported items and 0 failures, with an unrounded minimum ratio of 4.5656:1. The focused-field marker also requires the default `Follow me` mode and labeled blue `Model focus` spotlight; the visible-offer marker requires the labeled coral `Model working` state. The test enforces 4.5:1 even for large text. Listening uses a deterministic fake `SpeechRecognition` boundary solely to expose that visual state, so this result makes no audio claim.

The showcase visual direction is a light editorial surface with restrained gold decision accents, deep blue actions and teal status cues. A source-level contrast test protects six core variable pairs, while the browser smoke covers the rendered state matrix. Chrome screenshots at 1440×1200 and 390×844 were inspected for hierarchy, clipping and color balance.

## Still required before acceptance

- Connected ChatGPT/in-app-agent discovery and invocation; the current Chrome smoke is an in-page WebMCP client, not an agent conversation.
- A remote preferred-model response through the same-origin host; the local Qwen provider journey is accepted, but no remote provider is claimed.
- Discovery and invocation of an unrelated live website's WebMCP catalog. The isolated Chrome host fixture proves adapter execution but explicitly sets `foreignLiveSiteClaim: false`.
- Real microphone permission, captured speech, silence handling and transcript quality. Rapid repeated activation is now accepted in Chrome 152.
- Screen-reader practice in the intended client. Current browser AX names, complete Tab order, focus indicators, reduced motion, non-color presence text, 390-pixel layout, true 200% browser zoom and the rendered contrast matrix are accepted in Chrome 152 or source-level checks.
- License, public-repository, live-URL and video readbacks before submission. The latest clean-clone reference is recorded in the evidence ledger after each release-proof run.

The connected Edge result proves only the local fallback interaction path. The isolated Chrome result separately proves native WebMCP browser registration, discovery, click-gated action and latest-only readback, but not a connected ChatGPT-agent journey.
