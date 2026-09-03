import assert from "node:assert/strict";
import { test } from "node:test";

import {
  authorizeActionOffer,
  CoworkProtocolError,
  createActionOffer,
  createDelegationGrant
} from "../src/index.js";

function validGrant(overrides = {}) {
  return createDelegationGrant({
    grantId: "grant-1",
    origin: "human-click",
    goal: "Reorder question three",
    allowedCapabilityIds: ["form-move-field"],
    allowedTargetIds: ["form-field:q3"],
    maxCalls: 3,
    pageVersion: 4,
    expiresAt: "2026-09-01T10:05:00.000Z",
    ...overrides
  });
}

function offer(overrides = {}) {
  return createActionOffer({
    offerId: "offer-1",
    capabilityId: "form-move-field",
    targetId: "form-field:q3",
    pageVersion: 4,
    proposedArguments: { fieldId: "q3", direction: "up" },
    summary: "Move question three up",
    effect: "mutate",
    undoAvailable: true,
    expiresAt: "2026-09-01T10:01:00.000Z",
    ...overrides
  });
}

function utteranceEvent(overrides = {}) {
  return {
    origin: "human-utterance",
    offerId: "offer-1",
    targetId: "form-field:q3",
    pageVersion: 4,
    arguments: { fieldId: "q3", direction: "up" },
    ...overrides
  };
}

test("a real human utterance under an active grant authorizes the offer without a click - GAP-02", () => {
  const grant = validGrant();
  const authorization = authorizeActionOffer({
    offer: offer(),
    event: utteranceEvent(),
    now: "2026-09-01T10:00:00.000Z",
    grant
  });
  assert.equal(authorization.authorizationSource, "human-utterance");
  assert.equal(authorization.grantId, "grant-1");
  assert.equal(authorization.offerId, "offer-1");
});

test("a human-utterance origin without any grant is rejected - words alone are not enough", () => {
  assert.throws(
    () =>
      authorizeActionOffer({
        offer: offer(),
        event: utteranceEvent(),
        now: "2026-09-01T10:00:00.000Z"
        // no grant supplied
      }),
    { name: "CoworkProtocolError", code: "HUMAN_CONFIRMATION_REQUIRED" }
  );
});

test("an agent can never claim a human-utterance origin to authorize itself", () => {
  assert.throws(
    () =>
      authorizeActionOffer({
        offer: offer(),
        event: utteranceEvent({ origin: "agent-tool" }),
        now: "2026-09-01T10:00:00.000Z",
        grant: validGrant()
      }),
    { name: "CoworkProtocolError", code: "HUMAN_CONFIRMATION_REQUIRED" }
  );
});

test("a grant that does not cover the offer's capability or target is rejected", () => {
  assert.throws(
    () =>
      authorizeActionOffer({
        offer: offer(),
        event: utteranceEvent(),
        now: "2026-09-01T10:00:00.000Z",
        grant: validGrant({ allowedCapabilityIds: ["form-update-field"] })
      }),
    { name: "CoworkProtocolError", code: "LEASE_SCOPE_VIOLATION" }
  );
  assert.throws(
    () =>
      authorizeActionOffer({
        offer: offer(),
        event: utteranceEvent(),
        now: "2026-09-01T10:00:00.000Z",
        grant: validGrant({ allowedTargetIds: ["form-field:q4"] })
      }),
    { name: "CoworkProtocolError", code: "LEASE_SCOPE_VIOLATION" }
  );
});

test("an expired grant cannot authorize a directive even with correctly scoped arguments", () => {
  assert.throws(
    () =>
      authorizeActionOffer({
        offer: offer(),
        event: utteranceEvent(),
        now: "2026-09-01T10:10:00.000Z", // after the grant's own expiry
        grant: validGrant()
      }),
    { name: "CoworkProtocolError", code: "LEASE_EXPIRED" }
  );
});

test("a directive still needs the exact same target/pageVersion/argument binding as a click", () => {
  const grant = validGrant();
  assert.throws(
    () =>
      authorizeActionOffer({
        offer: offer(),
        event: utteranceEvent({ pageVersion: 5 }),
        now: "2026-09-01T10:00:00.000Z",
        grant
      }),
    { name: "CoworkProtocolError", code: "STALE_PAGE_VERSION" }
  );
  assert.throws(
    () =>
      authorizeActionOffer({
        offer: offer(),
        event: utteranceEvent({ arguments: { fieldId: "q3", direction: "down" } }),
        now: "2026-09-01T10:00:00.000Z",
        grant
      }),
    { name: "CoworkProtocolError", code: "STALE_FOCUS" }
  );
});

test("a forged (non-human-origin) grant object cannot authorize a directive", () => {
  const grant = { ...validGrant(), origin: "agent-simulated-utterance" };
  assert.throws(
    () => authorizeActionOffer({ offer: offer(), event: utteranceEvent(), now: "2026-09-01T10:00:00.000Z", grant }),
    { name: "CoworkProtocolError", code: "HUMAN_CONFIRMATION_REQUIRED" }
  );
});

test("the existing human-click path is completely unaffected by the grant parameter", () => {
  const authorization = authorizeActionOffer({
    offer: offer(),
    event: {
      origin: "human-click",
      offerId: "offer-1",
      targetId: "form-field:q3",
      pageVersion: 4,
      arguments: { fieldId: "q3", direction: "up" }
    },
    now: "2026-09-01T10:00:00.000Z"
    // no grant needed for a click
  });
  assert.equal(authorization.authorizationSource, "human-click");
  assert.equal("grantId" in authorization, false);
});

// --- Review fixes 2026-09-03: the utterance path honors the grant's budget and version ---

test("a grant's call budget bounds utterance authorizations", () => {
  const grant = validGrant({ maxCalls: 1 });
  const first = authorizeActionOffer({
    offer: offer(),
    event: utteranceEvent(),
    now: "2026-09-01T10:00:30.000Z",
    grant,
    callsUsed: 0
  });
  assert.equal(first.authorizationSource, "human-utterance");
  assert.throws(
    () =>
      authorizeActionOffer({
        offer: offer(),
        event: utteranceEvent(),
        now: "2026-09-01T10:00:30.000Z",
        grant,
        callsUsed: 1
      }),
    (error) => error instanceof CoworkProtocolError && error.code === "LEASE_EXPIRED"
  );
});

test("a grant issued for another page version cannot authorize an utterance", () => {
  assert.throws(
    () =>
      authorizeActionOffer({
        offer: offer(),
        event: utteranceEvent(),
        now: "2026-09-01T10:00:30.000Z",
        grant: validGrant({ pageVersion: 3 })
      }),
    (error) => error instanceof CoworkProtocolError && error.code === "STALE_PAGE_VERSION"
  );
});

test("createDelegationGrant rejects a missing grant id", () => {
  assert.throws(
    () => validGrant({ grantId: undefined }),
    (error) => error instanceof CoworkProtocolError && error.code === "LEASE_SCOPE_VIOLATION"
  );
});
