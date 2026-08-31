# Post-audit session architecture

Status: accepted implementation direction, 2026-08-31.

This document records the architecture revision agreed after the collaboration
surface audit. It supersedes two assumptions: that the protocol requires the
Cowork UI, and that an embedded panel, detached window and desktop companion
should each own a separate conversation.

## Product decision

Cowork Protocol is a headless, provider-neutral collaboration contract. It
does not require the Cowork reference UI, a Cowork model or a specific chat
provider. The Cowork reference UI is one client of that contract, alongside a
site-selected UI, a provider chat such as Codex or Claude, or another vendor's
compatible surface.

Websites choose one of three page-integration modes:

| Mode | Protocol | In-page UI |
| --- | --- | --- |
| `protocol-only` | available | none |
| `protocol-and-ui` | available | the operator-selected UI mounts automatically |
| `protocol-and-user-optional-ui` | available | the operator-selected UI mounts only after explicit user activation |

This policy governs only what the website mounts in its own document. A user-
selected external surface may still consume the protocol without being
inserted into the page. The reusable contract for this decision lives in
`packages/integration-contract` and identifies UI providers by ordinary stable
IDs; no Cowork provider ID receives special treatment.

The Cowork reference UI itself supports both roles. A website may deliberately
embed it as its selected protocol consumer, so users receive the Cowork
experience without installing anything. The extension hosts that reference
experience outside the page. Moving the extension surface out of the DOM does
not remove or deprecate voluntary page embedding; it removes only automatic UI
injection by the extension. FormBuilder is the first explicit
`protocol-and-ui` reference integration. `packages/reference-ui` supplies
their shared provider identity, human/model icons and presence/mode semantics.
FormBuilder, the Side Panel and Desktop Companion now use the same light
teal/coral/gold visual language while retaining surface-appropriate layouts.

The user may reach a Cowork-owned session through three recognizable reference
surfaces:

1. **Cowork page UI** — explicitly selected by a cooperating website. It can
   remain docked or detach into a browser-owned Document Picture-in-Picture
   window without an extension or application installation.
2. **Cowork Companion** — an independently movable desktop and tray host. After
   one browser permission, a cooperating protocol host can connect to it over a
   local Companion Link without requiring the Cowork browser extension.
3. **Cowork Extension UI** — an optional user-installed client and precision
   bridge. Its UI belongs in the browser-owned Side Panel; only its headless
   relay belongs next to the page. It must first consume native Cowork/WebMCP
   and activate the bounded legacy adapter only when neither is available. The
   both accepted browser slices now prove native Cowork consumption and the
   separate no-WebMCP fallback.

The current `apps/browser-companion` implements the third item as an MV3
extension: the manifest declares a Chrome/Edge Side Panel, the visual surface
runs on the extension origin, and the content script remains headless. Its
native FormBuilder path plus bounded fallback and click gate are browser-tested
without adding a Cowork root to the page DOM. It remains an optional browser
surface, distinct from the no-extension Desktop Companion.

## One session, several surfaces

The tray icon does not contain context. It represents a background Companion
process whose session authority may continue while its full window is hidden.
Every Cowork-owned visible surface is a projection of the same versioned
session. Other providers may use the protocol without using this session UI or
Cowork's private model context.

```text
Site-selected page UI --+
Detached reference UI --+--> Session Authority --> Context Manager --> Model Gateway
Desktop/tray UI ---------+          |
Extension Side Panel ----+          +--> presence, modes, leases, offers,
                                    |    feedback and causal receipts
Provider or other UI -----> Protocol Core --> application capability connection
```

Surface selection, page presentation and application access are negotiated
independently. A surface can move from embedded to detached or desktop while
the action channel remains native WebMCP. Conversely, a desktop surface can
use a native WebMCP page, the optional extension relay or the bounded
accessibility/visual fallback. None of those connectors requires an in-page UI.

## Provider-extension mode

An existing Codex, Claude or other provider chat/extension is a surface choice
made by the human. Cowork must not copy, replace or attempt to control that chat
to pretend that its private conversation context is ours.

In provider-extension mode:

- the provider chat remains the conversation and context authority;
- the human and provider chat use Cowork as infrastructure: modes, presence,
  focus, rights, offers, feedback and WebMCP actions;
- they reach that infrastructure through a cooperating website's native
  Cowork/WebMCP implementation or, where needed, the optional Cowork bridge;
- the website may mount a selected in-page UI, offer it after user activation,
  or remain completely headless;
- the provider surface remains separate unless that provider explicitly
  implements a Cowork surface-host contract;
- a handoff briefing is best-effort and needed only if the human actually
  switches from the provider chat to the Cowork Companion.

This means a user who deliberately works in Codex, Claude or another provider
chat experiences continuity through that visible chat while the foreign tool
uses Cowork's infrastructure. Cowork only guarantees continuity for the
collaboration contract it owns. A third-party chat UI cannot be embedded into
the page merely because the Cowork Embed is present; docking the provider UI
requires cooperation from that provider. The Cowork Companion instead offers
our own collaboration-optimized chat, audio, presence and handoff surface.

## State ownership

| State | Canonical owner |
| --- | --- |
| Form fields and application data | The website/application |
| Goal, presence, mode, focus and active leases | Cowork Session Authority |
| Offers, human authorizations, changes, feedback and receipts | Versioned Cowork event journal |
| Cowork-owned model briefing, recent turns and compact summaries | Cowork Context Manager |
| Provider-chat conversation in provider-led mode | The selected provider surface |
| Cowork provider connection and one active inference queue | Cowork Model Gateway |
| Window position, dock state and local presentation | The selected UI client |

The page remains responsible for executing and verifying its actions. Closing
the page makes page-owned capabilities unavailable. The Companion may retain
the session, prepare work and continue inside an explicit solo lease, but it
must not claim that it changed a closed page unless an independent application
API or MCP service verified that change.

## Session authority and handoff

The session authority emits a full snapshot only for initial join, recovery or
an event-history gap. Normal synchronization uses ordered deltas.

```text
SessionSnapshot
  sessionId, revision, current collaboration state

SessionDelta
  eventId, revision, sourceSurfaceId, causeRefs, changed top-level fields

SurfaceEvent
  page-hidden or page-visible, joined surfaceId, last observed revision

SurfaceLease
  one primary Cowork surface at an exact session revision

SessionBriefing
  <= 1,200 JSON characters for optional model continuity
```

A surface handoff is compare-and-swap: a stale surface cannot silently replace
the primary surface. Replayed or compacted delta ranges fail closed and require
a fresh snapshot. Re-rendering unchanged state creates no event and no model
turn.

After Companion handoff, a page replica does not regain mutation authority in
order to report its initial visibility or a later tab change. It sends one
bounded SurfaceEvent to the loopback authority. The Companion validates the
paired origin, joined session, original page surface and non-future cursor,
then records only the visibility change.
The event carries no HTML, screenshot, semantic context or conversation text
and does not invoke the Model Gateway. A duplicate visibility value creates no
additional revision.

When the Companion is not installed, a cooperating page runtime may be the
temporary authority even if it renders no UI. A detached browser window uses
that same runtime when the site selected the Cowork page UI. When a paired
Companion connects, the protocol host sends one snapshot and the available
event tail; the Companion acknowledges the exact revision and becomes the
authority. The page then remains the application capability provider and, only
if the operator selected a page UI, a synchronized UI replica.

## Shared model context

For Cowork-owned surfaces, the default is one active model seat. Embed,
detached UI and Companion must not independently submit the same user turn.
They send input to one Model Gateway, which serializes inference and builds the
working context from:

- the current goal and collaboration mode;
- compact presence and focus;
- unresolved offers and decisions;
- the latest relevant change and feedback references;
- a short conversation window plus an older summary;
- capability digests cached by version.

The model never receives the event journal, page HTML or screenshots by
default. It requests one higher context level only when the compact briefing is
insufficient.

A provider-owned browser agent may keep private conversation state that Cowork
cannot read. It shares the explicit Cowork protocol state but not its hidden
model memory. If the human stays in that provider surface, no synthetic
cross-provider continuity is required. Transfer between a foreign provider chat
and the Cowork Companion is best-effort and lower priority than making both
paths use the protocol well. If implemented later, a model-seat lease prevents
a Companion model and a provider agent from acting concurrently without an
explicit multi-agent mode.

## Token-economy order

1. Structured session delta or page capability result.
2. Pointer, selection, pinned focus or causal change packet.
3. One requested related semantic/accessibility level.
4. Local marker or UI Automation detection without an LLM call.
5. One bounded pointer-centered image crop as the last fallback.

Capability descriptions are transmitted once per digest. Returning surfaces
request events after their last acknowledged revision instead of replaying the
session or conversation.

## Visible attention and connector truth

The default `Follow me` attention combines pointer movement, click, keyboard
focus and bounded text selection. `Click focus` pins only the last clicked
field, `Text marker only` requires an actual marked passage, and `Off` removes
the focus packet. A blue, text-labeled model spotlight shows the current shared
focus; a coral, text-labeled shimmer marks a target while the model is working.
Reduced-motion presentation keeps the labels and fixed outlines without pulse.

A second model pointer is reserved for a genuinely active Computer Use/Open
Compute executor. Connector route and execution mode remain separate state:
the `executionMode: computer-use` signal must carry a persistent `Computer use`
label plus a higher-token-use notice so the human can distinguish visual
control from native WebMCP. The ordinary no-WebMCP relay remains
`executionMode: structured` and does not earn this indicator: until an executor
actually controls a pointer, the product must not simulate one. The Desktop
Companion now earns this state only after its local Open Compute MCP runtime has
discovered the complete profiled tool set and `signal_show(mode="control")` has
confirmed a visible overlay. Stop, abort and host shutdown remove the signal;
native and ordinary bridge actions remain truthfully `structured`.

## Profiled Open Compute fallback

Cowork does not copy or fork an autonomous computer-use agent. Open Compute
owns one generic local filter boundary; Cowork imports it through MCP and
supplies the versioned `cowork-pointer-budget-v1` use-case profile. Other
products can provide different profiles without adding Cowork concepts to Open
Compute.

```text
Follow-me focus
  -> local UI Automation tree
  -> Open Compute profile filter
       12 elements / 1,200 characters / focused value only
       excluded assistant UI names removed
  -> bounded semantic packet to the model
  -> requested escalation only: 400×400 focus lens
       excluded overlapping windows blanked locally
  -> exact Cowork click authorization
  -> profile action allowlist
  -> Open Compute SafetyPolicy
  -> local executor
```

Fullscreen is forbidden by the Cowork profile. Raw `tree` and raw `capture`
are not present in the adapter's capability path. The default operator ceiling
is `confirm`, so the runtime reports but does not perform actions; an explicit
operator configuration may select `allow_all` when the exact Cowork human-click
authorization is intended to be the interactive gate. Starting Computer Use is
itself a trusted local cockpit gesture and only one Cowork session can own the
system pointer at a time.

## Acceptance use cases

### USECASE_SESSION_001 — detach without installation

**Precondition:** FormBuilder is open in a browser supporting Document
Picture-in-Picture.

**Input:** The human chooses `Detach`.

**Expected:** The existing Cowork surface moves into an independently movable
always-on-top browser window. Presence, focus, offers and conversation remain
the same session. Closing the detached window docks the same surface back into
FormBuilder.

**Proves:** surface handoff without a second model or copied state.

### USECASE_SESSION_002 — tray handoff after permission

**Precondition:** A Companion is running and the origin received local
connection permission.

**Input:** The human chooses `Open in Companion`.

**Expected:** The Companion accepts the exact snapshot revision, becomes the
primary surface and receives subsequent deltas. The Embed collapses to a
connected relay indicator. Its later `page-hidden` and `page-visible` events
update the Companion's page indicator without opening a model turn.

**Proves:** no-extension website-to-Companion continuity.

### USECASE_SESSION_003 — AFK continuation and return

**Precondition:** The human grants a bounded solo lease while the application
connection stays available.

**Input:** Human presence changes to away and later present.

**Expected:** The same Cowork model seat continues only within the lease. On
return, the human receives a compact verified/failed/pending briefing rather
than a history replay. The page replica first records `page-visible`, then
pulls all ordered deltas after its last revision and renders the current state.

**Proves:** shared context, explicit authority and token-bounded handback.

### USECASE_SESSION_004 — provider extension uses Cowork infrastructure

**Precondition:** The human chose a Codex, Claude or other provider extension as
the working chat surface.

**Input:** The provider agent invokes Cowork/WebMCP tools supplied by the page
or optional Cowork bridge.

**Expected:** The visible provider chat remains the human's conversation
context while both human and agent can use Cowork modes, focus, rights and
actions. Cowork never claims to possess the provider's private chat memory.

**Proves:** foreign tools use Cowork infrastructure without requiring the
Cowork Companion as their chat UI.

### USECASE_SESSION_005 — page closes during a session

**Precondition:** The Companion owns the session and the page provides the only
application action channel.

**Input:** The page closes.

**Expected:** Context and prepared work remain available, while page actions
become offline and no mutation is claimed. Reopening and rejoining at an exact
revision restores the action channel.

**Proves:** honest separation between collaboration state and application
state.

### USECASE_SESSION_006 — one protocol, three page-presentation policies

**Precondition:** Three sites expose equivalent Cowork/WebMCP capabilities and
select `protocol-only`, `protocol-and-ui` and
`protocol-and-user-optional-ui`.

**Input:** Compatible clients discover the protocol; the user explicitly
activates the optional page UI on the third site.

**Expected:** All three clients receive protocol access. The first site mounts
no page UI, the second mounts only its selected provider automatically, and the
third mounts only its selected provider after activation. A Cowork Side Panel,
Companion, provider chat or other external client never needs to be inserted
into the page to consume the protocol.

**Proves:** UI-provider neutrality and operator control without coupling the
collaboration contract to the Cowork reference surface.

## Implementation slices

| Slice | Current status |
| --- | --- |
| Headless integration contract and all three page policies | Implemented and unit-tested |
| Versioned Session Authority, surface/model leases and Handoff Capsule | Implemented and unit-tested |
| FormBuilder `protocol-and-ui` plus Document PiP | Implemented and Chrome-tested |
| Loopback Companion Link, exact-revision handoff and token-free visibility/return deltas | Implemented and Chrome-tested |
| Extension Side Panel, native-first bridge and bounded no-WebMCP fallback | Both branches Chrome-tested |
| Persistent Desktop/tray surface, Context Manager and serialized Model Gateway | Implemented; deterministic model journey Chrome-tested |
| Bounded DOM/accessibility/visual fallback for non-cooperating pages | Implemented in the optional extension; one-shot crop Chrome-tested |
| Best-effort foreign-provider-chat transfer | Lower-priority future work; explicit protocol state can be shared, private chat memory cannot |
