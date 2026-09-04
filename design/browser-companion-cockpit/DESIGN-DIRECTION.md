# Browser Bridge Cockpit — Design Direction

## Primary direction

The Browser Bridge is a bright **Dialogue Relay Instrument**: an evidence
console whose primary object is the live relationship between human, model and
the focused page target. It must read as a collaboration cockpit, not a chat
sidebar or a grid of interchangeable AI cards.

The shortest truthful chain visible in the product is:

`human + model state -> connector route -> bounded focus -> visible offer -> human click -> verified result`

## State language

The human and model figures are the primary controls.

| Figure | State | Aura | Shape or symbol | Meaning |
|---|---|---|---|---|
| Human | present | emerald | solid presence dot | available for interactive work |
| Human | briefly away | amber | clock arc | short AFK; model may work only inside a lease |
| Human | away | muted/coral | outward arrow and broken ring | no useful question should be asked now |
| Model | collaborating | emerald | alert hands and check | active within the current rights |
| Model | observing | blue | resting hands and eye | explain/read only, no action offers |
| Model | paused | muted/coral | closed eyes and pause bars | model receives no turn and performs no work |

The open-loop Relay emblem between them shows the derived mode. It is alive in
Cowork, directional during authorized solo work and dormant when collaboration
is paused. Color is never the only state signal: aura, opacity, pose, icon and
visible text change together.

## Rejected alternatives

- A generic chat transcript with a composer: it hides rights, focus and causal
  action state.
- Equal-weight rounded cards: they make connection, presence and offers appear
  equally important.
- A dark mission-control theme: it conflicts with the project's bright,
  colorful and premium direction.
- Generated bitmap buttons in production: paired states drift geometrically,
  scale poorly and weaken accessibility. Generated images remain visual
  references; production controls use SVG and CSS.
- Four independent mode buttons as the primary interaction: users understand
  clicking the human or model actor more directly. The protocol still derives
  the effective mode and refuses invalid combinations.

## Product and media split

The shipped cockpit uses restrained gold rails, crisp ivory surfaces and
compact productive typography. Generated concept art may use richer material,
glow and depth for thumbnails or video, but the real extension must remain fast,
legible and reproducible in HTML, SVG and CSS.

## Information hierarchy

1. Human/model state and derived collaboration mode.
2. Active connector route: Native Cowork, generic WebMCP or bounded Bridge.
3. Execution mode: structured by default; a separate unmistakable model
   pointer appears only during genuine Computer Use/Open Compute.
4. Current focus and granted context tier.
5. At most three visible proposals; execution remains a distinct human click.
6. Command dock for voice, handoff, context expansion and window/surface actions.
7. Compact protocol receipt/status, not a prose-heavy activity feed.

## Component grammar

- **Relay rail:** a thin gold route line with one luminous active node.
- **Actor medallion:** one repeated silhouette/character geometry with a
  state-specific aura and badge.
- **Relay core:** open loop plus four-point sparkle, animated only when useful.
- **Focus lens:** circular target instrument with three discrete budget steps.
- **Model pointer:** coral/blue cursor medallion plus persistent `Computer use`
  and `Higher token use` text; hidden for every structured action path.
- **Offer key:** coral for the proposed action; teal only after verification.
- **Command dock:** four large icon buttons with persistent text alternatives.

Recurring values belong in semantic CSS tokens. Literal state colors must not
be scattered across components.

## Typography, color and motion

- Navy productive text on ivory/white surfaces.
- Emerald active, blue observing, amber away-short, coral paused/away-long,
  teal verified/native, restrained gold structure.
- Bold geometric headings with compact uppercase instrument labels.
- Relay energy moves between actors in Cowork, moves one way in solo mode and
  stops when paused. Respect `prefers-reduced-motion` by removing all movement.

## Responsive behavior and accessibility

- Target side-panel viewport: 320–480 CSS pixels wide and at least 600 high.
- Every primary target is at least 44×44 CSS pixels.
- Actor controls use buttons with `aria-pressed`/explicit state labels; the
  relay mode is announced through a live status region.
- Keyboard focus is never represented only by glow.
- Long focus and offer labels wrap or truncate without horizontal scrolling.
- Controls unavailable without a joined Companion remain visibly restricted
  and explain why; they never pretend to work.

## Real and future data

Connector mode, focus, context tier, pending offer and verification are real
extension state. Human/model presence must come from the Cowork Session
Authority when joined. Until that link exists, the Extension may show only the
truthful local human-present/model-active-or-paused subset. Observing and solo
states are enabled only when their rights/lease contracts exist.

## Required demo states

1. Attached but paused: human present, model paused, dormant relay.
2. Native Cowork: both active, native node lit, living relay.
3. Observe-only: model blue, actions restricted, focus readable.
4. Human briefly away with valid solo lease: human amber, model green,
   directional relay.
5. Pending offer: coral offer key, unchanged page.
6. Verified: teal receipt after trusted human click.
7. No-WebMCP bridge: Bridge node lit, bounded 350/1,200/visual ladder visible.
8. Computer Use: connector route remains independently visible while the
   labeled model pointer identifies the higher-token visual executor.

## Acceptance checklist

- A first-time user can name who is active, which connector is used, what is
  focused and what the next authorized action is without opening chat.
- Presence, rights and availability are distinguishable without color.
- The page cannot mutate from an offer before a trusted human click.
- Generated-reference richness is translated into one consistent component
  grammar rather than unrelated decorations.
- 320×640, 390×844 and 480×900 captures have no horizontal overflow.
- Every interactive state has a visible focus style and an accessible name.
- Reduced-motion mode contains no moving relay energy.
- Native, WebMCP and bounded-bridge states never display a synthetic model
  pointer; only an executor-owned `computer-use` state may reveal it.

## Design references

- `cockpit-concept-v1.png`: full instrument hierarchy and visual material.
- `presence-state-language-v1.png`: actor, aura and Relay state grammar.
- `switch-active-reference-v1.png` and `switch-paused-reference-v1.png`:
  generated material references only, not production UI assets.
