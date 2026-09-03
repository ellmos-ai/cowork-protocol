# FormBuilder Web

A standalone form web app — and the reference integration of Cowork Protocol.

FormBuilder Web is its own product. The journey is now **design → fill →
export**: the FormBuilder Studio section (Build/Fill/Export tabs) lets you
design a form from a palette of the 8 field types the upstream desktop app
supports, fill it in, and export it — as the real
`formularerstellen-form-v1` schema, a `formularerstellen-response-v1`
response, or a printable Flat ODF (`.fodt`) document. It works entirely
without an agent, without WebMCP, and without any extension; see
[`INTEGRATION.md`](INTEGRATION.md) for exactly how (and why in that order)
Cowork Protocol was then connected on top, at the embedded level: the protocol
runs underneath and the page renders one Cowork panel on it, with no install
and no extension. That connection adds no controls to the Studio - the one
panel serves the Studio canvas the same way it serves the fixed sample form
below the workspace, and every suggestion still needs your real click. The
same protocol also runs with no Cowork surface at all, behind a browser
extension, or behind the Desktop Companion; see the level table in the
[repository README](../../README.md) and
[what each host adds and does not claim](../../docs/hosts.md).
Its form-rendering engine is derived from the pre-existing MIT-licensed
FormBuilder web companion (see [`FORMBUILDER-NOTICE.md`](FORMBUILDER-NOTICE.md)
and the repository-level [`PREEXISTING-AND-NEW.md`](../../PREEXISTING-AND-NEW.md));
the Builder (Build/Fill/Export) code itself is new work, written against the
upstream desktop app's public `README.md` and `EXPORTFORMAT.md` contract, not
copied from it.

**Roadmap (not built yet):** sending a filled-in form by mail and collecting
responses back into one place needs its own inbox address and a defined
place to review returns — left open rather than half-built.

Live: <https://ellmos-ai.github.io/cowork-protocol/apps/formbuilder-showcase/>

**Panel tour → [`docs/panel-tour.md`](../../docs/panel-tour.md).** Every control
in the Cowork panel beside the Studio, marked on an annotated screenshot of the
live page and explained one by one: what each region is, what a click does, and
what the model gets to see. It also shows the same session in the browser
extension and in the Desktop Companion.

## One app, four ways to work in it

| Mode | What you need | What happens |
| --- | --- | --- |
| Solo | just this app | Fill in and export the form; no agent anywhere |
| Embedded Cowork | nothing to install | The page voluntarily embeds the Cowork instrument beside the form |
| Browser extension | the Cowork Browser Companion | The same session appears in Chrome's side panel, outside the page DOM |
| Desktop Companion | the Cowork Desktop Companion | The session surfaces in a native window with presence in the tray |

In every mode the contract is the same: the model sees one bounded focus
instead of your screen, proposals stay inert until your real click, and each
applied change returns a verified receipt.

## Model seat

One **Demo mode** switch in the Model seat panel decides who answers, instead of
demo behaviour spread over several buttons.

- **Demo on** — a disclosed scripted helper answers and proposes fixed values.
  Nothing there comes from a language model.
- **Demo off** — an injected model transport wins first, then a direct browser
  connection to an OpenAI-compatible endpoint (local Ollama or LM Studio from a
  locally served copy; on the HTTPS deployment the endpoint must be `https://`
  too), then a same-origin model host started with `npm run start:model`.
- **Nothing connected** — the seat says so and proposes nothing. The turn is
  still published for a WebMCP agent to answer through `cowork_read_turn` and
  `cowork_reply_turn`. It never falls back to the script silently.

While the Desktop Companion is connected it carries the model seat for the whole
session. An API key you type here stays in the tab and is never written to the
page's persistent storage.

## In the Builder

The FormBuilder Studio section has no Cowork controls of its own. It used to:
a "Model suggestions" list, a "Delegate to the model" dialog and a "Say what to
do" input sat in the Build tab and largely repeated what the Cowork panel
already did. One instrument is the point of the protocol, so those three
sections are gone and the panel drives both canvases. What stayed is the part
that was never a duplicate — the bridge, the suggester and the directive
classifier that know what a form field is. [`INTEGRATION.md`](INTEGRATION.md)
describes that layer and the seams the fold needed.

**How to work in the Studio with the panel:**

1. **Point at a field** in the Build tab. The panel's attention lens switches to
   `Pointing at: <label> (Studio canvas)`; the demo form's focus is released, so
   only one target is ever lit. Pointing back at a demo form field returns it.
2. **Ask for a field.** Type or speak into the panel's conversation box — or, in
   Demo mode, press the panel's offer button, which relabels itself "Model
   suggests a field" while the Studio canvas has the focus. The proposal arrives
   as an inert chip in the panel's offer list, marked `Studio canvas`, and stays
   inert until your real click.
3. **Say what to do instead.** A recognized instruction about the pointed-at
   field ("make it required", "move it up", "make this the first question")
   applies directly — the words are the click — and then waits for your verdict.
   Anything else falls back to step 2.
4. **Hand the work over.** Put the job in the panel's "Job to hand over" box.
   "Hand over, I'll watch" draws one draft per click; "I'm briefly away" and
   "I'm away longer" let the model spend the whole budget. On the Studio canvas
   those buttons mint a canvas-scoped grant with a fixed budget of 6 drafts and
   the same two-minute expiry as the demo lease, and the grant becomes the
   session's lease, so the panel's presence display and expiry clock describe it
   too.
5. **Come back.** "I'm back" ends the grant and writes what changed into the
   panel's status line.

Every applied change lands as a receipt in the panel's receipt list, newest
first, and the receipt count covers both canvases.

After a delegated round, the return message and the "new since handover" field
highlights stay up only until you record a verdict on the panel's newest
receipt. Once the feedback is in, that round is closed and both disappear, so
the Build tab never keeps showing a finished handover.

## Run it locally

```bash
npm start
# then open http://127.0.0.1:4173/apps/formbuilder-showcase/
```

The app is plain HTML/CSS/ES modules — no build step, no external
dependencies. It is developed inside the Cowork Protocol repository as its
showcase integration; extracting it into its own companion repository is
planned after the WebMCP Challenge judging window closes.
