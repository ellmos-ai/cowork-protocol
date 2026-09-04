# Install the Cowork Protocol Bridge

The Browser Bridge is an optional Manifest V3 extension that gives a page
without Cowork Protocol or WebMCP a bounded, honest fallback. It is off by
default: it declares no automatic content script and no persistent host
permission, and only a toolbar click or `Ctrl+Shift+Y` grants temporary
`activeTab` access to the current page. Its surface is a browser Side Panel on
the extension origin, so nothing is injected into the website's own UI. The
packaged extension loads no remote code and contacts no server; nothing leaves
your machine.

It is not published in any web store. You build it from this repository and load
it unpacked, which is why every step below is reproducible on your own machine.

## Install manually (2 minutes)

Requires Node.js 22 or newer and a Chromium browser with Side Panel support
(Chrome or Edge; the recorded acceptance runs on Chrome 152). The build has no
npm dependencies, so no `npm install` is needed.

1. Build the artifact from the repository root:

   ```powershell
   npm run build:companion
   ```

   Expected output: `Browser companion artifact: 22 files in <repo>\dist-browser-companion`.

2. Open `chrome://extensions` (Edge: `edge://extensions`).
3. Turn on **Developer mode** (top right).
4. Choose **Load unpacked** and select the `dist-browser-companion` directory —
   the directory itself, not a file inside it.
5. The card **Cowork Protocol Bridge 0.3.2** appears with no errors.
   Pin it: click the puzzle-piece toolbar icon, then the pin next to the entry.
6. Optional: check the shortcut under `chrome://extensions/shortcuts`. It ships
   as `Ctrl+Shift+Y` (`Command+Shift+Y` on macOS) and does the same as clicking
   the toolbar icon.

Rebuilding replaces `dist-browser-companion` in place; press **Reload** on the
extension card afterwards to pick up the new build.

## Install with your AI assistant

If you would rather have a model with shell and browser access walk you through
it, copy the block below into Claude, ChatGPT or any comparable assistant. It is
self-contained — it does not assume the model has seen this repository.

```text
Help me install a browser extension I build from source. Work step by step and
show me each command before you run it.

Repository: https://github.com/ellmos-ai/cowork-protocol
Extension:  apps/browser-companion (Manifest V3, Chrome/Edge, unpacked)

1. Clone the repository if it is not on my machine yet, then change into it:
     git clone https://github.com/ellmos-ai/cowork-protocol
     cd cowork-protocol
2. Check that Node.js 22 or newer is available: node --version
   The build needs no npm install; the repository has no runtime dependencies.
3. Build the extension artifact: npm run build:companion
   Expected output: "Browser companion artifact: 22 files in <repo>/dist-browser-companion".
   If the file count differs or the command fails, stop and show me the output.
4. Tell me the absolute path of the dist-browser-companion directory, then walk
   me through loading it: open chrome://extensions, enable Developer mode,
   click "Load unpacked", select that directory. Do this yourself only if you
   have browser control; otherwise give me the clicks and wait for me.
5. Expected result: a card named "Cowork Protocol Bridge" version
   0.3.2 with no error badge. Ask me to confirm before continuing.
6. Verify with me: open any ordinary web page with a text field, click the
   extension's toolbar icon (or press Ctrl+Shift+Y). The icon should show an
   "ON" badge and a side panel titled "Cowork Protocol Bridge" should open.
   If it does not, read the errors on the extension card and the side panel's
   console, and report them to me instead of changing repository files.

Do not touch, disable or reconfigure any other extension in my browser, and do
not open, read or export my browsing history, cookies, passwords or open tabs.
Only build this repository and guide the load-unpacked step; if something is
unclear, ask me rather than guessing.
```

## Verify it works

- Open an ordinary web page that has a text input (a search box is enough).
- Click the pinned toolbar icon, or press `Ctrl+Shift+Y`.
- The toolbar icon shows an **ON** badge, and the Side Panel opens on a bridge
  mark, the line **No model is crossing the bridge.**, the on/off switch, and
  one line naming the page it is looking at and the route it found. That is the
  whole panel at rest: this bridge carries no model, so instruments that cannot
  do anything yet are not shown.
- When a WebMCP agent in this browser makes its first Cowork tool call, a mark
  travels the deck once and the panel opens: the "Who works now?" actor
  controls, the **Current focus** lens, offers and the receipts strip. Let the
  agent go quiet for 90 seconds and the panel folds back with **The model left
  the bridge.** A standing offer keeps it open however long you take to decide.
- On a page that carries its own Cowork panel — [the FormBuilder
  showcase](https://ellmos-ai.github.io/cowork-protocol/apps/formbuilder-showcase/),
  for example — this bridge steps aside to one line: the page's own panel takes
  your clicks. If the session has moved to the Desktop Companion, the line says
  that instead.
- The route line names what the *page* offers, not what this bridge is:
  **Page has its own tools (native WebMCP)**, **Page has WebMCP tools, no
  Cowork**, **Bridge tools registered for this page** (this bridge registered
  `cowork_read_focus`, `cowork_request_context`, `cowork_offer_action` and
  `cowork_read_presence` where the page had none) or **Bridge only (no WebMCP
  in this browser)**.
- Voice and handoff need the Desktop Companion (`npm run start:companion-host`,
  then `127.0.0.1:47831/cowork/v1/ui`); this bridge mints no grant and says so.
- Focus a text field and use the focus lens: you get the semantic target and
  bounded nearby text, and the context gauge widens that context one level per
  explicit request.
- A proposed action appears as an inert **Proposed action** card. The field does
  not change while it sits there — only your real click on the panel applies it,
  and the result is reported only after the observed value matches.
- Switch to another origin or close the tab: the `activeTab` grant is revoked
  and the badge clears. That is expected, not a failure.

## Uninstall

Open `chrome://extensions`, click **Remove** on the Cowork Protocol Browser
Companion card, and delete the local `dist-browser-companion` directory if you
no longer need the build.
