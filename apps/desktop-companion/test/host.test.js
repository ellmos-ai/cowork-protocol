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

test("a joined page reports token-free visibility while the Companion remains authority", async () => {
  const origin = "https://forms.example";
  const modelRequests = [];
  const host = createCompanionSessionHost({
    allowedOrigins: [origin],
    port: 0,
    createLinkSessionId: () => "visibility-link",
    sendModelTurn: async (request) => {
      modelRequests.push(request);
      return { message: "This must not run for a surface signal." };
    }
  });
  const address = await host.listen();
  try {
    const authority = createCoworkSessionAuthority({
      sessionId: "visibility-session",
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
    const joined = await link.join({
      hello: createCompanionHello({
        sessionId: initial.sessionId,
        surfaceId: "formbuilder:embedded",
        revision: initial.revision,
        origin
      }),
      snapshot: initial
    });

    const acknowledgement = await link.reportSurface({
      linkSessionId: joined.linkSessionId,
      surfaceId: "formbuilder:embedded",
      visibility: "hidden",
      observedRevision: joined.authorityRevision
    });

    assert.equal(acknowledgement.type, "companion-surface-ack");
    assert.equal(acknowledgement.acceptedRevision, 3);
    assert.equal(host.readSnapshot("visibility-link").state.surface.kind, "desktop");
    assert.deepEqual(host.readSnapshot("visibility-link").state.applicationSurface, {
      surfaceId: "formbuilder:embedded",
      visibility: "hidden"
    });
    assert.deepEqual(
      host.readDeltas("visibility-link", { afterRevision: joined.authorityRevision })
        .events.map(({ kind, payload }) => ({ kind, event: payload.event })),
      [{ kind: "surface-visibility", event: "page-hidden" }]
    );
    assert.equal(modelRequests.length, 0);

    await assert.rejects(
      link.reportSurface({
        linkSessionId: joined.linkSessionId,
        surfaceId: "spoofed:surface",
        visibility: "visible",
        observedRevision: acknowledgement.acceptedRevision
      }),
      (error) => error?.code === "COMPANION_REJECTED"
    );
    assert.equal(host.readSnapshot("visibility-link").revision, 3);
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
      sessionStorePath,
      sendModelTurn: async () => ({ message: "Restored reply" })
    });
    try {
      const restartedAddress = await restartedHost.listen();
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

      // A restored session is held while no page speaks to us. Handing the job
      // to the model there would be a handover to nobody, so the cockpit says
      // what is missing rather than reporting a model that executes.
      const restartedOrigin =
        `http://${restartedAddress.hostname}:${restartedAddress.port}`;
      const unlinked = await fetch(
        `${restartedOrigin}/cowork/v1/ui/sessions/persistent-link/engagement`,
        {
          method: "POST",
          headers: { "content-type": "application/json", origin: restartedOrigin },
          body: JSON.stringify({ agentEngagement: "collaborating" })
        }
      );
      assert.equal(unlinked.status, 409);
      assert.deepEqual(await unlinked.json(), {
        code: "PAGE_NOT_LINKED",
        message: "Link a page first - the model has nothing to execute on"
      });
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
    assert.deepEqual(reply, {
      reply: { message: "I can continue with the focused field." },
      delivery: { offered: 0, rejected: 0, reason: null }
    });
    assert.equal(modelRequests.length, 1);
    assert.equal(modelRequests[0].context.recentTurns.at(-1).text, "Please continue.");
    assert.deepEqual(
      host.readContext("model-link").recentTurns.map(({ role }) => role),
      ["human", "assistant"]
    );
    assert.deepEqual(host.readModelStatus("model-link"), {
      activeTurnId: null,
      queuedTurns: 0,
      completedTurns: 1,
      failedTurns: 0
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
    const joined = await link.join({
      hello: createCompanionHello({
        sessionId: snapshot.sessionId,
        surfaceId: "formbuilder:embedded",
        revision: snapshot.revision,
        origin
      }),
      snapshot
    });
    await link.reportSurface({
      linkSessionId: joined.linkSessionId,
      surfaceId: "formbuilder:embedded",
      visibility: "hidden",
      observedRevision: joined.authorityRevision
    });

    const state = await fetch(`${companionOrigin}/cowork/v1/ui/state`).then((response) =>
      response.json()
    );
    assert.equal(state.sessions[0].sessionId, "surface-session");
    assert.equal(state.sessions[0].humanPresence, "present");
    assert.equal(state.sessions[0].modelAvailable, true);
    assert.equal(state.sessions[0].modelIdentity, "preferred-model");
    assert.equal(state.sessions[0].applicationSurfaceVisibility, "hidden");

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
      delivery: { offered: 0, rejected: 0, reason: null },
      reply: { message: "Shared Companion reply" }
    });
  } finally {
    await host.close();
  }
});

test("the movable cockpit commits model engagement and fails closed while paused", async () => {
  const origin = "https://forms.example";
  const now = "2026-08-31T12:00:00.000Z";
  let modelRequests = 0;
  const host = createCompanionSessionHost({
    allowedOrigins: [origin],
    port: 0,
    createLinkSessionId: () => "cockpit-link",
    now: () => now,
    sendModelTurn: async () => {
      modelRequests += 1;
      return { message: "Observed context reply" };
    }
  });
  const address = await host.listen();
  const companionOrigin = `http://${address.hostname}:${address.port}`;
  try {
    const authority = createCoworkSessionAuthority({
      sessionId: "cockpit-session",
      initialState: {
        humanPresence: "present",
        agentPresence: "active",
        effectiveMode: "cowork",
        lease: null
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

    const postUi = (path, body) => fetch(`${companionOrigin}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: companionOrigin },
      body: JSON.stringify(body)
    });

    assert.equal((await postUi(
      "/cowork/v1/ui/sessions/cockpit-link/engagement",
      { agentEngagement: "observing" }
    )).status, 200);
    let state = (await fetch(`${companionOrigin}/cowork/v1/ui/state`).then(
      (response) => response.json()
    )).sessions[0];
    assert.equal(state.agentEngagement, "observing");
    assert.equal(state.agentPresence, "active");
    assert.equal(state.effectiveMode, "cowork");

    assert.equal((await postUi(
      "/cowork/v1/ui/sessions/cockpit-link/engagement",
      { agentEngagement: "paused" }
    )).status, 200);
    state = (await fetch(`${companionOrigin}/cowork/v1/ui/state`).then(
      (response) => response.json()
    )).sessions[0];
    assert.equal(state.agentPresence, "paused");
    assert.equal(state.effectiveMode, "human-solo");

    const pausedTurn = await postUi(
      "/cowork/v1/ui/sessions/cockpit-link/turns",
      { turnId: "paused-turn", input: { transcript: "Do not run." } }
    );
    assert.equal(pausedTurn.status, 409);
    assert.deepEqual(await pausedTurn.json(), {
      code: "MODEL_PAUSED",
      message: "The Companion model is paused"
    });
    assert.equal(modelRequests, 0);

    // The seat click is the handover, and a grant is about something. With no
    // field pointed at, the cockpit says so instead of granting into thin air.
    const unfocused = await postUi(
      "/cowork/v1/ui/sessions/cockpit-link/engagement",
      { agentEngagement: "collaborating" }
    );
    assert.equal(unfocused.status, 409);
    assert.deepEqual(await unfocused.json(), {
      code: "NO_FOCUSED_TARGET",
      message: "Point the page at a field first - a grant needs a target to be about"
    });

    assert.equal((await postUi(
      "/cowork/v1/ui/sessions/cockpit-link/engagement",
      { agentEngagement: "observing" }
    )).status, 200);
    assert.equal((await postUi(
      "/cowork/v1/ui/sessions/cockpit-link/presence",
      { humanPresence: "afk-short" }
    )).status, 200);
    state = (await fetch(`${companionOrigin}/cowork/v1/ui/state`).then(
      (response) => response.json()
    )).sessions[0];
    assert.equal(
      state.effectiveMode,
      "idle",
      "away presence without a delegated work lease must not look like agent solo"
    );

    // The page speaks and points at a field. Now the same click is a real
    // handover, and the Companion mints the grant itself - no trip back to
    // the page for a button the cockpit does not have.
    await link.pullDeltas({ linkSessionId: "cockpit-link", afterRevision: 0 });
    const beforeFocus = host.readSnapshot("cockpit-link");
    await host.commitSession("cockpit-link", {
      kind: "focus-changed",
      nextState: {
        ...beforeFocus.state,
        focus: {
          targetId: "form-field:email",
          pageVersion: 3,
          focus: { label: "Email", kind: "pointer" },
          capabilityIds: ["form.set_value", "form.explain_field"]
        }
      },
      expectedRevision: beforeFocus.revision,
      sourceSurfaceId: beforeFocus.state.surface.primarySurfaceId,
      at: now
    });
    assert.equal((await postUi(
      "/cowork/v1/ui/sessions/cockpit-link/engagement",
      { agentEngagement: "collaborating" }
    )).status, 200);
    state = (await fetch(`${companionOrigin}/cowork/v1/ui/state`).then(
      (response) => response.json()
    )).sessions[0];
    assert.equal(state.lease.goal, "Work on Email");
    assert.equal(state.lease.origin, "human-click");
    assert.equal(state.lease.maxCalls, 2);
    assert.deepEqual(state.lease.allowedTargetIds, ["form-field:email"]);
    assert.deepEqual(state.lease.allowedCapabilityIds, ["form.set_value"]);
    assert.equal(state.workMode.authority, "model");
    assert.equal(state.workMode.authorityLapsed, false);

    // Clicking the seat off execution hands the job back and ends the grant.
    assert.equal((await postUi(
      "/cowork/v1/ui/sessions/cockpit-link/engagement",
      { agentEngagement: "observing" }
    )).status, 200);
    state = (await fetch(`${companionOrigin}/cowork/v1/ui/state`).then(
      (response) => response.json()
    )).sessions[0];
    assert.equal(state.lease, null);
    assert.equal(state.workMode.model.canExecute, false);
    assert.equal(state.workMode.authorityLapsed, false);

    assert.equal((await postUi(
      "/cowork/v1/ui/sessions/cockpit-link/engagement",
      { agentEngagement: "collaborating" }
    )).status, 200);
    await postUi(
      "/cowork/v1/ui/sessions/cockpit-link/presence",
      { humanPresence: "present" }
    );
    await postUi(
      "/cowork/v1/ui/sessions/cockpit-link/presence",
      { humanPresence: "afk-short" }
    );
    state = (await fetch(`${companionOrigin}/cowork/v1/ui/state`).then(
      (response) => response.json()
    )).sessions[0];
    assert.equal(
      state.effectiveMode,
      "agent-solo",
      "the same away gesture may animate toward the model after a bounded lease exists"
    );
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

test("the local cockpit alone switches one session into verified profiled Computer Use", async () => {
  const origin = "https://forms.example";
  const calls = [];
  let closed = 0;
  let computerStatus = {
    available: false,
    executionMode: "structured",
    indicatorVisible: false,
    activeSessionId: null,
    lastAbortMessage: null
  };
  const computerUse = {
    readStatus: () => ({ ...computerStatus }),
    async activate(input) {
      calls.push({ method: "activate", input });
      computerStatus = {
        ...computerStatus,
        available: true,
        executionMode: "computer-use",
        indicatorVisible: true,
        activeSessionId: input.sessionId
      };
      return { ...computerStatus };
    },
    async deactivate(input) {
      calls.push({ method: "deactivate", input });
      computerStatus = {
        ...computerStatus,
        executionMode: "structured",
        indicatorVisible: false,
        activeSessionId: null
      };
      return { ...computerStatus };
    },
    async refreshStatus(input) {
      calls.push({ method: "refreshStatus", input });
      return { ...computerStatus };
    },
    async close() { closed += 1; }
  };
  const host = createCompanionSessionHost({
    allowedOrigins: [origin],
    port: 0,
    createLinkSessionId: () => "computer-link",
    computerUse
  });
  const address = await host.listen();
  const companionOrigin = `http://${address.hostname}:${address.port}`;
  try {
    const authority = createCoworkSessionAuthority({
      sessionId: "computer-session",
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

    const postExecution = (body) => fetch(
      `${companionOrigin}/cowork/v1/ui/sessions/computer-link/computer-use`,
      {
        method: "POST",
        headers: { "content-type": "application/json", origin: companionOrigin },
        body: JSON.stringify(body)
      }
    );
    const rebindingAttempt = await fetch(
      `${companionOrigin}/cowork/v1/ui/sessions/computer-link/computer-use`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://rebind.example",
          host: "rebind.example"
        },
        body: JSON.stringify({ enabled: true, humanGesture: true })
      }
    );
    assert.equal(rebindingAttempt.status, 403);
    assert.equal(calls.length, 0);

    const untrusted = await postExecution({ enabled: true, humanGesture: false });
    assert.equal(untrusted.status, 400);
    assert.deepEqual(await untrusted.json(), {
      code: "HUMAN_ACTIVATION_REQUIRED",
      message: "Only a deliberate local cockpit gesture can change Computer Use"
    });
    assert.equal(calls.length, 0);

    assert.equal((await postExecution({ enabled: true, humanGesture: true })).status, 200);
    let state = await fetch(`${companionOrigin}/cowork/v1/ui/state`).then((response) =>
      response.json()
    );
    assert.equal(state.sessions[0].computerUseAvailable, true);
    assert.equal(state.sessions[0].executionMode, "computer-use");
    assert.equal(state.sessions[0].computerUseIndicatorVisible, true);
    assert.deepEqual(calls[0], {
      method: "activate",
      input: { sessionId: "computer-session", humanGesture: true }
    });

    assert.equal((await postExecution({ enabled: false, humanGesture: true })).status, 200);
    state = await fetch(`${companionOrigin}/cowork/v1/ui/state`).then((response) =>
      response.json()
    );
    assert.equal(state.sessions[0].executionMode, "structured");
    assert.equal(state.sessions[0].computerUseIndicatorVisible, false);
  } finally {
    await host.close();
  }
  assert.equal(closed, 1);
});

test("the UI state names the page a session belongs to and when it last spoke", async () => {
  const origin = "https://forms.example";
  const tempRoot = await mkdtemp(path.join(tmpdir(), "cowork-contact-store-"));
  const sessionStorePath = path.join(tempRoot, "sessions.json");
  const firstHost = createCompanionSessionHost({
    allowedOrigins: [origin],
    port: 0,
    sessionStorePath,
    createLinkSessionId: () => "contact-link"
  });
  try {
    const address = await firstHost.listen();
    const companionOrigin = `http://${address.hostname}:${address.port}`;
    const authority = createCoworkSessionAuthority({
      sessionId: "contact-session",
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

    const joinedState = await fetch(`${companionOrigin}/cowork/v1/ui/state`).then(
      (response) => response.json()
    );
    assert.equal(joinedState.sessions[0].origin, origin);
    assert.equal(joinedState.sessions[0].pageSurfaceId, "formbuilder:embedded");
    assert.ok(
      !Number.isNaN(Date.parse(joinedState.sessions[0].lastPageContactAt)),
      "A joined page must leave a readable contact timestamp"
    );
    await firstHost.close();

    const restartedHost = createCompanionSessionHost({
      allowedOrigins: [origin],
      port: 0,
      sessionStorePath
    });
    try {
      const restartedAddress = await restartedHost.listen();
      const restoredState = await fetch(
        `http://${restartedAddress.hostname}:${restartedAddress.port}/cowork/v1/ui/state`
      ).then((response) => response.json());
      assert.equal(restoredState.sessions[0].origin, origin);
      assert.equal(restoredState.sessions[0].pageSurfaceId, "formbuilder:embedded");
      assert.equal(
        restoredState.sessions[0].lastPageContactAt,
        null,
        "A restored session holds no page, so the UI must not claim a live link"
      );
    } finally {
      await restartedHost.close();
    }
  } finally {
    await firstHost.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("the UI state reports the Computer Use fallback before any page connects", async () => {
  const withoutAdapter = createCompanionSessionHost({
    allowedOrigins: ["https://forms.example"],
    port: 0
  });
  try {
    const address = await withoutAdapter.listen();
    const state = await fetch(
      `http://${address.hostname}:${address.port}/cowork/v1/ui/state`
    ).then((response) => response.json());
    assert.deepEqual(state.sessions, []);
    assert.equal(
      state.computerUseAvailable,
      false,
      "The cockpit must learn the fallback is missing without a session to read"
    );
  } finally {
    await withoutAdapter.close();
  }

  const withAdapter = createCompanionSessionHost({
    allowedOrigins: ["https://forms.example"],
    port: 0,
    computerUse: {
      readStatus: () => null,
      activate: async () => ({}),
      deactivate: async () => ({}),
      refreshStatus: async () => ({}),
      close: async () => {}
    }
  });
  try {
    const address = await withAdapter.listen();
    const state = await fetch(
      `http://${address.hostname}:${address.port}/cowork/v1/ui/state`
    ).then((response) => response.json());
    assert.equal(state.computerUseAvailable, true);
  } finally {
    await withAdapter.close();
  }
});

test("a model offer reaches the linked page and a failed turn says so on both surfaces", async () => {
  const origin = "https://forms.example";
  let nextReply = {
    message: "I can fill the email field.",
    speak: "",
    offers: [{
      capabilityId: "form.set_value",
      targetId: "form-field:email",
      value: "ada@example.test",
      summary: "Set Email to ada@example.test"
    }],
    omittedOffers: 0
  };
  const host = createCompanionSessionHost({
    allowedOrigins: [origin],
    port: 0,
    createLinkSessionId: () => "offer-link",
    sendModelTurn: async () => {
      if (nextReply instanceof Error) throw nextReply;
      return nextReply;
    }
  });
  const address = await host.listen();
  try {
    const authority = createCoworkSessionAuthority({
      sessionId: "offer-session",
      initialState: {
        humanPresence: "present",
        agentPresence: "active",
        effectiveMode: "cowork"
      },
      primarySurface: { surfaceId: "formbuilder:embedded", kind: "embedded" }
    });
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
      snapshot
    });

    // The page's relay loop: it pulls what waits for it and answers.
    const ranOnPage = [];
    const relay = setInterval(async () => {
      for (const request of await link.pullAgentRequests({ linkSessionId: "offer-link" })) {
        ranOnPage.push(request);
        await link.reportAgentResult({
          linkSessionId: "offer-link",
          requestId: request.requestId,
          result: { offerId: "offer-1" }
        });
      }
    }, 20);

    const answered = await host.submitModelTurn("offer-link", {
      turnId: "offer-turn",
      input: { transcript: "Fill in the form fields please." }
    });
    assert.deepEqual(answered.delivery, { offered: 1, rejected: 0, reason: null });
    assert.equal(ranOnPage.length, 1);
    assert.equal(ranOnPage[0].name, "cowork_offer_action");
    assert.equal(ranOnPage[0].arguments.value, "ada@example.test");
    assert.equal(
      host.readSnapshot("offer-link").state.lastConversation.status,
      "responded"
    );

    // Now the same turn fails. It must not read as if the human said nothing.
    nextReply = Object.assign(
      new Error("The model spent all 500 answer tokens thinking and returned no reply."),
      { code: "MODEL_THOUGHT_PAST_ITS_BUDGET" }
    );
    await assert.rejects(() => host.submitModelTurn("offer-link", {
      turnId: "failing-turn",
      input: { transcript: "Fill in the form fields please." }
    }));
    clearInterval(relay);

    const failedState = host.readSnapshot("offer-link").state.lastConversation;
    assert.equal(failedState.status, "MODEL_THOUGHT_PAST_ITS_BUDGET");
    assert.match(failedState.assistant, /thinking/);
    assert.deepEqual(host.readModelStatus("offer-link"), {
      activeTurnId: null,
      queuedTurns: 0,
      completedTurns: 1,
      failedTurns: 1
    });
  } finally {
    await host.close();
  }
});
