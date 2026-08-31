import assert from "node:assert/strict";
import test from "node:test";

import {
  createLegacyHostCompanion
} from "../src/index.js";
import { CoworkProtocolError } from "../../core/src/index.js";

function createFixture(overrides = {}) {
  const presented = [];
  const executed = [];
  const visualRequests = [];
  const contract = createLegacyHostCompanion({
    sessionId: "legacy-companion-session",
    getTargetSnapshot: async () => ({
      pageVersion: 3,
      target: {
        stableId: "project-title",
        tagName: "input",
        role: "textbox",
        label: "Project title"
      }
    }),
    getNearbySemanticText: async () => "Nearby help ".repeat(80),
    getAccessibilityRegionText: async () => "Region structure ".repeat(120),
    requestVisualRegion: async ({ request }) => {
      visualRequests.push(request);
      return {
        referenceId: "host-region-1",
        width: request.maximumWidth,
        height: request.maximumHeight,
        delivery: "out-of-band"
      };
    },
    presentActionOffer: async ({ offer }) => {
      presented.push(offer);
    },
    executeAuthorizedAction: async ({ offer, authorization }) => {
      executed.push({ offer, authorization });
      return { verified: true, observedValue: offer.proposedArguments.value };
    },
    ...overrides
  });
  return {
    companion: contract.agent,
    host: contract.host,
    presented,
    executed,
    visualRequests
  };
}

test("legacy host companion expands semantic context before requesting pixels", async () => {
  const { companion, visualRequests } = createFixture();
  await companion.readFocus({ lens: "pointer" });

  const nearby = await companion.requestContext({
    currentLevel: 0,
    requestedLevel: 1
  });
  assert.equal(nearby.nearbySemanticText.length, 350);
  assert.equal(visualRequests.length, 0);

  const region = await companion.requestContext({
    currentLevel: 1,
    requestedLevel: 2
  });
  assert.equal(region.accessibilityRegionText.length, 1200);
  assert.equal(visualRequests.length, 0);

  const visual = await companion.requestContext({
    currentLevel: 2,
    requestedLevel: 3,
    pointer: { x: 640, y: 360 }
  });
  assert.equal(visualRequests.length, 1);
  assert.deepEqual(visual.visualRequest, {
    kind: "pointer-region",
    center: { x: 640, y: 360 },
    maximumWidth: 400,
    maximumHeight: 400,
    maximumPixelArea: 160000
  });
  assert.deepEqual(visual.visualDelivery, {
    referenceId: "host-region-1",
    width: 400,
    height: 400,
    delivery: "out-of-band"
  });
});

test("legacy visual delivery is an explicit callback and remains bounded", async () => {
  const { companion } = createFixture({
    requestVisualRegion: async () => ({ description: "x".repeat(5000) })
  });
  await companion.readFocus();
  await companion.requestContext({ currentLevel: 0, requestedLevel: 1 });
  await companion.requestContext({ currentLevel: 1, requestedLevel: 2 });

  const visual = await companion.requestContext({
    currentLevel: 2,
    requestedLevel: 3,
    pointer: { x: 10, y: 20 }
  });

  assert.equal(visual.visualDelivery.type, "legacy-visual-preview");
  assert.equal(visual.visualDelivery.preview.length, 1200);
  assert.equal(visual.visualDelivery.capabilityId, "legacy:visual-region");
});

test("legacy companion offers visibly and mutates only after human-click confirmation", async () => {
  const { companion, host, presented, executed } = createFixture();
  const focus = await companion.readFocus();
  const offer = await companion.offerAction({
    offerId: "legacy-offer-1",
    capabilityId: "legacy.offer_value",
    targetId: focus.targetId,
    pageVersion: focus.pageVersion,
    proposedArguments: { value: "Cowork demo" },
    summary: "Use Cowork demo as the project title",
    effect: "write",
    undoAvailable: true,
    expiresAt: "2026-09-01T10:05:00.000Z"
  });

  assert.equal(presented.length, 1);
  assert.equal(executed.length, 0);
  assert.equal(offer.requiresHumanConfirmation, true);

  await assert.rejects(
    host.confirmAction({
      offerId: offer.offerId,
      event: {
        origin: "agent",
        offerId: offer.offerId,
        targetId: offer.targetId,
        pageVersion: offer.pageVersion,
        arguments: offer.proposedArguments
      },
      now: "2026-09-01T10:01:00.000Z"
    }),
    (error) =>
      error instanceof CoworkProtocolError &&
      error.code === "HUMAN_CONFIRMATION_REQUIRED"
  );
  assert.equal(executed.length, 0);

  const result = await host.confirmAction({
    offerId: offer.offerId,
    event: {
      origin: "human-click",
      offerId: offer.offerId,
      targetId: offer.targetId,
      pageVersion: offer.pageVersion,
      arguments: offer.proposedArguments
    },
    now: "2026-09-01T10:01:00.000Z"
  });
  assert.deepEqual(result, { verified: true, observedValue: "Cowork demo" });
  assert.equal(executed.length, 1);
  assert.equal(executed[0].authorization.authorizationSource, "human-click");
});

test("an unusable executor result keeps the legacy offer pending for a retry", async () => {
  let attempt = 0;
  const { companion, host } = createFixture({
    executeAuthorizedAction: async ({ offer }) => {
      attempt += 1;
      // The first attempt simulates an executor that fails to produce a
      // JSON-serializable result (boundHostResult() rejects `undefined`).
      if (attempt === 1) return undefined;
      return { verified: true, observedValue: offer.proposedArguments.value };
    }
  });
  const focus = await companion.readFocus();
  const offer = await companion.offerAction({
    offerId: "legacy-offer-retry",
    capabilityId: "legacy.offer_value",
    targetId: focus.targetId,
    pageVersion: focus.pageVersion,
    proposedArguments: { value: "Cowork demo" },
    summary: "Use Cowork demo as the project title",
    effect: "write",
    undoAvailable: true,
    expiresAt: "2026-09-01T10:05:00.000Z"
  });
  const clickEvent = {
    origin: "human-click",
    offerId: offer.offerId,
    targetId: offer.targetId,
    pageVersion: offer.pageVersion,
    arguments: offer.proposedArguments
  };

  await assert.rejects(
    host.confirmAction({ offerId: offer.offerId, event: clickEvent, now: "2026-09-01T10:01:00.000Z" }),
    (error) => error instanceof CoworkProtocolError && error.code === "INVALID_BRIDGE_RESULT"
  );

  // The offer must still be pending: a second human click on the exact
  // same offer succeeds instead of hitting OFFER_UNAVAILABLE.
  const result = await host.confirmAction({
    offerId: offer.offerId,
    event: clickEvent,
    now: "2026-09-01T10:02:00.000Z"
  });
  assert.deepEqual(result, { verified: true, observedValue: "Cowork demo" });
  assert.equal(attempt, 2);
});

test("ephemeral targets remain explain-only", async () => {
  const { companion, presented } = createFixture({
    getTargetSnapshot: async () => ({
      pageVersion: 3,
      target: { tagName: "div", role: "region", label: "Unstable result" }
    })
  });
  const focus = await companion.readFocus();

  await assert.rejects(
    companion.offerAction({
      offerId: "not-allowed",
      capabilityId: "legacy.offer_value",
      targetId: focus.targetId,
      pageVersion: focus.pageVersion,
      proposedArguments: { value: "x" },
      summary: "Try to mutate",
      effect: "write",
      undoAvailable: false,
      expiresAt: "2026-09-01T10:05:00.000Z"
    }),
    (error) =>
      error instanceof CoworkProtocolError &&
      error.code === "HUMAN_CONFIRMATION_REQUIRED"
  );
  assert.equal(presented.length, 0);
});

test("legacy companion requires host providers for the tier being requested", async () => {
  const contract = createLegacyHostCompanion({
    sessionId: "limited-host",
    getTargetSnapshot: async () => ({
      pageVersion: 1,
      target: { stableId: "one", label: "One" }
    })
  });
  const companion = contract.agent;
  await companion.readFocus();

  await assert.rejects(
    companion.requestContext({ currentLevel: 0, requestedLevel: 1 }),
    (error) => error.code === "CONTEXT_PROVIDER_UNAVAILABLE"
  );

  const noVisualContract = createLegacyHostCompanion({
    sessionId: "no-visual-host",
    getTargetSnapshot: async () => ({
      pageVersion: 1,
      target: { stableId: "one", label: "One" }
    }),
    getNearbySemanticText: async () => "Nearby",
    getAccessibilityRegionText: async () => "Region"
  });
  const noVisualCompanion = noVisualContract.agent;
  await noVisualCompanion.readFocus();
  await noVisualCompanion.requestContext({ currentLevel: 0, requestedLevel: 1 });
  await noVisualCompanion.requestContext({ currentLevel: 1, requestedLevel: 2 });
  await assert.rejects(
    noVisualCompanion.requestContext({
      currentLevel: 2,
      requestedLevel: 3,
      pointer: { x: 1, y: 2 }
    }),
    (error) => error.code === "VISUAL_PROVIDER_UNAVAILABLE"
  );
});

test("legacy companion records each context tier and rejects skipped or replayed levels", async () => {
  const { companion, visualRequests } = createFixture();
  await companion.readFocus();

  await assert.rejects(
    companion.requestContext({
      currentLevel: 2,
      requestedLevel: 3,
      pointer: { x: 1, y: 2 }
    }),
    (error) => error.code === "CONTEXT_BUDGET_EXCEEDED"
  );
  assert.equal(visualRequests.length, 0);

  await companion.requestContext({ currentLevel: 0, requestedLevel: 1 });
  await assert.rejects(
    companion.requestContext({ currentLevel: 0, requestedLevel: 1 }),
    (error) => error.code === "CONTEXT_BUDGET_EXCEEDED"
  );
});

test("legacy companion context stays bound to a previously read focus", async () => {
  const { companion } = createFixture();

  await assert.rejects(
    companion.requestContext({ currentLevel: 0, requestedLevel: 1 }),
    (error) => error.code === "STALE_FOCUS"
  );
});

test("legacy companion rejects incomplete offers before presenting them", async () => {
  const { companion, presented } = createFixture();
  const focus = await companion.readFocus();

  await assert.rejects(
    companion.offerAction({
      capabilityId: "legacy.offer_value",
      targetId: focus.targetId,
      pageVersion: focus.pageVersion,
      proposedArguments: { value: "x" },
      summary: "Missing offer id",
      effect: "write",
      undoAvailable: false,
      expiresAt: "2026-09-01T10:05:00.000Z"
    }),
    (error) => error.code === "INVALID_ACTION_OFFER"
  );
  assert.equal(presented.length, 0);
});

test("legacy companion rejects undeclared actions and oversized visible arguments", async () => {
  const { companion, presented } = createFixture();
  const focus = await companion.readFocus();
  const baseOffer = {
    offerId: "bounded-offer",
    capabilityId: "legacy.offer_value",
    targetId: focus.targetId,
    pageVersion: focus.pageVersion,
    proposedArguments: { value: "x" },
    summary: "Bounded value",
    effect: "write",
    undoAvailable: false,
    expiresAt: "2026-09-01T10:05:00.000Z"
  };

  await assert.rejects(
    companion.offerAction({ ...baseOffer, capabilityId: "legacy.delete_account" }),
    (error) => error.code === "CAPABILITY_UNAVAILABLE"
  );
  await assert.rejects(
    companion.offerAction({
      ...baseOffer,
      proposedArguments: { value: "x".repeat(351) }
    }),
    (error) => error.code === "ACTION_ARGUMENTS_EXCEED_BUDGET"
  );
  assert.equal(presented.length, 0);
});
