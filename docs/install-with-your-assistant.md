# Install and run Cowork Protocol with your AI assistant

Hand this page to any model that has shell and browser access (Claude Code,
Codex CLI, a comparable agent) and say: *"Install this repository for me and
walk me through it."* Everything the model needs is below; it does not have to
guess.

## Prompt to paste

```text
Help me install and run the Cowork Protocol repository. Work step by step,
show me each command before you run it, and stop when something fails.

Repository: https://github.com/ellmos-ai/cowork-protocol
Requirements: Node.js 22 or newer; Chrome or Edge 150+ for the browser parts.

1. Clone and enter the repository:
     git clone https://github.com/ellmos-ai/cowork-protocol
     cd cowork-protocol
2. Check Node: node --version  (must be 22 or newer). There are no runtime
   dependencies; run  npm ci --ignore-scripts  once for the test tooling.
3. Prove the protocol without a browser:  npm test  and  npm run proof
   Expected: all tests pass and the proof prints 10 passing steps.
4. Start the showcase:  npm start
   Then open  http://127.0.0.1:4173/apps/formbuilder-showcase/
   To see the nine native WebMCP tools, start the browser with the flags
   --enable-features=WebMCP,WebMCPTesting  (or enable "WebMCP" and
   "WebMCP Testing" on chrome://flags or edge://flags and restart). The header
   badge reads "Native WebMCP" when they are active; without them everything
   except in-browser agent discovery still works.
5. In the page's Cowork panel, "Demo mode" is on by default (a disclosed
   scripted helper). To use my own model, switch Demo off and enter an
   OpenAI-compatible endpoint and model ID under "Connect your own model"
   (for a local Ollama: http://127.0.0.1:11434/v1/chat/completions and the
   model name). With Demo off and nothing connected the page proposes nothing.
6. Optional browser extension (Cowork surface on any page):
     npm run build:companion
   Expected: "Browser companion artifact: 22 files". Then open
   chrome://extensions (or edge://extensions), enable Developer mode, choose
   "Load unpacked" and select the dist-browser-companion directory. Details:
   apps/browser-companion/INSTALL.md
7. Optional Desktop Companion (session authority outside the browser):
     set COWORK_ALLOWED_ORIGINS=http://127.0.0.1:4173
     npm run start:companion-host
   Then click "Desktop Companion" in the page's Cowork panel. To give the
   Companion a model, also set COWORK_MODEL_ENDPOINT and COWORK_MODEL before
   starting it. Details: apps/desktop-companion/README.md
Do not change any file in the repository, do not touch my other browser
extensions, and do not read my browsing history, cookies or passwords. If a
step's expected output differs, show me the output and ask before continuing.
```

## What the model will find

- `README.md` — what the protocol is, the four levels, all npm scripts.
- `docs/hosts.md` — two bridges with a place, one vehicle.
- `docs/work-modes.md` — the presence/role matrix that decides who may click.
- `docs/evidence.md` — every claim with the measurement behind it.
- `apps/formbuilder-showcase/INTEGRATION.md` — how an existing app attaches the protocol.
- `docs/agent-guide.md` — the page's side of the contract, for the agent itself.
- `llms.txt` at the repository root — the short machine-readable index.

Once it runs, the assistant that installed it can also drive it. `docs/agent-guide.md`
is written for whatever is reading the tools rather than for the person who
installed them: it lists the nine tools in the order a build uses them, says
which capabilities each focus target carries, and shows the JSON `value` a field
with answer choices needs — a label cannot hold them, and a model that tries
writes the choices into the question instead of asking it.
