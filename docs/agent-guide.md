# Build a form with your agent

This is the page's side of the contract, written for whatever is reading the
tools: a WebMCP agent that discovered them in the browser, or an MCP client
like Claude Code or Codex reaching the same nine tools through the Desktop
Companion. Both see one surface and one rule — you propose, the human clicks.
The MCP route is exercised by a test client written for this repository; a
session by a shipped agent has not been measured yet, so read this as the
contract you will meet rather than a report of one that ran.

The examples build a form in FormBuilder Studio, which is the surface that
carries the tools today. Nothing here is Studio-specific except the capability
names.

## What you cannot do, and why that is the point

You cannot change the page. Every tool that looks like a write is a proposal:
`cowork_offer_action` creates something visible that sits there until a human
presses it, and `cowork_execute_solo` writes only inside a lease a human
already granted, within its scope and its call budget. An agent that reports
"I added the field" after calling `cowork_offer_action` has said something
untrue, and the receipt will not agree with it.

This is why the tools are worth using rather than routing around: what you
propose is attributable, reversible and visibly yours.

## The nine tools, in the order a build actually uses them

| Step | Tool | What it gives you |
|---|---|---|
| 1 | `cowork_read_focus` | Where the human is pointing, and what may be done there |
| 2 | `cowork_read_presence` | Whether the human is here, away, or has paused you |
| 3 | `cowork_request_context` | More about the focused target, one bounded level at a time |
| 4 | `cowork_read_turn` | The latest thing the human typed or said to you |
| 5 | `cowork_reply_turn` | Your answer, optionally carrying offers |
| 6 | `cowork_offer_action` | One proposed change, inert until clicked |
| 7 | `cowork_read_changes` | The latest change and what caused it |
| 8 | `cowork_read_feedback` | The human's verdict on a verified result |
| 9 | `cowork_execute_solo` | A change under an active lease, while the human is away |

Read focus before anything else. Every other tool is answered relative to it,
and an offer aimed anywhere else is refused rather than redirected.

## Where an agent learns the formats

Nothing about this page is in your training data, so the page has to tell you.
It does that in two places, and between them you can build a form you have
never seen the source of.

**The tool catalog** — each tool's description and JSON schema. That is where
the capability names live, what `value` accepts, and the bounds on every
string. Read it before guessing; it is served fresh by the page, so it is
right even when this document is not.

**`cowork_request_context` on the canvas** — a schema can say `paletteId` is a
string, but not *which* string a "how often does this happen" question needs.
Ask for context while the canvas holds the attention and the answer carries
`fieldTypes`: every field type with its id, the name the human sees, whether it
takes answer choices, and one clause saying what it is for. Alongside it come
the form's title, its field count and as many existing labels as fit.

That is one call, and after it you know the whole vocabulary. If the form is
long, labels are dropped before field types are — a label you are missing is
readable off the field targets, a field type you are missing costs you the
format.

## Focus decides what you may offer

The Studio has two kinds of target, and they carry different capabilities:

- **`form-builder:canvas`** — the form as a whole. `form-add-field` lives here
  and only here, because a new field has no existing field to attach to.
- **`form-field:<id>`** — one field the human is pointing at.
  `form-update-field` and `form-move-field` live here.

So adding a field requires the human's attention to be on the canvas, not on a
row. If you offer `form-add-field` against a field target you get
`CAPABILITY_UNAVAILABLE` — the offer is not silently moved to the canvas,
because that would be you choosing the target instead of the human.

## The `value` field: a label, or JSON when a label will not do

`cowork_offer_action` carries one string, `value`. For a plain field the label
is enough, optionally prefixed with a field type:

```json
{ "capabilityId": "form-add-field", "targetId": "form-builder:canvas",
  "value": "date: Preferred date", "summary": "Add a date field" }
```

A field with answer choices cannot be described that way, and trying is a real
failure rather than a hypothetical one: asked for a question with the answers
1 to 8 or more, a model wrote them into the question itself — the Studio showed
`How many kids do you have? (1, 2, 3, 4, 5, 6, 7, 8+)` above two untouched
options still named "Option 1" and "Option 2". Send JSON instead:

```json
{ "capabilityId": "form-add-field", "targetId": "form-builder:canvas",
  "value": "{\"paletteId\":\"checkbox-single\",\"label\":\"How many kids do you have?\",\"options\":[\"1\",\"2\",\"3\",\"4\",\"5\",\"6\",\"7\",\"8 or more\"]}",
  "summary": "Add the number-of-children question" }
```

`value` is a JSON **string**, not a nested object — the offer boundary carries
text, so the whole packet stays reviewable at its character bound.

To change an existing field, send a patch:

```json
{ "capabilityId": "form-update-field", "targetId": "form-field:<id>",
  "value": "{\"label\":\"How many children?\",\"options\":[\"1\",\"2\",\"3 or more\"],\"required\":true}",
  "summary": "Shorten the question and its choices" }
```

A patch may never carry `id` or `type`. Those two are what a receipt is checked
against, so changing them would make the verification meaningless; the
connector refuses the offer with `INVALID_ARGUMENTS` rather than letting it
fail after the human has already clicked.

**What `options` accepts.** Between 2 and 12 choices, each at most 60
characters, duplicates removed. Only `checkbox-single` (Choose one) and
`checkbox-multi` (Choose any) render them; the other field types have none. A
list outside those bounds costs you the choices, not the field: the field is
offered without them and the summary the human reads says why. Nothing is
trimmed into shape and no choice is invented, because a silently shortened set
of answers is a different question from the one that was asked.

**Field types.** `heading`, `description`, `text-short`, `text-long`, `date`,
`checkbox-single`, `checkbox-multi`, `separator`. An unknown type is refused
rather than matched to the nearest one.

## Two ways to build a whole form, and both are bounded

**With the human watching: three offers at a time.** At most three offers can
be open at once; a fourth is refused with `CONTEXT_BUDGET_EXCEEDED`. The limit
is not a rate limit but a review limit — a human handed a queue stops reading
it and starts approving it, which is exactly the failure the protocol exists to
prevent. Offer one change, let it be decided, then offer the next.

**With the human away: one grant, six drafts.** A twenty-question survey is not
a job for sixty round trips, so a human can hand over a canvas-scoped grant
instead. Fields then land on the canvas with no click at all — that is what the
grant *is* — and the budget is the whole authority: six drafts, then the next
call is refused however it is phrased. The human ends the grant when they come
back and reads what arrived.

So the honest answer to "can you build my questionnaire alone?" is: as far as
the grant reaches, then you stop and it gets looked at. That is the design,
not a limitation to work around.

## The four refusals you will actually meet

- **`STALE_FOCUS`** — the human has looked somewhere else since you read focus.
  Read it again; do not re-aim the offer yourself.
- **`CAPABILITY_UNAVAILABLE`** — that capability does not exist on that target,
  such as adding a field while a single row holds the attention.
- **`SESSION_PAUSED`** — the human paused you. Nothing you send will land until
  they resume, and retrying is only noise.
- **`CONTEXT_BUDGET_EXCEEDED`** — something exceeded a bound: three open offers
  already, or a packet past its character limit. Send less, not more often.

All four refuse one call rather than breaking the session. The right response
is usually to read state again, not to retry the same call.

## A brief a human can hand you

Everything above is what the tools enforce. This is what it sounds like from
the other side — a person giving their agent a job:

> Open the FormBuilder Studio showcase and use the Cowork tools. Build me a
> survey on how often parents observe which kinds of conflict and violence
> between siblings. Frequency questions should be Choose-one with a proper
> scale, the kinds of conflict Choose-any, and leave room for one written
> answer at the end. Offer them one at a time so I can look at each one before
> it lands, and tell me what each offer will do before I click it. I will read
> the whole thing afterwards.

Nothing in that brief names a tool, and it does not have to. Read focus, notice
the canvas, ask for context once to learn the field types, then offer the
heading, wait for the receipt, offer the next.

Note what the brief does *not* say: which field type a frequency scale needs,
or what the scale's answers should be. That is yours to choose — the palette
tells you `checkbox-single` takes options, and "never" through "very often" is
a scale a person can answer. What is not yours is inventing the *subject*: if
the human names the answers, use theirs.

For a survey this long, expect the human to hand over a grant rather than click
sixty times. Six drafts land, then you stop — which is why the first six should
be the questions the form cannot do without.

## Measured

The number-of-children example is a real run, not an illustration:
qwen3.8:27b-mlx on the model host, given that sentence, returned
`checkbox-single`, the label `How many kids do you have?` with no choices in
it, and the eight options as a list.

| Run | Time |
|---|---|
| First | 21.3 s |
| Second | 18.9 s |

Both on 2026-09-04. See [evidence.md](evidence.md).
