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
   `.form-field`. Builder's structural capabilities target the *canvas as a
   whole*, not one field, so no new DOM attribute was needed — see "Focus is
   not always one element" below.
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

## Two things this integration had to decide that a value-change capability
## doesn't

**Focus is not always one element.** `buildFormBuilderCanvasFocus()` returns
a focus packet whose `targetId` is the fixed string `form-builder:canvas`,
not a per-field id. Structural edits (add/reorder) act on the *list*, and
there is no single existing DOM node that represents "the list" the way
`#full-name` represents one field. Picking a synthetic, stable target id for
a *region* rather than an *element* is the reusable idea here, not the
specific string.

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
- `npm run smoke:builder` — the real browser: propose a suggestion, confirm
  exactly one inert offer chip exists, click it, confirm the canvas changed
  by exactly the offered amount, confirm the receipt says `Verified`, and
  confirm the WebMCP tool count is still 9.

None of these needed a new test *framework* — they reuse `node:test`,
`node:assert/strict` and the existing Chrome DevTools Protocol smoke pattern
from `scripts/accessibility-browser-smoke.mjs`.
