# Preferred model host

Cowork can use a preferred model without putting a provider key into the page. The browser discovers a same-origin endpoint, sends one exact bounded Cowork turn, and receives a provider-neutral reply. The server alone knows the upstream endpoint, model ID and optional key.

## Start

Requirements: Node.js 22 or newer and an OpenAI-compatible chat-completions endpoint that can return JSON object content.

```powershell
$env:COWORK_MODEL_ENDPOINT='http://127.0.0.1:11434/v1/chat/completions'
$env:COWORK_MODEL_ID='your-model-id'
$env:COWORK_MODEL_API_KEY='optional-server-only-key'
$env:COWORK_PORT='4173'
npm run start:model
```

Then open `http://127.0.0.1:4173/apps/formbuilder-showcase/`. `COWORK_MODEL_API_KEY` may be omitted for a local endpoint that does not require one. The current gateway sends an OpenAI-compatible `messages` request with JSON-object response formatting; provider-specific compatibility must be checked with the chosen endpoint.

## Boundary

The page first requests `GET /__cowork/model/status`. Only an available protocol `0.1` same-origin host activates the bridge. It then posts this exact envelope to `POST /__cowork/model/turn`:

```json
{
  "protocolVersion": "0.1",
  "turn": {
    "type": "conversation-turn",
    "protocolVersion": "0.1",
    "transcript": "Suggest a badge name",
    "focus": null,
    "presence": {
      "humanPresence": "present",
      "agentPresence": "active",
      "mode": "cowork"
    },
    "metrics": {
      "sourceTranscriptCharacters": 20,
      "includedTranscriptCharacters": 20,
      "omittedTranscriptCharacters": 0
    }
  }
}
```

The turn is capped at 1,200 JavaScript UTF-16 code units. Extra envelope or turn fields, including page HTML, are rejected. Server and gateway failures return generic bounded errors instead of upstream response bodies. The reply can contain text and at most three offers; an offer remains a proposal until the human clicks its exact visible value.

## Evidence boundary

Run `npm run smoke:model-host` to prove the browser-to-host path with an isolated Chrome profile and deterministic model fixture. A passing run proves same-origin discovery, bounded delivery, absence of browser credentials and human-click authorization. It intentionally reports `externalModelClaim: false` and `connectedModelClaim: false`. A real provider/model run is a separate acceptance gate.
