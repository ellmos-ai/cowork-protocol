# Cowork Protocol demo video

Target length: 2:40 maximum. Delivery language: English. The final recording must
show only behavior that is verified in the release candidate used for the video.

## One-sentence story

WebMCP gives an agent an action layer; Cowork Protocol adds the attention,
authority and presence contract that turns those actions into collaboration.

> **This script records the submitted video, not the current UI.** The panel it
> shows carries the `Point / Offer / Click / Verify` rhythm bar and the
> `Action rights` selector, both replaced in 0.2 by the three-step status bar
> `Present / Working on / Role` and a derived click right - see
> [work-modes.md](./work-modes.md). The script is left as filmed so it keeps
> describing the video that exists; a re-shoot would update these two cells.

## Voice-over and shot list

| Time | Picture | Voice-over | On-screen copy |
|---|---|---|---|
| 0:00-0:12 | Logo over the shared-work key art. Cut to a cursor and an agent mark both approaching the same form. | **WebMCP gives your model tools. But tools alone do not make a coworker.** | `TOOLS ARE NOT TEAMWORK` |
| 0:12-0:28 | Three quick conflicts: too much page context, an unconfirmed change, then the human leaving while the agent waits. | To work well together, a person and an agent still need to know: What deserves attention? Who may change what? And who is working right now? | `ATTENTION · AUTHORITY · PRESENCE` |
| 0:28-0:42 | Cowork panel slides into the FormBuilder showcase. Highlight the mode, attention lens and action-rights controls. | Cowork Protocol is a small, reusable collaboration contract for any WebMCP-enabled web app. Native when available. Bridged when necessary. | `COWORK PROTOCOL` / `Point. Offer. Click. Verify.` |
| 0:42-0:59 | Point to **Full name**. Show the focus target and character count. Click the one-shot related-context control once. | Here, FormBuilder implements it natively. I point to one field, so the agent receives that field — not the whole screen. If it needs more, it can request one bounded context level with a reason. | `BOUNDED FOCUS` / `ON-DEMAND CONTEXT` |
| 0:59-1:18 | Through the native WebMCP call, create a visible suggestion. Hold on the unchanged input. Then perform the real human click and show the verified receipt. | The agent can propose an exact value, but the proposal cannot authorize itself. Only my real click applies it. The app observes the result and returns a verified receipt. | `OFFER ≠ AUTHORIZATION` / `HUMAN CLICK` / `VERIFIED` |
| 1:18-1:34 | Record **Good**, then repeat a second change and reveal only the latest readback with an omitted count. | I can evaluate the result in one click. The agent receives the latest bounded feedback and change — not an ever-growing transcript. | `LATEST ONLY` / `LESS CONTEXT, MORE SIGNAL` |
| 1:34-1:54 | Change action rights to **Delegated lease**, focus one field, then click **I'm briefly away**. Human dot turns yellow. Execute one scoped solo action. | When I step away, I grant a short lease for one field. The agent stops asking and may continue only inside that scope. When the page changes, the lease ends. | `AGENT SOLO` / `1 FIELD · 2 MIN · MAX 2 CALLS` |
| 1:54-2:06 | Click **I'm back**; show the spoken return summary. Then pause the agent and show Human Solo. | When I return, Cowork resumes and tells me what happened. If I want to work alone, I pause the agent instead. | `WELCOME BACK` / `HUMAN SOLO` |
| 2:06-2:27 | Show the adapter negotiation view or evidence harness: native Cowork Protocol, then generic host-supplied WebMCP, then no-WebMCP companion fallback. Each transition must display its reduced guarantees. | Adoption should not wait for every site to implement the protocol. The adapter chooses the best available path: native Cowork, a bounded bridge over existing WebMCP tools, or a host-provided semantic and visual fallback when WebMCP is absent. Each step exposes its guarantees instead of pretending they are equal. | `NATIVE` → `WEBMCP BRIDGE` → `COMPANION FALLBACK` / `DEGRADED GUARANTEES` |
| 2:27-2:40 | Return to the shared-work key art. Human and agent motifs converge; logo and repository/live links appear. | The bridge is scaffolding. Native adoption is the destination. WebMCP makes websites actionable. Cowork Protocol makes action collaborative. | `NATIVE WHEN AVAILABLE. BRIDGED WHEN NECESSARY.` |

The 2:06-2:27 segment is a release gate. Record it only after the automatic
adapter path and its reference host have passed their tests. If the visual
fallback still returns only a request descriptor, say **requests a bounded
visual region from its host**; never say that the adapter captured or delivered
the image itself.

## Music direction: collaboration as sound

Use a bright organic-digital call-and-response score. The concept draws on the
call-and-response principle found across many African musical traditions; it
should not imitate a single culture or rely on a generic "tribal" sample pack.
The composition should express two distinct partners learning to coordinate.

- Human voice: warm hand percussion, claps and a short wooden-mallet motif.
- Agent voice: clean synth pluck and a light digital counter-rhythm.
- Shared voice: both motifs repeat, vary and gradually land on the same pulse.
- Tonality: major or major-pentatonic, curious and capable rather than childish.
- Base tempo: about 104 BPM; no vocals and no dense melody under narration.
- Mix: narration always dominant; percussion transients softened beneath speech.

### Musical state map

| Time | Musical event | Meaning |
|---|---|---|
| 0:00-0:12 | The human motif calls; the agent motif answers one beat too late. | Both participants are present but not coordinated. |
| 0:12-0:28 | Short rhythmic overlaps and pauses, still light rather than alarming. | Tools without a collaboration contract. |
| 0:28-0:42 | A four-note shared motif appears and both rhythms lock to 104 BPM. | The protocol establishes common rules. |
| 0:42-0:59 | Sparse single-note calls with ample silence. | Token-saving attention and context only on demand. |
| 0:59-1:18 | Call on the offer, one-beat pause, unison accent on the human click, bright verification chime. | Proposal, authority and verified effect are separate events. |
| 1:18-1:34 | Earlier notes drop out; only the newest response repeats. | Latest-only readback. |
| 1:34-1:54 | Human motif fades. Agent rhythm continues alone, steady and narrower, never becoming frantic. | Scoped Agent Solo while the human is away. |
| 1:54-2:06 | Human motif returns; both phrases answer and align within two bars. On Human Solo, the synth rests. | Explicit return and explicit pause. |
| 2:06-2:27 | Full texture for native, two layers for WebMCP bridge, slower sparse pulse for companion fallback. | Reduced guarantees and higher context cost are audible. |
| 2:27-2:40 | Joyful full call-and-response, then one clean shared final hit. | Collaboration achieved. |

### Music-generation brief

> Upbeat instrumental collaboration theme, 104 BPM, bright and elegant,
> organic-digital call and response. Warm hand percussion, soft claps and a
> wooden-mallet four-note call answered by a clean synth-pluck phrase. The two
> rhythms begin slightly separate, learn each other, and lock together. Leave
> generous space for English narration. During a short solo-work passage, the
> organic motif drops out while the synth rhythm continues calmly; it returns
> and reunites in two bars. Major-pentatonic color, polished technology film,
> optimistic but not corporate, no vocals, no trailer booms, no aggressive
> bass, no stereotyped ethnic effects. End on one shared celebratory hit.

## Capture checklist

- Record at 1920×1080 with browser zoom and pointer visible.
- Use the exact release-candidate commit and capture its hash before recording.
- Show the native WebMCP discovery/calls, not only local demo buttons.
- Hold long enough to see that an offer leaves the field unchanged before click.
- Keep the human click visible and show the verified receipt immediately after.
- Record the AFK color change, the scoped solo result and the return summary.
- Use a deterministic transcript substitute in edit only as a visual aid; do
  not label it real microphone evidence unless microphone input was accepted in
  the recorded browser session.
- Put repo and live URLs on the closing card only after both resolve publicly.
- Keep the public video under three minutes and include audible narration.

