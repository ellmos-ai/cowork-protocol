# Panel tour

Every control in the embedded Cowork panel, named and explained. The
screenshots come from the live showcase
(<https://ellmos-ai.github.io/cowork-protocol/apps/formbuilder-showcase/>),
captured in Chrome 152 with `--enable-features=WebMCP,WebMCPTesting` at a
1440×1100 viewport. `node design/panel-tour/capture.mjs` regenerates all of
them, measures the marked regions in the browser and redraws the overlay, so
the boxes below cannot drift away from what they point at.

![The embedded Cowork panel with ten numbered regions marked](../design/panel-tour/panel-annotated.png)

The panel is one instrument. It serves the FormBuilder Studio canvas and the
sample form below it through the same ten regions; nothing here is duplicated
per canvas. Nine WebMCP tools carry it to a model that speaks the protocol:
`cowork_read_focus`, `cowork_request_context`, `cowork_read_changes`,
`cowork_read_presence`, `cowork_offer_action`, `cowork_execute_solo`,
`cowork_read_feedback`, `cowork_read_turn` and `cowork_reply_turn`.

## 1 · Surface header

The Cowork lockup, the surface the session is currently on (`Embedded · S1`,
where the number is the session revision every surface agrees on), the resolved
work mode, and two buttons that move the panel without moving the session.

- **Detach** opens the panel in a Document Picture-in-Picture window and turns
  into **Dock in page**. A browser without Document PiP is told so
  (`DETACHED_SURFACE_UNAVAILABLE`) instead of failing silently.
- **Desktop Companion** joins the session at `http://127.0.0.1:47831/cowork/v1`.
  While it is connected the label reads *Connected*, and the panel's own
  conversation controls and both surface buttons are disabled — the companion
  holds the model seat for the whole session.

*The model sees:* nothing extra. Moving the panel changes no protocol state,
which is the point of the revision counter sitting here.

## 2 · Present · Working on · Role

The three questions the whole protocol is built on, one per dot. Hovering each
label shows the question it answers: *Who is here right now*, *Which page, task
or field*, *Executing or advising*. This strip is a readout, not a control —
the answers are set by the two figures below it and by the Role selector.

*The model sees:* `cowork_read_presence` returns the same three values for both
partners. Full matrix in [work-modes.md](work-modes.md).

## 3 · The two figures

You on the left, the model on the right, and between them the mode both answers
add up to. Each figure is a button.

- **Clicking a figure** cycles that partner through the four states: here and
  executing, here and advising, standby, away. The cycle starts from the
  *resolved* status, so a partner whose authority the conflict rule already
  removed moves on from what is actually displayed.
- Both cannot execute on the same area. Try it, and the panel says so: *"Both
  cannot act at once here. The hand on the mouse keeps the click right."*
- An empty model seat reads as **away** — *No model connected* — never as a
  model that advises.

*The model sees:* its own and your availability, area and role, through
`cowork_read_presence`.

## 4 · WebMCP help

A collapsible section that names the browser you are in and tells you how to
switch WebMCP on: the flags page, or the command line with
`--enable-features=WebMCP,WebMCPTesting` — the same feature names the smoke
tests launch Chrome with. The badge reads **Native WebMCP** once
`document.modelContext` is there, **off** when it is not.

*The model sees:* nothing. Without WebMCP the page still works; only
in-browser agent discovery is missing.

## 5 · Model seat and the demo switch

Which model answers, and where it comes from. The slate box is marked
**Showcase add-on — not part of Cowork Protocol or FormBuilder**, because it is
scaffolding for the demo, not protocol.

- **Demo mode** on: a disclosed scripted helper answers and proposes fixed
  values. No language model is involved, and the panel says so.
- Switching it **off** with nothing connected leaves the seat empty, and the
  model figure moves to *away*. Nothing is proposed until you connect one.
- **Connect your own model** takes an OpenAI-compatible endpoint, a model id
  and an optional key kept only in this tab. A local Ollama or LM Studio works
  from a locally served copy; on an HTTPS page the endpoint must be HTTPS too.

*The model sees:* nothing about this section — it decides who the model is.

## 6 · Attention lens

What the model is allowed to look at, and what it got. The large line names the
current target (*Pointing at: Short answer (Studio canvas)*); the line under it
names the area; the metric on the right counts what was actually sent.

- **Look at** chooses the lens: *Follow me* (pointer, clicks and text
  selections), *Text marker only*, *Click focus*, or *Off*. Choosing **Off**
  ends any model work in progress, drops the focus and sends no page context at
  all.
- **Track changes and causes** records which change followed which cause.
  Switching it off clears the recorded events.
- **Preview one related context level** returns exactly one level of related
  context for that one request, and reports how many characters it added. It
  refuses with `STALE_FOCUS` when nothing is focused.

*The model sees:* one bounded focus packet through `cowork_read_focus`, one
extra level only on request through `cowork_request_context`, and the causal
change list through `cowork_read_changes`. Never the screen.

## 7 · Role and offers

The role half of question three, plus everything the model has proposed.

- The **selector** picks the work mode directly. A mode that the state does not
  permit is refused with the reason — *"Both execute at once only on different
  areas"*, or *"A model executes only inside a granted job"*.
- **Offers** are the model's proposals as clickable chips, each naming its
  canvas and its exact proposed value. A chip changes nothing until you click
  it. The offer in the screenshot below waited with *Click to authorize*.
- **Create local demo offer** produces one, so the mechanism is visible without
  a model. Pointing at a Studio field renames it to **Model suggests a field**
  and it proposes into that canvas instead.

*The model sees:* `cowork_offer_action` to propose. It cannot click its own
offer; only a trusted human click applies one.

## 8 · Conversation

One bounded turn at a time, typed or spoken. The badge names the transport that
will answer — the local demo helper, your connected model, or the companion.

- **Send bounded turn** sends what is in the box (350 characters maximum). A
  recognized instruction about the field you are pointing at is applied
  directly, with no offer chip in between — the words are the click — and then
  waits for your verdict.
- **Push to talk** dictates into the same box; **Stop voice** cancels
  recognition and playback.
- **Speak replies** reads answers aloud.
- The transcript stays quiet on its own: *"Silence creates no model turn."*

*The model sees:* the pending turn through `cowork_read_turn` and answers
through `cowork_reply_turn`.

## 9 · Verified receipts

What actually changed, in order, each line beginning with **Verified**. The
counter on the right is the total.

- Every result waits for one of three verdicts: **Good**, **Adjust**,
  **Different**. Only a trusted click resolves it; the receipt keeps asking
  until then.
- Optional direction is capped at 350 characters.

*The model sees:* only the latest feedback event, through
`cowork_read_feedback`.

## 10 · Handoff

Handing work over, and taking it back.

- **Job to hand over** names the goal the grant will carry.
- **Hand over, I'll watch** gives the model the click right while you stay
  present and advise. On the Studio canvas it drafts one field per click.
- **I'm briefly away** / **I'm away longer** mint the same grant and let the
  model spend the budget unattended.
- **I'm back** ends the grant and reports a bounded delta — what changed while
  the model worked — and highlights exactly those rows until you give a
  verdict.
- **Pause model** puts the model on standby; the button then reads *Resume
  model*.
- The microcopy states the live limits, not a fixed sentence: two minutes and
  at most two attempts on the sample form, two minutes and at most six drafts
  on the Studio canvas.

*The model sees:* `cowork_execute_solo`, and only inside a current grant with a
goal, a budget and an expiry.

## An offer waiting

![The panel with a model proposal waiting to be authorized](../design/panel-tour/panel-offer.png)

Pointing at a Studio field and pressing **Model suggests a field** puts one
proposal in the offer list — it names the field it would add, the canvas it
belongs to, and that it is waiting to be authorized — and the canvas stays
untouched until a real click applies it.

## After handing over

![The panel after handing the job to the model](../design/panel-tour/panel-handover.png)

**Hand over, I'll watch** swaps the roles: the badge reads *Sparring · model
executes*, the figures now say *You are advising* and *Model is executing*, the
first verified receipt has appeared, and the status line reports the grant it
runs under: 1 of 6 drafts used.

## The same session in the browser extension

![The Cowork side panel in Chrome](../design/panel-tour/extension-sidepanel.png)

For pages that carry no Cowork panel of their own, the browser extension puts
the same session in Chrome's side panel, outside the page DOM, and registers
the same Cowork tools over WebMCP. It brings **no model seat of its own**: the
seat stays with the page, the Desktop Companion, a page host or the demo
helper, and offers are applied by clicking them in the page's own panel. See
[apps/browser-companion/README.md](../apps/browser-companion/README.md).

## The same session in the Desktop Companion

![The Cowork Desktop Companion window](../design/panel-tour/companion-ui.png)

The Desktop Companion is an app window with no extension involved: not tied to
one browser, with a filtered Computer Use fallback next to structured WebMCP
execution. While it is connected it **holds the session's model seat** — the
screenshot shows a restored `formbuilder-showcase` session at revision 49 with
a local `qwen3.8:27b-mlx` in the seat. See
[apps/desktop-companion/README.md](../apps/desktop-companion/README.md).

## Still open

The three surfaces do not yet look like one family at the top: the page panel
carries the surface and revision header shown at marker 1, while the side panel
opens with route chips instead. And the page panel keeps every section
expanded except the WebMCP help, so a first-time visitor meets all ten regions
at once. Both are presentation, not protocol — the contract underneath is the
same in all three.
