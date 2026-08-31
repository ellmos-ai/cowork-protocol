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
Cowork Protocol was then connected on top, for a small "Model suggestions"
panel that proposes a field/rename/reorder as an inert, click-gated offer.
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

## One app, four ways to work in it

| Mode | What you need | What happens |
| --- | --- | --- |
| Solo | just this app | Fill in and export the form; no agent anywhere |
| Embedded Cowork | nothing to install | The page voluntarily embeds the Cowork instrument beside the form |
| Browser extension | the Cowork Browser Companion | The same session appears in Chrome's side panel, outside the page DOM |
| Desktop companion | the Cowork Desktop Companion | The session surfaces in a native window with presence in the tray |

In every mode the contract is the same: the model sees one bounded focus
instead of your screen, proposals stay inert until your real click, and each
applied change returns a verified receipt.

## Run it locally

```bash
npm start
# then open http://127.0.0.1:4173/apps/formbuilder-showcase/
```

The app is plain HTML/CSS/ES modules — no build step, no external
dependencies. It is developed inside the Cowork Protocol repository as its
showcase integration; extracting it into its own companion repository is
planned after the WebMCP Challenge judging window closes.
