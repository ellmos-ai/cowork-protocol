import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createCompanionHello,
  createHttpCompanionLink
} from "../../../packages/companion-link/src/index.js";
import { createCoworkContextManager } from "../../../packages/context-manager/src/index.js";
import { createCoworkSessionAuthority } from "../../../packages/session-authority/src/index.js";
import {
  CompanionHostError,
  createCompanionSessionHost
} from "../src/host.js";

test("the loopback host continues the joined session as its single authority", async () => {
  const origin = "https://forms.example";
  const host = createCompanionSessionHost({
    allowedOrigins: [origin],
    port: 0,
    createLinkSessionId: () => "link-1"
  });
  const address = await host.listen();
  try {
    const authority = createCoworkSessionAuthority({
      sessionId: "session-1",
      initialState: {
        humanPresence: "present",
        agentPresence: "active",
        effectiveMode: "cowork"
      },
      primarySurface: {
        surfaceId: "formbuilder:embedded",
        kind: "embedded"
      }
    });
    const initial = authority.readSnapshot();
    const link = createHttpCompanionLink({
      endpoint: `http://${address.hostname}:${address.port}/cowork/v1`,
      fetchImpl: (url, init) => fetch(url, {
        ...init,
        headers: { ...init.headers, origin }
      })
    });
    const hello = createCompanionHello({
      sessionId: initial.sessionId,
      surfaceId: "formbuilder:embedded",
      revision: initial.revision,
      origin,
      capabilityDigest: "native:1"
    });
    const joined = await link.join({ hello, snapshot: initial });
    assert.equal(joined.linkSessionId, "link-1");
    assert.equal(host.readSnapshot("link-1").revision, 2);

    assert.equal(
      typeof host.commitSession,
      "function",
      "The joined Companion must author later collaboration events"
    );
    const committed = await host.commitSession("link-1", {
      kind: "human-away",
      nextState: {
        ...host.readSnapshot("link-1").state,
        humanPresence: "afk-short",
        effectiveMode: "agent-solo"
      },
      expectedRevision: 2,
      sourceSurfaceId: "desktop:link-1",
      at: "2026-08-31T14:00:00.000Z"
    });
    assert.equal(committed.revision, 3);
    assert.deepEqual(
      host.readDeltas("link-1", { afterRevision: joined.acceptedRevision })
        .events.map(({ kind }) => kind),
      ["surface-handoff", "model-seat-claimed", "human-away"]
    );
    assert.equal(
      typeof link.pullDeltas,
      "function",
      "A page replica must pull Companion-authored deltas instead of authoring them"
    );
    const replicaBatch = await link.pullDeltas({
      linkSessionId: joined.linkSessionId,
      afterRevision: joined.authorityRevision
    });
    assert.deepEqual(replicaBatch.events.map(({ kind }) => kind), ["human-away"]);
    assert.equal(replicaBatch.toRevision, 3);
    await assert.rejects(
      link.pushDeltas({
        linkSessionId: joined.linkSessionId,
        batch: {
          protocolVersion: "0.1",
          type: "session-delta-batch",
          sessionId: "session-1",
          afterRevision: 3,
          toRevision: 4,
          currentRevision: 4,
          hasMore: false,
          events: [
            {
              protocolVersion: "0.1",
              type: "session-delta",
              sessionId: "session-1",
              revision: 4,
              changes: []
            }
          ]
        }
      }),
      (error) => error?.code === "COMPANION_REJECTED"
    );
    assert.equal(host.readSnapshot("link-1").revision, 3);
    assert.equal(host.readSnapshot("link-1").state.surface.kind, "desktop");
    assert.equal(host.readSnapshot("link-1").state.humanPresence, "afk-short");
    assert.equal(host.sessionCount(), 1);
  } finally {
    await host.close();
  }
});

test("the Companion host rejects wildcard origins and non-loopback binds", () => {
  assert.throws(
    () => createCompanionSessionHost({ allowedOrigins: ["*"] }),
    (error) => error instanceof CompanionHostError && error.code === "INVALID_ORIGIN_ALLOWLIST"
  );
  assert.throws(
    () => createCompanionSessionHost({ allowedOrigins: ["https://forms.example"], hostname: "0.0.0.0" }),
    (error) => error instanceof CompanionHostError && error.code === "NON_LOOPBACK_BIND_REJECTED"
  );
});

test("joining hands session authority to the Companion at the next revision", async () => {
  const origin = "https://forms.example";
  const host = createCompanionSessionHost({
    allowedOrigins: [origin],
    port: 0,
    createLinkSessionId: () => "authority-link"
  });
  const address = await host.listen();
  try {
    const authority = createCoworkSessionAuthority({
      sessionId: "authority-session",
      initialState: {
        humanPresence: "present",
        agentPresence: "active",
        effectiveMode: "cowork"
      },
      primarySurface: {
        surfaceId: "formbuilder:embedded",
        kind: "embedded"
      }
    });
    const snapshot = authority.readSnapshot();
    const link = createHttpCompanionLink({
      endpoint: `http://${address.hostname}:${address.port}/cowork/v1`,
      fetchImpl: (url, init) => fetch(url, {
        ...init,
        headers: { ...init.headers, origin }
      })
    });
    const joined = await link.join({
      hello: createCompanionHello({
        sessionId: snapshot.sessionId,
        surfaceId: "formbuilder:embedded",
        revision: snapshot.revision,
        origin
      }),
      snapshot
    });

    assert.equal(joined.acceptedRevision, 0);
    assert.equal(joined.authorityRevision, 2);
    assert.equal(joined.authorityDeltas.afterRevision, 0);
    assert.equal(joined.authorityDeltas.events[0].kind, "surface-handoff");
    assert.equal(joined.authorityDeltas.events[1].kind, "model-seat-claimed");
    assert.equal(host.readSnapshot("authority-link").revision, 2);
    assert.equal(host.readSnapshot("authority-link").state.surface.kind, "desktop");
    assert.equal(host.readSnapshot("authority-link").state.modelSeat.owner, "cowork-companion");
  } finally {
    await host.close();
  }
});

test("the Companion restores a joined session after its background host restarts", async () => {
  const origin = "https://forms.example";
  const tempRoot = await mkdtemp(path.join(tmpdir(), "cowork-session-store-"));
  const sessionStorePath = path.join(tempRoot, "sessions.json");
  const firstHost = createCompanionSessionHost({
    allowedOrigins: [origin],
    port: 0,
    sessionStorePath,
    createLinkSessionId: () => "persistent-link"
  });
  try {
    const address = await firstHost.listen();
    const authority = createCoworkSessionAuthority({
      sessionId: "persistent-session",
      initialState: {
        humanPresence: "present",
        agentPresence: "active",
        effectiveMode: "cowork"
      },
      primarySurface: {
        surfaceId: "formbuilder:embedded",
        kind: "embedded"
      }
    });
    const snapshot = authority.readSnapshot();
    const contextManager = createCoworkContextManager({ sessionId: snapshot.sessionId });
    contextManager.appendTurn({
      turnId: "turn-1",
      role: "human",
      text: "Keep working on the registration form while I am away.",
      at: "2026-08-31T10:00:00.000Z"
    });
    const link = createHttpCompanionLink({
      endpoint: `http://${address.hostname}:${address.port}/cowork/v1`,
      fetchImpl: (url, init) => fetch(url, {
        ...init,
        headers: { ...init.headers, origin }
      })
    });
    await link.join({
      hello: createCompanionHello({
        sessionId: snapshot.sessionId,
        surfaceId: "formbuilder:embedded",
        revision: snapshot.revision,
        origin
      }),
      snapshot,
      context: contextManager.readContext()
    });
    await firstHost.close();

    const restartedHost = createCompanionSessionHost({
      allowedOrigins: [origin],
      port: 0,
      sessionStorePath
    });
    try {
      await restartedHost.listen();
      assert.equal(restartedHost.sessionCount(), 1);
      assert.equal(
        restartedHost.readSnapshot("persistent-link").sessionId,
        "persistent-session"
      );
      assert.equal(
        typeof restartedHost.readContext,
        "function",
        "A restarted Companion must restore model continuity with the session"
      );
      assert.equal(
        restartedHost.readContext("persistent-link").recentTurns[0].turnId,
        "turn-1"
      );
    } finally {
      await restartedHost.close();
    }
  } finally {
    await firstHost.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("the Companion routes Cowork-owned turns through one shared Model Gateway", async () => {
  const origin = "https://forms.example";
  const modelRequests = [];
  const host = createCompanionSessionHost({
    allowedOrigins: [origin],
    port: 0,
    createLinkSessionId: () => "model-link",
    sendModelTurn: async (request) => {
      modelRequests.push(request);
      return { message: "I can continue with the focused field." };
    }
  });
  const address = await host.listen();
  try {
    const authority = createCoworkSessionAuthority({
      sessionId: "model-session",
      initialState: {
        humanPresence: "present",
        agentPresence: "active",
        effectiveMode: "cowork"
      },
      primarySurface: { surfaceId: "formbuilder:embedded", kind: "embedded" }
    });
    const contextManager = createCoworkContextManager({ sessionId: "model-session" });
    const link = createHttpCompanionLink({
      endpoint: `http://${address.hostname}:${address.port}/cowork/v1`,
      fetchImpl: (url, init) => fetch(url, {
        ...init,
        headers: { ...init.headers, origin }
      })
    });
    const snapshot = authority.readSnapshot();
    await link.join({
      hello: createCompanionHello({
        sessionId: snapshot.sessionId,
        surfaceId: "formbuilder:embedded",
        revision: snapshot.revision,
        origin
      }),
      snapshot,
      context: contextManager.readContext()
    });

    assert.equal(
      typeof host.submitModelTurn,
      "function",
      "The persistent Companion must expose its single serialized model path"
    );
    const reply = await host.submitModelTurn("model-link", {
      turnId: "human-turn-1",
      input: { transcript: "Please continue." }
    });
    assert.deepEqual(reply, { message: "I can continue with the focused field." });
    assert.equal(modelRequests.length, 1);
    assert.equal(modelRequests[0].context.recentTurns.at(-1).text, "Please continue.");
    assert.deepEqual(
      host.readContext("model-link").recentTurns.map(({ role }) => role),
      ["human", "assistant"]
    );
    assert.deepEqual(host.readModelStatus("model-link"), {
      activeTurnId: null,
      queuedTurns: 0,
      completedTurns: 1
    });
  } finally {
    await host.close();
  }
});

test("the loopback host serves a movable reference surface for the shared session", async () => {
  const origin = "https://forms.example";
  const host = createCompanionSessionHost({
    allowedOrigins: [origin],
    port: 0,
    createLinkSessionId: () => "surface-link",
    sendModelTurn: async () => ({ message: "Shared Companion reply" })
  });
  const address = await host.listen();
  const companionOrigin = `http://${address.hostname}:${address.port}`;
  try {
    const surface = await fetch(`${companionOrigin}/cowork/v1/ui`);
    assert.equal(surface.status, 200);
    const html = await surface.text();
    assert.match(html, /Cowork Protocol/);
    assert.match(html, /cowork-reference-ui/);
    assert.match(surface.headers.get("content-security-policy"), /default-src 'self'/);
    assert.match(surface.headers.get("content-security-policy"), /img-src 'self'/);
    const mark = await fetch(
      `${companionOrigin}/cowork/v1/ui/cowork-dialogue-mark.svg`
    );
    assert.equal(mark.status, 200);
    assert.equal(mark.headers.get("content-type"), "image/svg+xml");
    assert.match(await mark.text(), /Dialogue &amp; Relay Orbit Mark/);

    const authority = createCoworkSessionAuthority({
      sessionId: "surface-session",
      initialState: {
        humanPresence: "present",
        agentPresence: "active",
        effectiveMode: "cowork"
      },
      primarySurface: { surfaceId: "formbuilder:embedded", kind: "embedded" }
    });
    const snapshot = authority.readSnapshot();
    const link = createHttpCompanionLink({
      endpoint: `${companionOrigin}/cowork/v1`,
      fetchImpl: (url, init) => fetch(url, {
        ...init,
        headers: { ...init.headers, origin }
      })
    });
    await link.join({
      hello: createCompanionHello({
        sessionId: snapshot.sessionId,
        surfaceId: "formbuilder:embedded",
        revision: snapshot.revision,
        origin
      }),
      snapshot
    });

    const state = await fetch(`${companionOrigin}/cowork/v1/ui/state`).then((response) =>
      response.json()
    );
    assert.equal(state.sessions[0].sessionId, "surface-session");
    assert.equal(state.sessions[0].humanPresence, "present");
    assert.equal(state.sessions[0].modelAvailable, true);

    const replyResponse = await fetch(
      `${companionOrigin}/cowork/v1/ui/sessions/surface-link/turns`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: companionOrigin
        },
        body: JSON.stringify({
          turnId: "surface-turn-1",
          input: { transcript: "Continue from the Companion." }
        })
      }
    );
    assert.equal(replyResponse.status, 200);
    assert.deepEqual(await replyResponse.json(), {
      reply: { message: "Shared Companion reply" }
    });
  } finally {
    await host.close();
  }
});

test("the persistent Companion renews its own model seat before a turn", async () => {
  const origin = "https://forms.example";
  let currentTime = "2026-08-31T12:00:00.000Z";
  const host = createCompanionSessionHost({
    allowedOrigins: [origin],
    port: 0,
    createLinkSessionId: () => "renew-link",
    modelSeatDurationMs: 60_000,
    now: () => currentTime,
    sendModelTurn: async () => ({ message: "Renewed" })
  });
  const address = await host.listen();
  try {
    const authority = createCoworkSessionAuthority({
      sessionId: "renew-session",
      initialState: {
        humanPresence: "present",
        agentPresence: "active",
        effectiveMode: "cowork"
      },
      primarySurface: { surfaceId: "formbuilder:embedded", kind: "embedded" }
    });
    const snapshot = authority.readSnapshot();
    const link = createHttpCompanionLink({
      endpoint: `http://${address.hostname}:${address.port}/cowork/v1`,
      fetchImpl: (url, init) => fetch(url, {
        ...init,
        headers: { ...init.headers, origin }
      })
    });
    await link.join({
      hello: createCompanionHello({
        sessionId: snapshot.sessionId,
        surfaceId: "formbuilder:embedded",
        revision: snapshot.revision,
        origin
      }),
      snapshot
    });
    currentTime = "2026-08-31T12:00:30.000Z";
    await host.submitModelTurn("renew-link", {
      turnId: "renew-turn",
      input: { transcript: "Continue." }
    });
    assert.equal(
      host.readSnapshot("renew-link").state.modelSeat.expiresAt,
      "2026-08-31T12:01:30.000Z"
    );
    assert.equal(
      host.readDeltas("renew-link", { afterRevision: 2 }).events[0].kind,
      "model-seat-renewed"
    );
  } finally {
    await host.close();
  }
});
