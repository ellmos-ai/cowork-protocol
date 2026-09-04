# Roadmap

What comes after the judging, in the order it matters. Everything here is an
intention; the measured state of the repository is
[docs/evidence.md](docs/evidence.md), and [docs/outlook.md](docs/outlook.md)
explains the larger items in full. Nothing below is claimed as built. The
submitted code is commit `e4a35ce`; this file and the outlook are documentation
that followed it before the deadline.

## 1. The protocol: agents that act

- **Whole-page view and self-steered focus under a grant.** An advising model
  reads the lens; an executing agent gets its whole scope, canvas and form
  together, and sets its own focus inside it (`cowork_set_focus` or a focus
  argument on read, offer and execute). Rights stay with the grant and the
  lease. Outlook: *An agent that acts needs the whole page, not a lens*.
- **Rights per agent** instead of one model seat for everyone: each connected
  agent holds its own identity, its own grant and its own budget, and every
  offer and receipt names who made it. Attribution shipped as the first half.
  Outlook: *Rights per agent*.
- **A page that ships a skill.** Next to the tool catalog the page hands the
  agent a short, bounded guide to itself; `docs/agent-guide.md` is the manual
  version for the FormBuilder. Outlook: *A page that ships a skill*.
- **Memory for the seat model,** including summarizing its own conversation
  when it grows past the budget. Outlook: *Memory for the seat model*.
- **Choosing who answers a turn** when a seat model and an agent over MCP are
  both connected. Outlook: *Choosing who answers a turn*.

## 2. The bridges: the extension and the page

- **The extension registers the nine Cowork tools in `document.modelContext`
  of any page,** so a WebMCP-capable browser agent can work through the
  Bridge with its own chat, not only the Companion. Today the Bridge speaks to
  foreign pages over its internal message channel only.
- **A general WebMCP injector** for pages that carry no `modelContext` at all.
  Outlook: *A WebMCP injector*.
- **The Bridge steps back on pages that carry their own panel:** one line
  "This page has its own Cowork panel" instead of two panels side by side.
- **The same sections on both bridges and the vehicle:** the Companion shows
  the offers and receipts of the page it is linked to, and the Bridge shows the
  same lens, role, conversation and handoff blocks as the embedded panel.
  Outlook: *The Companion showing offers and receipts*.

## 3. The vehicle: the Desktop Companion

- **Sessions that nothing will link to again age out of the store** instead of
  waiting for someone to notice them. Outlook: *Old sessions clearing
  themselves out of the store*.
- **A name that says what it is.** "Commander" is on the table for the
  Desktop app; the Bridge keeps its name. Outlook: *The Desktop Companion may
  be renamed Commander*.
- **Codex CLI as a measured local agent** over the same MCP server that
  Claude Code used. Not measured yet, so not claimed.

## 4. The showcase

- **Show the cooperation as a product,** not as a demo: a form you would
  actually build with a model, where the protocol is what makes it pleasant.
  The comparison that set this bar was a browser video studio driven over
  WebMCP with human release stages.
- **A delegation budget the person chooses** in the handoff block instead of
  the fixed six drafts in two minutes. Outlook: *A delegation budget*.
- **Design leftovers from the acceptance session:** the model seat directly
  under the status line with only the demo switch marked as the showcase
  add-on, a surfaces row (embedded, Bridge, Companion) with state chips in the
  header, and the small wording slips ("Welcome back" after a handover the
  person watched). Check each against the current panel first; the folds,
  header icons, microphone icons, hold-to-talk and the Chat window were
  finished in the final night.

## Not on this list

Withdrawn npm packages stay deprecated rather than unpublished, and the Chrome
Web Store listing follows the repository, not the other way round.
