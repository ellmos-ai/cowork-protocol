# Integrating an existing app with Cowork Protocol

FormBuilder Studio's Build/Fill/Export section (`src/form-builder.mjs`,
`src/fodt-export.mjs`, `src/builder-view.js`) was built and works completely
on its own first — see the [solo-mode test](test/form-builder.test.js) and
`npm run smoke:builder`. This document is the story of what it took to *then*
connect that already-finished product to Cowork Protocol, written for someone
integrating a different existing app. Nothing here is invented after the
fact: it is the actual sequence this repository's commits followed.

## Why the order matters

Building the product first and integrating second is not just a process
preference. A codebase where "the app" and "the Cowork wiring" can't be told
apart usually means Cowork is load-bearing for basic functionality, which is
exactly the failure mode the protocol is meant to avoid — an agent should be
a guest with a scoped invitation, not part of the foundation. Doing it in two
commits made that separation checkable rather than aspirational: the [solo
mode test](test/form-builder.test.js#L177) statically greps
`form-builder.mjs` for any `packages/*` import and fails the build if one
appears.

## What your app needs before you start

1. **Stable, immutable identifiers.** Every mutable thing an agent might
   target needs an ID that survives edits and never changes for a given
   object. FormBuilder's fields already had this for value changes
   (`element.id` from `form-engine.mjs`, matching the upstream
   `formularerstellen-form-v1` schema's field-ID contract in
   `../FormularErstellen/EXPORTFORMAT.md`). Adding *structural* editing
   required nothing new here: `createField()` mints an id once
   (`crypto.randomUUID().replace(/-/g, "")`) and every other core function
   (`insertField`, `updateField`, `moveField`, `removeField`) refuses to
   change it.
2. **A DOM anchor per mutable region, if the mutation targets an element.**
   The pre-existing value-change wiring uses `data-field-id` on each
   `.form-field`; `builder-view.js` puts the same attribute on every canvas
   row, which is what lets the attention lens point at one field rather than
   only at the canvas. The *canvas-wide* capabilities need no anchor of their
   own — see "Focus is not always one element" below.
3. **A version counter that increments on every state change that matters to
   an agent.** FormBuilder already had one page-wide `pageVersion`. Builder
   keeps a *separate* counter for its own canvas
   (`builder-view.js`'s internal `pageVersion`, exposed as
   `controller.getPageVersion()`), because the canvas and the demo form are
   unrelated pieces of state — see "One page can have more than one focus
   target" below.
4. **A pure function that can describe "what changed" without touching the
   DOM.** `form-builder.mjs`'s `insertField`/`updateField`/`moveField` all
   take the current array and return a new one; nothing here reads or
   writes `document`. That purity is what makes the mutation *plannable and
   verifiable* in the next step, and what makes it testable without a
   browser.

## The four-step contract you extend

Cowork Protocol's core primitives (`packages/core`) implement one contract:
**offer → human click → authorization → plan → apply → verify**. Every
existing FormBuilder capability (`form.set_value`, `form.clear_value`) uses
it. Adding new capabilities means writing one new *plan* function per
capability family, never a new transport primitive:

| Step | Who does it | What it calls |
| --- | --- | --- |
| Focus | app | `buildFormBuilderCanvasFocus()` — new, in `packages/formbuilder-connector` |
| Offer | app (or an agent through the existing `cowork_offer_action` WebMCP tool) | `createActionOffer()` — unchanged, from `packages/core` |
| Click | human, real trusted click only | `authorizeActionOffer()` — unchanged |
| Plan | app | `planAuthorizedBuilderFieldMutation()` — new, in `packages/formbuilder-connector` |
| Apply + verify | app | `insertField`/`updateField`/`moveField` (`form-builder.mjs`) + a verification check, in `src/builder-cowork.js` |
| Receipt | app | `createActionReceipt()` — unchanged |

No new WebMCP tool was added. `cowork_offer_action`, `cowork_execute_solo`
and the other seven tools are generic dispatchers over a `capabilityId`
string; adding `form-add-field`, `form-update-field` and `form-move-field`
to the set of valid capability IDs is exactly as far as the surface area
needed to grow. `npm run smoke:webmcp` and `smoke:companion-native` both
assert `nativeToolCount === 9` for this reason — that assertion is the
regression test for "capabilities are cheap, tools are not."

## The integration owns no UI of its own

This is the part that changed most between the first working version and
this one, and it is the reusable lesson.

The first version gave the Builder its **own** Cowork surface inside the
Build tab: a "Model suggestions" section (offer chips, receipts, a seat
badge, a Clear button), a "Delegate to the model" section (goal, call-budget
and duration inputs plus four buttons) and a "Say what to do" section (a
directive input and a status line). It worked, and it was still wrong: the
page now carried **two** Cowork instruments whose fields largely repeated
each other. The objection that removed it was exactly that — the second set
of controls looked like the first set, and a protocol whose whole claim is
that it is provider-agnostic and brings *one* instrument should not sprout a
new one per integrated region.

So the three sections are gone from `index.html`, and `src/builder-cowork-ui.js`
renders nothing. The one Cowork panel serves both canvases.

What survived is the part that was never a duplicate — the layer that knows
what a *form field* is, sitting on top of the protocol:

| File | What it is | Changed by the fold? |
| --- | --- | --- |
| `src/builder-cowork.js` | the bridge: offers, grants, `soloExecute`, `directiveFromUtterance`, `endDelegation`, awaiting-feedback, receipts | no |
| `src/builder-model-suggester.js` | routes a field suggestion through the page's model seat and rejects a reply that names a type the palette does not offer | no |
| `src/builder-directive-classifier.js` | the disclosed keyword heuristic behind "make it required" | no |
| `src/builder-cowork-ui.js` | **headless adapter** — exports `initBuilderCowork` (previously `initBuilderCoworkUi`) | rewritten |
| `src/builder-view.js` | the cowork-free Build/Fill/Export product | no |

`initBuilderCowork` still owns the Builder's Cowork state — attention
target, pending offers, the active grant, drafted fields, directives — and
still touches exactly two things in the DOM, because they are canvas
row states that no panel can own: `.is-focused` on the pointed-at row and
`.is-new-since-handover` on the rows a returned delegation touched. It
reports focus changes upward through an `onFocusChange` callback and returns
everything else (`pendingOffers`, `readReceipts`, `readActiveGrant`,
`suggestField`, `draftOne`, `draftBatch`, `endGrant`, `directive`, …) for
`app.js` to render in the panel.

**Test consequence, worth knowing before you copy this:** the unit tests did
not change when the UI did. `test/builder-cowork.test.js` and
`test/builder-delegation.test.js` import `builder-cowork.js` directly and
never imported the UI module at all. Keeping the DOM glue in a layer that
owns no contract is what made a surface rewrite cheap.

## What the one panel had to learn

Serving a second canvas from the existing panel is not free — these are the
seams, and each one is a decision another integration will face:

| Panel element | On the demo form | On the Studio canvas |
| --- | --- | --- |
| Attention lens (`#focus-label`, `#area-label`) | the focus packet from the connector | `Pointing at: <label> (Studio canvas)` |
| Offer list (`#offer-list`) | value offers | field offers, detail prefixed `Studio canvas · ` |
| Receipt list (`#receipt-list`), `#receipt-count` | demo receipts | Studio receipts first, newest first, capped; the count sums both sources |
| Verdict buttons (Good / Adjust / Different) | on the demo change | on the newest Studio receipt while one awaits a verdict |
| Handover (`#lease-goal`, `#hand-over`, `#away-short`, `#away-long`) | field-scoped demo lease | canvas-scoped grant, also adopted as the session lease |
| Return (`#return-human`) | the session's return summary | `endDelegation()`'s bounded delta, written to `#system-status` |
| Conversation (`#conversation-input`, push-to-talk) | one bounded turn | a directive first; if unrecognized, one proposed field |
| `#demo-offer` | "Create local demo offer" | "Model suggests a field" |

Three of those seams needed a real decision rather than a merge:

**Exactly one attention target at a time.** Two lenses that can both be lit
are two lenses. Pointing at a Studio row sets `builderFocus` and clears the
demo form's focus packet; pointing back at a demo field calls the adapter's
`clearFocus()`. Both readouts are derived from that single variable, so the
panel can never claim to be pointing at two places.

**The grant became the session's lease.** The Builder's grant used to be a
self-contained readout next to a presence indicator it knew nothing about —
the page had two answers to "is anyone here?". Now `builderHandover()` mints
the grant and immediately adopts it as the session lease
(`adoptBuilderGrantAsLease`), so the panel's presence display, work-mode
resolution and expiry clock describe the Studio delegation as readily as the
demo one. One handover, one clock.

**The budget stopped being a human input.** The Delegate dialog let you type
a call budget and a duration. Moving the handover onto the panel's existing
buttons left nowhere honest to put two more number fields — and those buttons
already name the only distinction that mattered in practice: *stay and watch*
draws one draft per click, *step away* lets the model spend the budget. The
budget is now a named constant in `app.js` (`BUILDER_GRANT_MAX_CALLS = 6`,
`LEASE_DURATION_MS`), and `#lease-microcopy` is generated from those
constants rather than hand-typed, so the sentence describing the grant cannot
drift from the grant. The trade is real and worth naming: a per-run
configurable budget is no longer reachable from the UI.
`createDelegationGrant()` in `packages/core` still accepts any budget, so a
host that wants to expose it can — this page decided not to.

## Two things this integration had to decide that a value-change capability
## doesn't

**Focus is not always one element.** `buildFormBuilderCanvasFocus()` returns
a focus packet whose `targetId` is the fixed string `form-builder:canvas`,
not a per-field id. Structural edits that *add* to the list act on the list,
and there is no single existing DOM node that represents "the list" the way
`#full-name` represents one field. Picking a synthetic, stable target id for
a *region* rather than an *element* is the reusable idea here, not the
specific string. Capabilities that patch an existing field
(`form-update-field`, `form-move-field`) do address one row, through
`builderFieldTargetId()`'s `form-field:<id>`, and reject a target that does
not name the field their own arguments patch — which is why both kinds of
target coexist rather than one replacing the other.

**Verification means re-deriving proof from the result, not trusting the
plan.** `planAuthorizedBuilderFieldMutation()` only tells you *what should
happen* (`{ operation: "add-field", field, index }`); it never touches
`state.elements`. `builder-cowork.js`'s `authorizeAndApply()` applies the
plan with the ordinary product function (`insertField`) and then checks the
result independently (`nextElements.some(e => e.id === plan.field.id)`)
before it will report `status: "verified"`. This is the same shape as the
existing `executeOffer()` in `app.js`, which sets `control.value = plan.
nextValue` and then re-reads `control.value` rather than assuming the
assignment worked — carried over here because "trust but verify" is the
point of a receipt, not an implementation detail.

## What actually broke, so you don't have to rediscover it

Writing `npm run smoke:builder` (a real headless-Chrome acceptance, not a
Node-only unit test) caught a bug neither the unit tests nor manual code
review had: `renderFillTab()` cleared the `<form>` with
`form.textContent = ""` and only re-appended the submit button when the
canvas had at least one field. On the very first render (0 fields, which is
the app's actual starting state) the button was detached and never
recovered, because every later render re-queried
`form.querySelector("button[type=submit]")` against a form that no longer
contained it. No unit test exercised this because none of them render the
*initial, empty* state through the same code path a real page load does. The
fix (`form.append(submitButton)` unconditionally, outside the empty/non-empty
branch) is one line; finding it needed a browser. If your app has an
"empty state" branch anywhere near code a Cowork capability will also touch,
budget for a real browser smoke, not just fixtures.

## Testing this integration without inventing new infrastructure

- `packages/formbuilder-connector/test/builder-canvas.test.js` — the plan
  function alone: valid operations, boundary rejections, an offer whose
  human-click authorization doesn't match it, and a page-version mismatch
  that must fail closed (`STALE_PAGE_VERSION`).
- `apps/formbuilder-showcase/test/builder-cowork.test.js` — the full
  offer → apply loop against the real `form-builder.mjs` functions: an
  offer that is proposed but never clicked leaves the canvas untouched, an
  expired offer cannot be authorized, and add/update/move all apply through
  the same bridge.
- `apps/formbuilder-showcase/test/builder-delegation.test.js` — grants,
  solo drafting, the utterance-authorized directive path and the
  awaiting-feedback state, again against the bridge rather than a rendered
  page.
- `npm run smoke:builder` — the real browser, and now the only place the
  *panel* wiring is exercised end to end: point at a Studio row and read the
  panel's attention lens, propose a suggestion and confirm exactly one inert
  offer chip in the panel's own offer list, click it, confirm the canvas
  changed by exactly the offered amount and that the panel's receipt says
  `Verified`, hand over and return, and apply a recognized directive with no
  offer chip and no second click. The Studio smoke runs without WebMCP; that
  the tool count is still 9 is confirmed by `npm run smoke:webmcp`.

None of these needed a new test *framework* — they reuse `node:test`,
`node:assert/strict` and the existing Chrome DevTools Protocol smoke pattern
from `scripts/accessibility-browser-smoke.mjs`.
