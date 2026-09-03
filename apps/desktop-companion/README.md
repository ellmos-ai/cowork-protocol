# Cowork Desktop Companion

The Desktop Companion is the vehicle, not a bridge. A bridge has a place
between one page and one model; the Companion has none of its own. What it has
is the model seat and the authority to use it, and it drives that model over
whichever bridge it is connected to.

Concretely: a cooperating website sends one exact versioned snapshot plus its
bounded Context Manager state over a loopback-only Companion Link. The
Companion then becomes Session Authority, claims the single renewable
model-seat lease and leaves the page as an application provider and
synchronized UI replica. The page keeps the click; the Companion keeps the
seat.

The current Windows prototype includes:

- an independently movable Edge/Chrome app window in the shared Cowork design;
- a clickable human/model cockpit with green executing, blue advising, yellow
  standby and visibly disconnected states, plus a relay that animates only when
  the authoritative mode permits work;
- the actual server-side model identifier beneath the model actor, without
  exposing endpoint or credential data to the browser surface;
- a palette button with five light presets and a free color input; the selected
  cockpit background is restored locally across window and host sessions;
- persisted Session Authority and compact conversation context across host
  restarts;
- one serialized, turn-ID-deduplicating Model Gateway for every Cowork-owned
  surface;
- typed conversation, browser speech recognition and speech synthesis;
- an explicit execution switch: structured WebMCP stays blue and pointer-free;
  a deliberate local click may start the profiled Open Compute fallback, whose
  verified red control overlay and second model pointer disappear again on
  stop, abort or shutdown;
- a bundled `cowork-pointer-budget-v1` filter profile that asks Open Compute
  for UIA semantics first, caps delivery at 12 elements/1,200 characters,
  permits only a 400×400 escalation lens, forbids fullscreen and blanks named
  assistant/chat windows that overlap the lens;
- a native tray icon that is green while the human is present, yellow while
  briefly away, and red during longer absence;
- explicit loopback binding and website-origin pairing; wildcard origins are
  rejected.

Click the human figure to cycle present, briefly away and away longer. Click
the model figure to cycle collaborating, observing and paused. Those are the
0.1 presence values this Companion commits to the shared session; the cockpit
renders the work mode they resolve to, in the same words every other Cowork
surface uses.

The model executes only against a current grant - goal, budget, expiry. A
present human is not a substitute: set the model to work without a lease and the
cockpit shows it advising and says the grant is missing, rather than promising a
click right that `executeSoloAction` would refuse in the same breath. With a
current lease the relay shows `Sparring · model executes` while you are here and
`Model works alone` once you step away.

Run it with an explicit comma-separated origin allowlist:

```powershell
$env:COWORK_ALLOWED_ORIGINS='http://127.0.0.1:4173,https://ellmos-ai.github.io'
npm run start:companion-host
```

Without a configured model, session handoff, presence, persistence, the app
window and tray still work; the conversation input is disabled. To connect an
OpenAI-compatible preferred model:

```powershell
$env:COWORK_MODEL_ENDPOINT='http://127.0.0.1:11434/v1/chat/completions'
$env:COWORK_MODEL='your-model-id'
$env:COWORK_MODEL_API_KEY='optional-server-only-key'
npm run start:companion-host
```

The Companion displays the configured `COWORK_MODEL` identifier in its model
seat. Model endpoint, key and reasoning settings remain host-owned startup
configuration; the browser surface does not receive them.

### Reasoning models (Ollama qwen3.x, gpt-oss)

A reasoning model answers in two parts: hidden thinking and the reply text.
`max_tokens` covers both, so a small answer budget can be spent entirely on
thinking and come back with an empty reply. Measured here against
`qwen3.8:27b-mlx` on 2026-09-04, with the Companion's real gateway packet:

| Request | Result |
|---|---|
| `max_tokens: 500`, no reasoning level | 35.1 s, `finish_reason: length`, 2,136 reasoning characters, empty reply |
| `reasoning_effort: "none"` | 12.4 s, 126 completion tokens, valid JSON reply |

The Companion handles this itself: when no reasoning level is configured and a
turn comes back with nothing but thinking, it retries that turn once with
`reasoning_effort: "none"` and prints
`[cowork] MODEL_THOUGHT_PAST_ITS_BUDGET: ...` so the retry is never silent. To
skip the wasted first attempt, or to keep the thinking and pay for it, set the
level and budget yourself:

```powershell
# Fastest for Ollama reasoning models: no thinking, no retry.
$env:COWORK_MODEL_REASONING_EFFORT='none'
# Or keep the thinking and give it room (64..2000, default 500).
$env:COWORK_MODEL_MAX_TOKENS='1500'
```

`"think": false` does **not** work on the `/v1/chat/completions` endpoint;
`reasoning_effort` does. An explicitly configured level is never downgraded by
the retry - the turn fails with `MODEL_THOUGHT_PAST_ITS_BUDGET` instead, and
that code and sentence reach the cockpit and the linked page.

Computer Use is optional and lazy. No Open Compute process starts until the
human presses its cockpit switch. By default the Companion launches the
Git-hosted `open-compute[mcp,local,uia]` MCP server through `uvx` with
`OC_SAFETY_MODE=confirm`; this proves and displays control but reports actions
without executing them. An operator may explicitly select `allow_all` only
when Cowork's per-action human authorization is the intended gate:

```powershell
$env:COWORK_OPEN_COMPUTE_SAFETY='allow_all'
# Optional local-development override:
$env:COWORK_OPEN_COMPUTE_COMMAND='python'
$env:COWORK_OPEN_COMPUTE_ARGS='["-m","open_compute.mcp_server"]'
```

Set `COWORK_COMPUTER_USE=0` to remove this fallback. The Companion never calls
Open Compute's raw `tree` or `capture` tools; its adapter allowlists only the
profile-filtered observation/lens, verified signal tools and gated `do`.

The default endpoint is `http://127.0.0.1:47831/cowork/v1`, and the surface is
`http://127.0.0.1:47831/cowork/v1/ui`. Sessions are stored under the local
application-data directory unless `COWORK_SESSION_STORE` selects another
absolute path. Set `COWORK_OPEN_WINDOW=0` or `COWORK_TRAY=0` to suppress either
presentation.

Browser Local Network Access permission remains user-mediated. The host never
binds to a non-loopback interface. The tray is currently Windows-specific; the
session host and web surface are ordinary Node/browser components.

## Use the Companion as a tool from Claude Code, Codex CLI or agy

The Companion is not only a window. Any local agent that speaks MCP can call
the same nine Cowork tools a browser agent calls on the page, so a coding
agent in your terminal and a model in the browser work on one session with one
tool set. The MCP server publishes its tool list by reading the page's own
WebMCP registration, so the two surfaces cannot drift apart.

Two processes are involved, and both must run:

```powershell
npm run start:companion-host   # the session authority, http://127.0.0.1:47831
npm run start:companion-mcp    # the stdio MCP server your agent spawns
```

You do not start the second one yourself; your agent spawns it. Point it at
this file with an absolute path:

**Claude Code**

```powershell
claude mcp add cowork-companion -- node C:/_Local_DEV/repos/cowork-protocol/apps/desktop-companion/src/mcp-server.js
```

or, per project, in `.mcp.json`:

```json
{
  "mcpServers": {
    "cowork-companion": {
      "command": "node",
      "args": ["C:/_Local_DEV/repos/cowork-protocol/apps/desktop-companion/src/mcp-server.js"],
      "env": { "COWORK_COMPANION_ENDPOINT": "http://127.0.0.1:47831/cowork/v1" }
    }
  }
}
```

**Codex CLI** — in `~/.codex/config.toml`:

```toml
[mcp_servers.cowork-companion]
command = "node"
args = ["C:/_Local_DEV/repos/cowork-protocol/apps/desktop-companion/src/mcp-server.js"]
```

**agy and other agents** — the server is an ordinary stdio MCP server with no
arguments and no dependencies; see your agent's MCP configuration for where its
command belongs.

`COWORK_COMPANION_ENDPOINT` overrides the default `http://127.0.0.1:47831/cowork/v1`,
and `COWORK_COMPANION_LINK_SESSION` names one link session when several pages
are connected at once.

### What a local agent may and may not do

The tools carry the same authority rules as in the browser, because the page
enforces them and the page runs the call: `cowork_offer_action` only creates the
inert offer a human still has to click, and `cowork_execute_solo` still needs a
current lease. The MCP route adds no authority; it adds a caller.

A tool call travels agent → Companion → page → agent. The Companion holds the
call until the linked page pulls it, so:

- with no page linked, or a page that does not answer within 15 seconds, the
  call fails with `PAGE_UNREACHABLE` — it never silently succeeds;
- a hidden or backgrounded page polls slowly or not at all, so expect
  `PAGE_UNREACHABLE` there too;
- a tool the page refuses (`STALE_FOCUS`, `SESSION_PAUSED`, a lapsed lease)
  reaches the agent as an MCP tool error carrying that code.

The Companion window names the connected client and counts its calls, and says
so when there is no page for those calls to run on.

While the Companion is connected, the page folds to its header, status line,
offer list and receipts, with a note saying so: an offer an agent makes over
MCP appears in that offer list and is authorized by a real click on the page,
never in the Companion window (measured by `npm run smoke:companion-mcp`; the
earlier version of this page hid the offer list too, which left such an offer
with no surface to be clicked on). `Leave Companion` on the same note hands
the session back to the page: it becomes its own session authority again and
shows the full panel, while the Companion keeps its own copy (measured by
`npm run smoke:surface`).

Measured: the stdio handshake, the tool list and the full agent → page → agent
round trip, in `npm test` and in `npm run smoke:companion-mcp` against a real
Chrome page. A live Claude Code, Codex CLI or agy session has not been measured.
