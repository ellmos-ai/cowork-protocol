# Work modes: who is here, who works, who may click

Cowork Protocol 0.2 replaces the interaction rhythm *Point → Offer → Click →
Verify* and the separate "Action rights" setting with one matrix.

The old rhythm mixed the two participants into one line. "Point" is something a
human does, "Offer" something a model does, "Click" a human again. It described
a single scripted exchange, not the state the session is actually in. Worse, the
same situation could be entered twice: a paused model was reachable both through
the presence control and through the action-rights menu, and the two could
disagree.

The new model asks four questions, in this order:

1. **Clarify your status** — who is here?
2. **Clarify how you work together** — who acts, who advises?
3. **Clarify what the model sees** — how much context, through which lens?
4. **Clarify the model's job** — what may it do?

Only the first two are chosen. The other two follow, and the click right follows
with them.

## The two status variables

Each actor — the human and the model — carries exactly two values.

| Variable | Values | Meaning |
| --- | --- | --- |
| `availability` | `here` · `standby` · `away` | Can this actor take part right now? |
| `role` | `acting` · `observing` | What is it doing while it is here? |

The two actors use the same vocabulary. A human on `standby` stepped away for a
moment; a model on `standby` is attached but not working. A human that is `away`
left; a model that is `away` is disconnected. This symmetry is the point: the
panel shows two figures, and both are read the same way.

`role` only means anything while an actor is `here`. Availability answers *can
you*, role answers *do you*.

## The derived work mode

`resolveWorkMode()` in `packages/core` turns the four values plus one switch
into the whole rest of the state. Nothing else in the system decides who may
click.

| Human | Model | Simultaneous | Work mode | Authority |
| --- | --- | --- | --- | --- |
| here, acting | here, acting | allowed | `parallel` | both |
| here, acting | here, acting | not allowed | `cowork` | human |
| here, acting | here, observing | — | `cowork` | human |
| here, acting | standby or away | — | `human-solo` | human |
| here, observing | here, acting | — | `cowork` | model |
| standby or away | here, acting | — | `model-solo` | model |
| here, observing | here, observing | — | `idle` | nobody |
| here, observing | standby or away | — | `idle` | nobody |
| standby or away | here, observing | — | `idle` | nobody |
| standby or away | standby or away | — | `idle` | nobody |

Three rules make the table readable:

- **Solo means the partner is not here.** Human solo is not "the model is
  forbidden to act"; it is "the model is not in the room". A model that *is*
  here and merely watches makes this cowork, not solo — because it can still
  speak up.
- **Cowork means one acts and the other advises**, and which one can change
  mid-session without anything being reconfigured.
- **Both at once needs an explicit allowance.** Simultaneous authority is only
  useful when the two are not in each other's way ("I do this, you do that").
  It is off by default.

### Authority is the click right

`authority` is not a fifth setting. It is a name for the answer to "who acts",
and it *is* the permission to click, type and change the page:

```
canExecute(actor) = authority is this actor (or both)
canPropose(actor) = actor is here and does not hold authority
```

That is the whole rights model. A model with authority may act within its scope;
a model without it may only propose, and a human click turns the proposal into a
change. There is no separate "Action rights" control any more, because there is
nothing left for it to decide. The old four action modes map onto the matrix
without remainder:

| Old `actionMode` | New state |
| --- | --- |
| `explain` | model `here` + `observing` |
| `suggest` | model `here` + `observing` — the same state |
| `delegated` | model `here` + `acting` (authority model) |
| `paused` | model `standby` |

`explain` and `suggest` were never two things. A model that watches and explains
is a model that can also suggest; whether it phrases its next sentence as a
comment or as an offer is a question about that sentence, not about the session.
Merging them removes one of the double bookings that motivated this rework.

### The conflict rule: the hand on the mouse wins

If both actors are set to `acting` and simultaneous work is not allowed, the
human keeps authority and the model falls back to advising. This is not a
tie-break invented for the table; it is the return path of the typical session:

> The human writes a prompt. The model works, the human watches. The human signs
> off and leaves; the model finishes the agreed job alone. The human comes back —
> by click or by voice — and now the model advises while the human acts.

Nothing is reconfigured at any step. The human's return sets one variable, and
the mode, the authority and the model's job all follow.

### Authority needs a record, not just an intent

A model set to `acting` while the human is away has to show *why* it may act.
That record is the solo lease, or a delegation grant: human-authored goal,
bounded scope, limited number of calls, an expiry. `resolveWorkMode()` takes it
as `modelAuthorityValid`; if the record is missing or expired, the model falls
back to `observing` and the resolver reports `authorityLapsed`. The role is the
intent, the record is the evidence, and only evidence grants the click.

While the human is present, presence *is* the living authority — the human is
right there and can stop anything — so a cowork session with the model acting
needs no lease.

## The four clarify steps as a bar

Every surface shows the same four-step bar, filled from one shared vocabulary
(`CLARIFY_STEPS` in `packages/reference-ui`):

| Step | Label | Answers |
| --- | --- | --- |
| 1 | Your status | who is here — the two figures |
| 2 | How we work | the work mode and the simultaneous switch |
| 3 | What the model sees | the attention lens |
| 4 | The model's job | advise, work, stand by — derived, shown not chosen |

Step 4 is a readout. It is in the bar because the *question* matters to the
human even though the *answer* is computed.

## Transitions

Both directions work, and they cannot disagree, because both run through the
same function.

| Trigger | Effect |
| --- | --- |
| Click a figure | cycles that actor's status: `here-acting` → `here-observing` → `standby` → `away` → … The work mode follows. |
| Pick a work mode | `statusForWorkModeChoice()` sets both actors' status. The figures follow. |
| A prompt, typed or spoken | hands the model the acting role for that job; the human keeps watching. |
| "I'm briefly away" / "away longer" | human `standby` / `away`, with a goal that mints the authority record. |
| "I'm back", or any click on the page | human returns to `here` + `acting`; the conflict rule takes authority back. |
| The authority record expires | the model returns to advising, and the session says so instead of stopping silently. |

Clicking a figure is how you change your partner's status, because the person
clicking is always the human: clicking the model figure parks or wakes the model,
clicking your own figure says whether you are working or watching.

## The attention lens is not a mode

The lens answers "what reaches the model" and has two jobs that pull in
different directions:

- **Attention** — put the right thing in front of the model for the current
  task. A pointer-following lens suits a live pair; a click-pinned lens suits a
  model working alone through a list.
- **Token economy** — every level of context costs. The lens is where that cost
  is spent deliberately.

Because neither is the same question as "who may click", the lens stays
adjustable and is not folded into the work mode. It is step 3 of the bar, not a
property of step 2.

## What did not change

The wire is still 0.1. Presence events, action offers, authorizations, receipts,
solo leases, delegation grants and the nine native WebMCP tools keep their
published shapes, and `resolvePresenceMode()` still resolves the four 0.1 modes.
`toLegacyPresence()` and `fromLegacyPresence()` translate in both directions, and
the legacy `effectiveMode` is derived from the legacy values themselves, so a 0.1
consumer that re-resolves the mode always agrees with us.

The 0.1 wire carries a single "who is working" bit, and it sits on the agent
(`agentEngagement`). Plain 0.1 cowork with no engagement field is the
offer-and-click rhythm, so it reads back as the human holding the click right.

The finer distinctions the matrix adds — who holds authority, both at once,
nobody acting — live in the new `workMode` field and in the surfaces, not on the
0.1 wire.

## Where this lives

| Concern | File |
| --- | --- |
| The matrix, authority, legacy bridge | `packages/core/src/index.js` |
| Every visible word and badge | `packages/reference-ui/src/index.js` |
| Showcase panel | `apps/formbuilder-showcase/` |
| Browser side panel | `apps/browser-companion/` |
| Desktop Companion | `apps/desktop-companion/` |

No surface writes its own status wording. Three surfaces that spell their own
labels drift apart within a week; one vocabulary module is why the side panel and
the Companion say "Model is advising" in the same words.
