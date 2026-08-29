# Cowork Protocol

Cowork Protocol is a small collaboration contract for people and web agents. It gives an agent the smallest useful context, makes proposed changes visible, keeps human clicks distinct from agent calls, and supports tightly scoped solo work while the human is away.

> Native when available. Bridged when necessary.

## Current local prototype

The repository currently contains:

- a protocol core for token-bounded focus packets;
- explicit human-click authorization for proposed actions;
- presence modes and fail-closed solo leases;
- a one-step context escalation router that emits nothing for silence or unchanged state;
- a FormBuilder connector using stable field IDs;
- the pre-existing MIT-licensed FormBuilder web schema/validation/response engine, explicitly attributed and isolated to the showcase;
- a current WebMCP registration adapter using `document.modelContext.registerTool()` and `AbortSignal` ownership;
- a host-supplied WebMCP bridge catalog that emits bounded summaries, executes only read-only-hinted tools and keeps every mutation offer-only;
- a responsive FormBuilder showcase with attention controls, visible offers, receipts, presence, scoped solo work and an audio fallback.

The native browser path has a tested registration contract and the showcase is served locally. A real WebMCP browser smoke, visual acceptance, microphone acceptance and deployment are still pending because no browser runtime was connected during the latest verification. This README does not claim those gates as complete.

Only the browser-based FormBuilder use case belongs to the publication scope. Desktop, Python and native packaging code from the pre-existing FormBuilder repository are intentionally excluded. The showcase remains in this repository so the protocol, application and deployment form one reproducible submission.

## Why WebMCP

The agent reads a structured `cowork_read_focus` tool instead of guessing from the whole interface. FormBuilder contributes a stable target ID and only the capabilities relevant to that field. User-authored text is marked untrusted, selected text over 160 characters becomes a length plus digest, and normal focus text is capped at 350 characters.

## Run the local showcase

Requirements: Node.js 22 or newer.

```powershell
npm start
```

Then open `http://127.0.0.1:4173/apps/formbuilder-showcase/` in a WebMCP-capable browser.

## Verify the slice

```powershell
npm test
npm run check:secrets
```

The suite uses Node's built-in test runner and has no external runtime dependency.

## Native WebMCP tools

- `cowork_read_focus` returns the current token-bounded focus packet.
- `cowork_offer_action` creates a visible offer; it never authorizes or executes the change.
- `cowork_read_presence` returns the explicit human/agent work mode.
- `cowork_execute_solo` executes only inside a valid, scoped and unexpired solo lease.

## Packages

- `packages/core` — protocol packets, state decisions, authorizations and budgets.
- `packages/formbuilder-connector` — maps a stable FormBuilder field into a native Cowork focus.
- `packages/native-webmcp` — registers the four Cowork tools with the current WebMCP API.
- `packages/bridge` — adapts an explicit host tool catalog without claiming browser-wide discovery.
- `apps/formbuilder-showcase` — visible reference journey for focus, offer, confirmation, receipt, presence, solo lease and audio controls.
- `apps/formbuilder-showcase/src/form-engine.mjs` — attributed web-only FormBuilder engine for required-field validation and JSON response export.

See [docs/architecture.md](docs/architecture.md), [docs/testing.md](docs/testing.md), and [PREEXISTING-AND-NEW.md](PREEXISTING-AND-NEW.md).

## License

MIT. The repository-wide license also covers the FormBuilder showcase. Any pre-existing FormBuilder source imported later must retain its original MIT notice and be recorded in [PREEXISTING-AND-NEW.md](PREEXISTING-AND-NEW.md).
