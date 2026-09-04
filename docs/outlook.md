# Outlook

This is where the work goes after the judging deadline. Everything here is an
intention, not a promise, and nothing in it is claimed as built: the measured
state of the repository is in [evidence.md](./evidence.md), and what that
document does not list has not been done.

Most of these came out of one long acceptance session on 2026-09-03 and the
night that followed it, where using the thing said more about what it still
needs than planning it ever did. They are in the order they matter, which is
not the order they are easy in.

Two items from that session are no longer here because they were finished
before the deadline rather than after it: the detached Chat window carrying
Role and Conversation at a usable size, and talking that holds the space bar
and keeps the microphone open on both surfaces. A third, attribution, shipped
as the first half of the item it belongs to and is described there.

## An agent that acts needs the whole page, not a lens

The attention lens is the right default for a model that advises: it reads what
the person points at, one character-bounded packet at a time, and it proposes.
It is the wrong shape for a model that has been handed the work. Two
measurements on the morning of the deadline said so. Under a sparring grant on
one field the seat kept asking the person to confirm, because a one-field grant
leaves it nothing else to look at; and a local agent connected over MCP, asked
to build a form in the Studio, found its focus sitting in the sample form below
and had to ask the person to change the attention mode and click the canvas
before it could work. The delivery half of the first case was fixed before the
deadline (a sparring grant is now executed on the page, single field included);
the narrowness is the part that remains.

What exists underneath: the work-mode matrix already separates advising from
executing, a grant already carries its scope and budget, and the Studio already
answers the three focus tools without a pointer when a canvas-wide grant is
running. What is missing is the view and the steering. Under a grant the agent
should receive a page-wide, character-bounded picture of its whole scope, the
canvas and the form together, and it should be able to set its own focus inside
that scope, either through a `cowork_set_focus` tool or through a focus argument
on the read, offer and execute tools. Rights keep coming from the grant and the
lease; only the attention follows the agent instead of the pointer. For the
advising model nothing changes: the lens stays, and the pointer of the person
stays the thing it reads.

## Rights per agent, instead of one model seat

Today the page asks one question before it lets a model propose:
`session.workMode.model.canPropose`. One flag, one seat. The model in the seat
and a command-line agent connected over MCP walk through the same door, and the
work-mode matrix has no way to tell them apart. The host already knows who is
calling — it carries a client name on every agent request — but that name never
reaches the authorization.

The consequence is small until two agents are present, and then it is not: a
person who grants execution rights means to grant them to somebody, and right
now there is no somebody to grant them to. The `executionMode` switch has the
same shape of problem. It reads as a per-agent permission and is in fact a
session-wide setting for the seat's own execution path.

The cheap first step, attribution, is done: every offer and every receipt now
names who produced it, whether that is the seat model, a named MCP client or a
tool call made in the page. Attribution was worth doing first on its own,
because a person cannot sensibly grant rights to actors the interface has never
shown them. It grants nothing — `canPropose` is still the one seat's flag.

What is left is the authorization half: a seat or a grant per client name, with
presence, role, budget and expiry held per actor and the cockpit listing
everyone who is present. Until that exists the documentation says plainly that
a session has one model seat. The simplification is real and it is written down
rather than glossed over.

## A page that ships a skill, not only a tool catalog

WebMCP hands an agent a tool catalog: names, descriptions, JSON schemas. That
is enough to call a tool and not enough to use a product. An agent that has
never seen a form builder learns from the catalog that it may add a field, and
learns nothing about which field types exist, which of them take answer
options, or what a finished questionnaire tends to look like.

The canvas context expansion closed part of this gap already, by putting the
palette into the one context call an agent is allowed to make. The larger idea
is that a page should be able to ship a skill: a short document describing how
to operate it, which the connecting host reads once and gives the model as a
system prompt. A well-known path such as `/.well-known/cowork-skill.md`, or a
line in `llms.txt`, would work without any protocol change at all, which is the
main argument for trying that shape first.

The alternative is a tenth Cowork tool, `cowork_read_skill`. It is the tidier
design and the more expensive one: the tool count is nine in the smokes, in the
extension, in the documentation and in every acceptance report, and moving it
is a change that touches all of them.

## Memory for the seat model, including summarizing itself

The Desktop Companion keeps a shared context manager: a bounded window of
recent turns plus a compact summary of the older ones, written mechanically. A
model connected directly to the page has none of that. Every turn it sees is
the transcript, a compact focus packet and presence, which is enough to answer
a question and not enough to carry out a job.

Work needs memory of what was done and what the person asked for. The intended
shape is the context manager behind the direct seat as well, plus a step the
mechanical summary cannot do: when the summary reaches its bound, spend one
turn asking the model to summarize its own history, and keep that instead. The
goal a grant names and the receipts already issued belong in that memory
permanently, because they are what the work is measured against.

## Choosing who answers a turn

Today the model seat answers every turn automatically, while an MCP agent acts
only when its own operator asks it to, reading and replying through
`cowork_read_turn` and `cowork_reply_turn`. Duplicate answers to one turn are
already refused by turn ID, so the mechanism is sound; what is missing is the
choice.

The page and the Companion should let a person send turns to the seat, to a
named connected agent, or to nobody, and show which one is currently answering.
The click right does not move: whoever answers, a person still authorizes.

## A WebMCP injector for pages that have none

The extension gives a page without WebMCP a bounded view and a click that stays
with the person. A more general tool would go further: read the accessibility
tree of an arbitrary page, derive tools with real schemas from what is there —
read this section, fill this field, press this control — and register them in
that page's own `document.modelContext`. Any WebMCP agent would then work
against a page that never heard of the protocol.

Most of the parts exist. The bridge package already does bounded DOM and
accessibility reads with the 350 and 1,200 character tiers, the extension
already registers Cowork tools into a foreign page, and the safety model is
unchanged: reading is free, changing is an offer that waits for a real click,
and page content is untrusted throughout.

What is unsolved is quality and size. Derived tools are only as good as the
heuristics behind them, a large page produces a catalog too big to be useful,
and a page that is hostile can put instructions in its own text. Switchable
tool sets per page type are the obvious answer to the second, and the first two
are why this is a separate module rather than a feature.

## A delegation budget the person chooses

The Studio's canvas grant is six drafts over two minutes, fixed in the code.
The protocol accepts any budget; the interface simply never offers one. A small
input in the handover block would give the number back to the person setting
the job, which is where it belongs — a twenty-question survey and a single
correction are not the same amount of trust.

## The Companion showing offers and receipts

The Desktop Companion holds the session authority, and it does not display the
session's offers or receipts even as a list. A person working from the
Companion window has to look at the page to see what was proposed and what was
verified, which defeats part of the point of a window outside the browser.

The reason it is worth stating as an outlook rather than fixing quietly is that
it is a real asymmetry in the surface vocabulary: the two bridges show the same
sections because they are the same deck, and the vehicle deliberately shows a
cockpit instead. Offers and receipts are the part of the deck the cockpit still
needs.

## The Desktop Companion may be renamed Commander

"Commander" fits the tool family this belongs to and fits the picture the
documentation already uses: the vehicle that drives a model over the bridge.
Nothing is renamed before the judging, because the video, the Devpost entry,
the documentation, the MCP server name and the code all say Companion, and a
half-applied name is worse than either name. Afterwards it is one decision with
a known cost.

## Old sessions clearing themselves out of the store

A page that links to the Companion, goes away and comes back leaves its earlier
session in the store. On a real machine this produced six link sessions for one
page, four of which had never been contacted, and the cockpit acted on one of
the dead ones — which looked, to the person using it, like the interface
springing back to a state they had left.

Sorting by most recent page contact fixed the symptom, and a page that links
again now drops its own contactless leftover. What is missing is the other
half: sessions that nothing will ever link to again should age out on their
own, rather than staying until someone notices them.
