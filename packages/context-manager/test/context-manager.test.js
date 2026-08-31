import assert from "node:assert/strict";
import test from "node:test";

const contextModule = await import("../src/index.js").catch(() => ({}));

test("older conversation turns compact while the recent model window stays bounded", () => {
  const createCoworkContextManager = contextModule.createCoworkContextManager;
  assert.equal(
    typeof createCoworkContextManager,
    "function",
    "Cowork needs a shared context manager before surfaces can share model continuity"
  );

  const manager = createCoworkContextManager({
    sessionId: "session-1",
    maxRecentTurns: 2,
    maxTurnCharacters: 80,
    maxSummaryCharacters: 160
  });

  manager.appendTurn({
    turnId: "turn-1",
    role: "human",
    text: "Create an event registration form.",
    at: "2026-08-31T10:00:00.000Z"
  });
  manager.appendTurn({
    turnId: "turn-2",
    role: "assistant",
    text: "I suggest starting with attendee name and email.",
    at: "2026-08-31T10:00:01.000Z"
  });
  manager.appendTurn({
    turnId: "turn-3",
    role: "human",
    text: "Add a dietary requirements field next.",
    at: "2026-08-31T10:00:02.000Z"
  });

  assert.deepEqual(manager.readContext(), {
    protocolVersion: "0.1",
    type: "context-snapshot",
    sessionId: "session-1",
    revision: 3,
    summary: "Human: Create an event registration form.",
    summaryThroughTurnId: "turn-1",
    recentTurns: [
      {
        turnId: "turn-2",
        role: "assistant",
        text: "I suggest starting with attendee name and email.",
        at: "2026-08-31T10:00:01.000Z",
        causeRefs: []
      },
      {
        turnId: "turn-3",
        role: "human",
        text: "Add a dietary requirements field next.",
        at: "2026-08-31T10:00:02.000Z",
        causeRefs: []
      }
    ]
  });
});

test("a handoff capsule carries work state without page HTML or conversation replay", () => {
  const createHandoffCapsule = contextModule.createHandoffCapsule;
  assert.equal(
    typeof createHandoffCapsule,
    "function",
    "Provider handoff needs a bounded capsule built from shared session state"
  );

  const capsule = createHandoffCapsule({
    snapshot: {
      protocolVersion: "0.1",
      type: "session-snapshot",
      sessionId: "session-1",
      revision: 7,
      state: {
        lease: {
          leaseId: "solo-1",
          goal: "Finish the registration section",
          expiresAt: "2026-08-31T10:15:00.000Z",
          capabilities: ["form.set_value"]
        }
      }
    },
    context: {
      protocolVersion: "0.1",
      type: "context-snapshot",
      sessionId: "session-1",
      revision: 3,
      summary: "The human is building an event registration form.",
      summaryThroughTurnId: "turn-1",
      recentTurns: [
        { turnId: "turn-2", role: "assistant", text: "full private replay" }
      ]
    },
    focus: {
      targetId: "form-field:dietary",
      label: "Dietary requirements",
      pageVersion: 4,
      html: "<main>must not cross providers</main>"
    },
    completed: ["Added attendee name", "Added email"],
    openItems: ["Choose dietary field type"],
    decisionsNeeded: ["Should the field be required?"]
  });

  assert.deepEqual(capsule, {
    protocolVersion: "0.1",
    type: "handoff-capsule",
    sessionId: "session-1",
    revision: 7,
    goal: "Finish the registration section",
    contextSummary: "The human is building an event registration form.",
    completed: ["Added attendee name", "Added email"],
    focus: {
      targetId: "form-field:dietary",
      label: "Dietary requirements",
      pageVersion: 4
    },
    openItems: ["Choose dietary field type"],
    soloRights: {
      leaseId: "solo-1",
      expiresAt: "2026-08-31T10:15:00.000Z",
      capabilities: ["form.set_value"]
    },
    decisionsNeeded: ["Should the field be required?"]
  });
  assert.equal(JSON.stringify(capsule).length <= 1_200, true);
  assert.equal(Object.hasOwn(capsule, "recentTurns"), false);
  assert.equal(Object.hasOwn(capsule.focus, "html"), false);
});

test("the model receives the newest bounded window instead of the stored context snapshot", () => {
  const manager = contextModule.createCoworkContextManager({
    sessionId: "session-1",
    maxRecentTurns: 4,
    maxTurnCharacters: 120,
    maxSummaryCharacters: 160
  });
  for (const [index, role] of ["human", "assistant", "human", "assistant"].entries()) {
    manager.appendTurn({
      turnId: `turn-${index + 1}`,
      role,
      text: `${role} ${String(index + 1).repeat(90)}`,
      at: `2026-08-31T10:00:0${index}.000Z`
    });
  }

  assert.equal(
    typeof manager.readModelContext,
    "function",
    "Stored conversation state needs a separate token-bounded model projection"
  );
  const modelContext = manager.readModelContext({ maxCharacters: 360 });
  assert.equal(JSON.stringify(modelContext).length <= 360, true);
  assert.equal(modelContext.recentTurns.at(-1).turnId, "turn-4");
  assert.equal(modelContext.omittedRecentTurnCount > 0, true);
  assert.equal(Object.hasOwn(modelContext.recentTurns[0], "at"), false);
});

test("the Companion restores and continues the exact persisted context revision", () => {
  assert.equal(
    typeof contextModule.restoreCoworkContextManager,
    "function",
    "A restarted Companion needs one continuing Context Manager"
  );
  const manager = contextModule.restoreCoworkContextManager({
    snapshot: {
      protocolVersion: "0.1",
      type: "context-snapshot",
      sessionId: "session-1",
      revision: 2,
      summary: "Human: Start the form.",
      summaryThroughTurnId: "turn-1",
      recentTurns: [
        {
          turnId: "turn-2",
          role: "assistant",
          text: "I added the first field.",
          at: "2026-08-31T10:00:01.000Z",
          causeRefs: ["turn-1"]
        }
      ]
    },
    maxRecentTurns: 2
  });
  manager.appendTurn({
    turnId: "turn-3",
    role: "human",
    text: "Continue with email.",
    at: "2026-08-31T10:00:02.000Z"
  });
  const restored = manager.readContext();
  assert.equal(restored.revision, 3);
  assert.equal(restored.summaryThroughTurnId, "turn-1");
  assert.deepEqual(restored.recentTurns.map(({ turnId }) => turnId), ["turn-2", "turn-3"]);
});

test("even a long compacted summary fits the caller's smallest model budget", () => {
  const manager = contextModule.createCoworkContextManager({
    sessionId: "session-1",
    maxRecentTurns: 1,
    maxTurnCharacters: 400,
    maxSummaryCharacters: 600
  });
  manager.appendTurn({
    turnId: "turn-1",
    role: "human",
    text: "A".repeat(400),
    at: "2026-08-31T10:00:00.000Z"
  });
  manager.appendTurn({
    turnId: "turn-2",
    role: "assistant",
    text: "B".repeat(400),
    at: "2026-08-31T10:00:01.000Z"
  });
  const context = manager.readModelContext({ maxCharacters: 240 });
  assert.equal(JSON.stringify(context).length <= 240, true);
});

test("invalid or unbounded turns never enter shared context", () => {
  const manager = contextModule.createCoworkContextManager({ sessionId: "session-1" });
  assert.throws(
    () => manager.appendTurn({
      turnId: "x".repeat(161),
      role: "human",
      text: "Hello",
      at: "2026-08-31T10:00:00.000Z"
    }),
    /bounded context turn/
  );
  assert.throws(
    () => manager.appendTurn({
      turnId: "turn-1",
      role: "tool",
      text: "Hello",
      at: "2026-08-31T10:00:00.000Z"
    }),
    /bounded context turn/
  );
});
