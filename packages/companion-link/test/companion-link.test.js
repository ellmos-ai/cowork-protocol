import assert from "node:assert/strict";
import test from "node:test";

import {
  CompanionLinkError,
  createCompanionHello,
  createHttpCompanionLink
} from "../src/index.js";

const snapshot = {
  protocolVersion: "0.1",
  type: "session-snapshot",
  sessionId: "session-1",
  revision: 4,
  state: { effectiveMode: "cowork" }
};

function authorityHandoff(overrides = {}) {
  return {
    authorityRevision: 6,
    authorityDeltas: {
      protocolVersion: "0.1",
      type: "session-delta-batch",
      sessionId: "session-1",
      afterRevision: 4,
      toRevision: 6,
      currentRevision: 6,
      hasMore: false,
      events: [
        {
          protocolVersion: "0.1",
          type: "session-delta",
          sessionId: "session-1",
          revision: 5,
          kind: "surface-handoff"
        },
        {
          protocolVersion: "0.1",
          type: "session-delta",
          sessionId: "session-1",
          revision: 6,
          kind: "model-seat-claimed"
        }
      ]
    },
    ...overrides
  };
}

test("a loopback Companion accepts only the exact joined revision", async () => {
  const calls = [];
  const link = createHttpCompanionLink({
    endpoint: "http://127.0.0.1:47831/cowork/v1",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return Response.json({
        protocolVersion: "0.1",
        linkVersion: "0.1",
        type: "companion-join-ack",
        sessionId: "session-1",
        linkSessionId: "link-1",
        acceptedRevision: 4,
        ...authorityHandoff()
      });
    }
  });
  const hello = createCompanionHello({
    sessionId: "session-1",
    surfaceId: "formbuilder:embedded",
    revision: 4,
    origin: "https://forms.example/path",
    capabilityDigest: "native:4"
  });
  const ack = await link.join({ hello, snapshot });

  assert.equal(ack.acceptedRevision, 4);
  assert.equal(ack.authorityRevision, 6);
  assert.equal(hello.origin, "https://forms.example");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:47831/cowork/v1/sessions/join");
  assert.equal(calls[0].init.targetAddressSpace, "loopback");
});

test("a Companion authority handoff must continue contiguously from the joined revision", async () => {
  const link = createHttpCompanionLink({
    fetchImpl: async () => Response.json({
      protocolVersion: "0.1",
      linkVersion: "0.1",
      type: "companion-join-ack",
      sessionId: "session-1",
      linkSessionId: "link-1",
      acceptedRevision: 4,
      ...authorityHandoff({ authorityRevision: 7 })
    })
  });
  const hello = createCompanionHello({
    sessionId: "session-1",
    surfaceId: "surface-1",
    revision: 4,
    origin: "https://forms.example"
  });
  await assert.rejects(
    link.join({ hello, snapshot }),
    (error) =>
      error instanceof CompanionLinkError && error.code === "COMPANION_REVISION_MISMATCH"
  );
});

test("a mismatched Companion acknowledgement fails closed", async () => {
  const link = createHttpCompanionLink({
    fetchImpl: async () => Response.json({
      protocolVersion: "0.1",
      linkVersion: "0.1",
      type: "companion-join-ack",
      sessionId: "session-1",
      linkSessionId: "link-1",
      acceptedRevision: 3
    })
  });
  const hello = createCompanionHello({
    sessionId: "session-1",
    surfaceId: "surface-1",
    revision: 4,
    origin: "https://forms.example"
  });
  await assert.rejects(
    link.join({ hello, snapshot }),
    (error) =>
      error instanceof CompanionLinkError && error.code === "COMPANION_REVISION_MISMATCH"
  );
});

test("Companion Link refuses a remote endpoint and hides connection diagnostics", async () => {
  assert.throws(
    () => createHttpCompanionLink({ endpoint: "https://remote.example/cowork/v1" }),
    (error) =>
      error instanceof CompanionLinkError && error.code === "INVALID_COMPANION_ENDPOINT"
  );
  const link = createHttpCompanionLink({
    fetchImpl: async () => {
      throw new Error("provider and socket details must not cross the page boundary");
    }
  });
  const hello = createCompanionHello({
    sessionId: "session-1",
    surfaceId: "surface-1",
    revision: 4,
    origin: "https://forms.example"
  });
  await assert.rejects(
    link.join({ hello, snapshot }),
    (error) =>
      error instanceof CompanionLinkError &&
      error.code === "COMPANION_UNAVAILABLE" &&
      !error.message.includes("provider")
  );
});
