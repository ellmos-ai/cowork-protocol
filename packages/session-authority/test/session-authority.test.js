import assert from "node:assert/strict";
import test from "node:test";

import { createHandoffCapsule } from "../../context-manager/src/index.js";

import * as sessionModule from "../src/index.js";

const {
  CoworkSessionError,
  createCoworkSessionAuthority,
  createSessionBriefing
} = sessionModule;

function createAuthority(overrides = {}) {
  return createCoworkSessionAuthority({
    sessionId: "formbuilder-session",
    initialState: {
      humanPresence: "present",
      agentPresence: "active",
      effectiveMode: "cowork",
      actionMode: "suggest",
      lease: null
    },
    primarySurface: {
      surfaceId: "formbuilder:embedded",
      kind: "embedded",
      reason: "FormBuilder opened"
    },
    ...overrides
  });
}

test("one authority owns versioned snapshots and bounded top-level deltas", () => {
  const authority = createAuthority();
  assert.equal(authority.readSnapshot().revision, 0);
  assert.equal(authority.readState().surface.kind, "embedded");

  const nextState = {
    ...authority.readState(),
    humanPresence: "afk-short",
    effectiveMode: "agent-solo",
    lease: { leaseId: "lease-1", goal: "Complete the focused field" }
  };
  const committed = authority.commit({
    kind: "human-away",
    nextState,
    sourceSurfaceId: "formbuilder:embedded",
    at: "2026-08-31T12:00:00.000Z"
  });

  assert.equal(committed.revision, 1);
  assert.deepEqual(
    committed.event.changes.map(({ key }) => key),
    ["effectiveMode", "humanPresence", "lease"]
  );
  const batch = authority.readDeltas({ afterRevision: 0 });
  assert.equal(batch.events.length, 1);
  assert.equal(batch.events[0].kind, "human-away");
  assert.equal(batch.currentRevision, 1);
});

test("unchanged renders create no event while explicit surface signals remain recordable", () => {
  const authority = createAuthority();
  const unchanged = authority.commit({
    kind: "clock-tick",
    nextState: authority.readState(),
    at: "2026-08-31T12:00:00.000Z"
  });
  assert.equal(unchanged.committed, false);
  assert.equal(authority.readSnapshot().revision, 0);

  authority.record({
    kind: "surface-visibility",
    sourceSurfaceId: "formbuilder:embedded",
    payload: { visibility: "hidden" },
    at: "2026-08-31T12:00:01.000Z"
  });
  assert.equal(authority.readSnapshot().revision, 1);
  assert.deepEqual(authority.readDeltas({ afterRevision: 0 }).events[0].changes, []);
});

test("surface handoff is revision-checked and preserves one primary surface", () => {
  const authority = createAuthority();
  const lease = authority.claimSurface({
    surfaceId: "formbuilder:pip",
    kind: "document-pip",
    reason: "Human detached the Cowork panel",
    expectedRevision: 0,
    at: "2026-08-31T12:01:00.000Z"
  });

  assert.equal(lease.surface.primarySurfaceId, "formbuilder:pip");
  assert.equal(authority.readState().surface.kind, "document-pip");
  assert.throws(
    () =>
      authority.claimSurface({
        surfaceId: "desktop:tray",
        kind: "desktop",
        reason: "Stale tray claim",
        expectedRevision: 0
      }),
    (error) =>
      error instanceof CoworkSessionError && error.code === "STALE_SESSION_VERSION"
  );
});

test("compacted event history requires a fresh snapshot", () => {
  const authority = createAuthority({ maxEvents: 2 });
  for (const visibility of ["hidden", "visible", "hidden"]) {
    authority.record({
      kind: "surface-visibility",
      payload: { visibility },
      at: "2026-08-31T12:02:00.000Z"
    });
  }
  assert.throws(
    () => authority.readDeltas({ afterRevision: 0 }),
    (error) => error instanceof CoworkSessionError && error.code === "SESSION_HISTORY_GAP"
  );
  assert.equal(authority.readSnapshot().revision, 3);
});

test("a model briefing carries continuity without page HTML or full history", () => {
  const authority = createAuthority();
  const briefing = createSessionBriefing({
    snapshot: authority.readSnapshot(),
    focus: {
      targetId: "form-field:full-name",
      pageVersion: 4,
      focus: { label: "Full name" }
    },
    summary: "The human is building an event form and wants help with the focused field.",
    pendingOfferIds: ["offer-1", "offer-2", "offer-3", "offer-4"],
    latestChangeIds: ["change-1"],
    capabilityDigest: "sha256:abc"
  });

  assert.equal(briefing.focus.targetId, "form-field:full-name");
  assert.deepEqual(briefing.pendingOfferIds, ["offer-2", "offer-3", "offer-4"]);
  assert.equal(Object.hasOwn(briefing, "html"), false);
  assert.equal(JSON.stringify(briefing).length <= 1_200, true);
});

test("an active model seat rejects a concurrent model owner", () => {
  const authority = createAuthority();
  assert.equal(
    typeof authority.claimModelSeat,
    "function",
    "Session Authority must own one exclusive model seat"
  );

  const lease = authority.claimModelSeat({
    leaseId: "model-seat-1",
    owner: "cowork-companion",
    providerId: "preferred-model",
    contextAuthority: "cowork-session",
    expiresAt: "2026-08-31T12:30:00.000Z",
    expectedRevision: 0,
    at: "2026-08-31T12:00:00.000Z"
  });

  assert.equal(lease.type, "model-seat-lease");
  assert.equal(authority.readState().modelSeat.owner, "cowork-companion");
  assert.throws(
    () =>
      authority.claimModelSeat({
        leaseId: "model-seat-2",
        owner: "provider-extension",
        providerId: "foreign-provider",
        contextAuthority: "provider-chat",
        expiresAt: "2026-08-31T12:30:00.000Z",
        expectedRevision: 1,
        at: "2026-08-31T12:05:00.000Z"
      }),
    (error) => error instanceof CoworkSessionError && error.code === "MODEL_SEAT_OCCUPIED"
  );
  assert.equal(authority.readSnapshot().revision, 1);
});

test("declarative provider metadata is not mistaken for an active model-seat lease", () => {
  const authority = createAuthority({
    initialState: {
      humanPresence: "present",
      agentPresence: "active",
      effectiveMode: "cowork",
      modelSeat: { owner: "cowork", contextAuthority: "cowork-session" }
    }
  });
  const lease = authority.claimModelSeat({
    leaseId: "model-seat-1",
    owner: "cowork-companion",
    providerId: "preferred-model",
    contextAuthority: "cowork-session",
    expiresAt: "2026-08-31T12:30:00.000Z",
    at: "2026-08-31T12:00:00.000Z"
  });
  assert.equal(lease.modelSeat.leaseId, "model-seat-1");
});

test("an explicit model-seat transfer binds the next owner to a handoff capsule", () => {
  const authority = createAuthority();
  authority.claimModelSeat({
    leaseId: "model-seat-1",
    owner: "cowork-companion",
    providerId: "preferred-model",
    contextAuthority: "cowork-session",
    expiresAt: "2026-08-31T12:30:00.000Z",
    at: "2026-08-31T12:00:00.000Z"
  });
  const capsule = createHandoffCapsule({
    snapshot: authority.readSnapshot(),
    context: {
      type: "context-snapshot",
      sessionId: "formbuilder-session",
      summary: "The form structure is agreed."
    },
    openItems: ["Add the dietary field"]
  });

  assert.equal(
    typeof authority.transferModelSeat,
    "function",
    "Provider switching must be an explicit session event"
  );
  const transferred = authority.transferModelSeat({
    currentLeaseId: "model-seat-1",
    nextLease: {
      leaseId: "model-seat-2",
      owner: "provider-extension",
      providerId: "foreign-provider",
      contextAuthority: "provider-chat",
      expiresAt: "2026-08-31T12:40:00.000Z"
    },
    handoffCapsule: capsule,
    expectedRevision: 1,
    at: "2026-08-31T12:05:00.000Z"
  });

  assert.equal(transferred.modelSeat.owner, "provider-extension");
  assert.equal(transferred.handoffCapsule.revision, 1);
  assert.equal(authority.readDeltas({ afterRevision: 1 }).events[0].kind, "model-seat-transferred");
  assert.equal(authority.readState().modelSeat.contextAuthority, "provider-chat");
});

test("only the current owner can renew its model-seat lease", () => {
  const authority = createAuthority();
  authority.claimModelSeat({
    leaseId: "model-seat-1",
    owner: "cowork-companion",
    providerId: "preferred-model",
    contextAuthority: "cowork-session",
    expiresAt: "2026-08-31T12:30:00.000Z",
    at: "2026-08-31T12:00:00.000Z"
  });
  assert.equal(
    typeof authority.renewModelSeat,
    "function",
    "A persistent Companion must renew its exclusive seat without a fake provider transfer"
  );
  const renewed = authority.renewModelSeat({
    leaseId: "model-seat-1",
    expiresAt: "2026-08-31T13:00:00.000Z",
    expectedRevision: 1,
    at: "2026-08-31T12:20:00.000Z"
  });
  assert.equal(renewed.modelSeat.expiresAt, "2026-08-31T13:00:00.000Z");
  assert.equal(authority.readDeltas({ afterRevision: 1 }).events[0].kind, "model-seat-renewed");
  assert.throws(
    () => authority.renewModelSeat({
      leaseId: "other-seat",
      expiresAt: "2026-08-31T13:30:00.000Z",
      expectedRevision: 2,
      at: "2026-08-31T12:25:00.000Z"
    }),
    (error) => error?.code === "MODEL_SEAT_LEASE_MISMATCH"
  );
});

test("a restored session authority continues from the exact persisted revision", () => {
  assert.equal(
    typeof sessionModule.restoreCoworkSessionAuthority,
    "function",
    "The Companion must continue a joined session instead of starting a second authority"
  );
  const authority = sessionModule.restoreCoworkSessionAuthority({
    snapshot: {
      protocolVersion: "0.1",
      type: "session-snapshot",
      sessionId: "session-1",
      revision: 7,
      state: {
        humanPresence: "present",
        agentPresence: "active",
        effectiveMode: "cowork",
        surface: {
          primarySurfaceId: "formbuilder:embedded",
          kind: "embedded",
          reason: "FormBuilder opened"
        }
      }
    }
  });

  assert.equal(authority.readSnapshot().revision, 7);
  const surfaceLease = authority.claimSurface({
    surfaceId: "desktop:link-1",
    kind: "desktop",
    reason: "Companion accepted authority",
    expectedRevision: 7,
    at: "2026-08-31T12:00:00.000Z"
  });
  assert.equal(surfaceLease.revision, 8);
  assert.equal(authority.readDeltas({ afterRevision: 7 }).events[0].revision, 8);
});

test("a surface replica applies one contiguous authority delta batch", () => {
  assert.equal(
    typeof sessionModule.applySessionDeltaBatch,
    "function",
    "The embedded UI needs to follow the Companion authority without becoming a second authority"
  );
  const updated = sessionModule.applySessionDeltaBatch({
    snapshot: {
      protocolVersion: "0.1",
      type: "session-snapshot",
      sessionId: "session-1",
      revision: 4,
      state: {
        humanPresence: "present",
        surface: {
          primarySurfaceId: "formbuilder:embedded",
          kind: "embedded"
        }
      }
    },
    batch: {
      protocolVersion: "0.1",
      type: "session-delta-batch",
      sessionId: "session-1",
      afterRevision: 4,
      toRevision: 5,
      currentRevision: 5,
      hasMore: false,
      events: [
        {
          protocolVersion: "0.1",
          type: "session-delta",
          sessionId: "session-1",
          revision: 5,
          changes: [
            {
              key: "surface",
              operation: "set",
              value: {
                primarySurfaceId: "desktop:link-1",
                kind: "desktop"
              }
            }
          ]
        }
      ]
    }
  });

  assert.equal(updated.revision, 5);
  assert.equal(updated.state.surface.kind, "desktop");
  assert.equal(updated.state.humanPresence, "present");
});
