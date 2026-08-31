# Cowork Desktop Companion

The Desktop Companion is the no-extension Cowork surface. A cooperating
website sends one exact versioned snapshot plus its bounded Context Manager
state over a loopback-only Companion Link. The Companion then becomes Session
Authority, claims the single renewable model-seat lease and leaves the page as
an application provider and synchronized UI replica.

The current Windows prototype includes:

- an independently movable Edge/Chrome app window in the shared Cowork design;
- a clickable human/model cockpit with green collaboration, blue observation,
  yellow short-away and visibly paused states, plus a relay that animates only
  when the authoritative mode permits work;
- the actual server-side model identifier beneath the model actor, without
  exposing endpoint or credential data to the browser surface;
- a palette button with five light presets and a free color input; the selected
  cockpit background is restored locally across window and host sessions;
- persisted Session Authority and compact conversation context across host
  restarts;
- one serialized, turn-ID-deduplicating Model Gateway for every Cowork-owned
  surface;
- typed conversation, browser speech recognition and speech synthesis;
- a native tray icon that is green while the human is present, yellow while
  briefly away, and red during longer absence;
- explicit loopback binding and website-origin pairing; wildcard origins are
  rejected.

Click the human figure to cycle present, briefly away and away longer. Click
the model figure to cycle collaborating, observing and paused. An away human
does not imply autonomous work: without a current bounded solo lease the relay
shows `Model waiting`; with a lease it changes to `Model working solo` and
flows toward the model.

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

The default endpoint is `http://127.0.0.1:47831/cowork/v1`, and the surface is
`http://127.0.0.1:47831/cowork/v1/ui`. Sessions are stored under the local
application-data directory unless `COWORK_SESSION_STORE` selects another
absolute path. Set `COWORK_OPEN_WINDOW=0` or `COWORK_TRAY=0` to suppress either
presentation.

Browser Local Network Access permission remains user-mediated. The host never
binds to a non-loopback interface. The tray is currently Windows-specific; the
session host and web surface are ordinary Node/browser components.
