import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveWorkMode,
  hasAuthority,
  toLegacyPresence,
  fromLegacyPresence,
  resolvePresenceMode,
  CoworkProtocolError
} from "../src/index.js";

const HUMAN_AREA = "field:full-name";
const MODEL_AREA = "field:email";

const here = (role, area = HUMAN_AREA) => ({ availability: "here", role, area });
const modelHere = (role, area = MODEL_AREA) => ({ availability: "here", role, area });
const standby = { availability: "standby", role: "advising", area: null };
const away = { availability: "away", role: "advising", area: null };

// Every cell below runs with a valid grant, so the mode - not the record - is
// what the row is testing. The record itself is tested separately.
const CELLS = [
  ["both execute on different areas", here("executing"), modelHere("executing"), "doubling", "both"],
  ["both execute on the same area, so the human keeps the mouse", here("executing"), modelHere("executing", HUMAN_AREA), "sparring", "human"],
  ["human executes, model advises", here("executing"), modelHere("advising"), "sparring", "human"],
  ["human executes, model on standby", here("executing"), standby, "human-solo", "human"],
  ["human executes, no model connected", here("executing"), away, "human-solo", "human"],
  ["model executes, human advises", here("advising"), modelHere("executing"), "sparring", "model"],
  ["model executes, human briefly away", standby, modelHere("executing"), "model-solo", "model"],
  ["model executes, human gone", away, modelHere("executing"), "model-solo", "model"],
  ["both present, nobody executing", here("advising"), modelHere("advising"), "idle", "none"],
  ["human watches, model on standby", here("advising"), standby, "idle", "none"],
  ["human away, model only advising", standby, modelHere("advising"), "idle", "none"],
  ["nobody there", away, standby, "idle", "none"]
];

const resolve = (human, model, extra = {}) =>
  resolveWorkMode({ human, model, modelAuthorityValid: true, ...extra });

test("every matrix cell resolves to one mode and one authority holder", () => {
  for (const [name, human, model, mode, authority] of CELLS) {
    const resolved = resolve(human, model);
    assert.equal(resolved.mode, mode, name);
    assert.equal(resolved.authority, authority, name);
  }
});

test("the click right is the role: rights are derived, never chosen", () => {
  for (const [name, human, model] of CELLS) {
    const resolved = resolve(human, model);
    assert.equal(resolved.human.canExecute, hasAuthority(resolved, "human"), name);
    assert.equal(resolved.model.canExecute, hasAuthority(resolved, "model"), name);
    // Only a partner who is here can hold authority or propose anything.
    if (resolved.human.canExecute || resolved.human.canPropose) {
      assert.equal(human.availability, "here", name);
    }
    if (resolved.model.canExecute || resolved.model.canPropose) {
      assert.equal(model.availability, "here", name);
    }
    // Execute or advise - never both at once.
    assert.ok(!(resolved.human.canExecute && resolved.human.canPropose), name);
    assert.ok(!(resolved.model.canExecute && resolved.model.canPropose), name);
  }
});

test("a model never executes without a valid grant or lease", () => {
  // The security core: a present human is not a substitute for the record.
  for (const human of [here("executing"), here("advising"), standby, away]) {
    const resolved = resolveWorkMode({
      human,
      model: modelHere("executing"),
      modelAuthorityValid: false
    });
    assert.equal(resolved.model.canExecute, false);
    assert.equal(resolved.model.role, "advising");
    assert.equal(resolved.authority !== "model" && resolved.authority !== "both", true);
    assert.equal(resolved.authorityLapsed, true);
  }
});

test("an expired record downgrades a working model to advising, visibly", () => {
  const working = resolve(away, modelHere("executing"));
  assert.equal(working.mode, "model-solo");
  assert.equal(working.authorityLapsed, false);

  const lapsed = resolveWorkMode({
    human: away,
    model: modelHere("executing"),
    modelAuthorityValid: false
  });
  assert.equal(lapsed.mode, "idle");
  assert.equal(lapsed.authorityLapsed, true);
});

test("doubling needs two different areas, not a checkbox", () => {
  const different = resolve(here("executing"), modelHere("executing"));
  assert.equal(different.mode, "doubling");
  assert.equal(different.doublingAvailable, true);

  const same = resolve(here("executing"), modelHere("executing", HUMAN_AREA));
  assert.equal(same.mode, "sparring");
  assert.equal(same.doublingAvailable, false);

  // An unclaimed area is not a disjoint one: nothing proves they are apart.
  const unknown = resolve(here("executing", null), modelHere("executing"));
  assert.equal(unknown.mode, "sparring");
  assert.equal(unknown.authority, "human");
  assert.equal(unknown.doublingAvailable, false);
});

test("a solo mode means the partner is not here", () => {
  for (const availability of ["here", "standby", "away"]) {
    for (const role of ["executing", "advising"]) {
      const resolved = resolve(here("executing"), { availability, role, area: MODEL_AREA });
      assert.equal(resolved.mode === "human-solo", availability !== "here");
    }
  }
});

test("the human returning takes authority back from a working model", () => {
  const solo = resolve(away, modelHere("executing"));
  assert.equal(solo.mode, "model-solo");

  // Coming back means picking up the mouse, on whatever the model was on.
  const returned = resolve(here("executing", MODEL_AREA), modelHere("executing"));
  assert.equal(returned.mode, "sparring");
  assert.equal(returned.authority, "human");
  assert.equal(returned.model.role, "advising");
  assert.equal(returned.model.canPropose, true);
});

test("unknown status values fail closed instead of granting a work mode", () => {
  assert.throws(
    () => resolve({ availability: "maybe", role: "executing" }, standby),
    CoworkProtocolError
  );
  assert.throws(
    () => resolve(here("executing"), { availability: "here", role: "boss" }),
    CoworkProtocolError
  );
  assert.throws(
    () => resolve(here("executing"), { availability: "here", role: "executing", area: "  " }),
    CoworkProtocolError
  );
});

test("the matrix maps onto the published 0.1 presence vocabulary", () => {
  for (const [name, human, model] of CELLS) {
    const resolved = resolve(human, model);
    const legacy = toLegacyPresence(resolved);
    assert.ok(["present", "afk-short", "afk-long"].includes(legacy.humanPresence), name);
    assert.ok(["active", "paused"].includes(legacy.agentPresence), name);
    assert.ok(
      ["cowork", "human-solo", "agent-solo", "idle"].includes(legacy.effectiveMode),
      name
    );
    assert.equal(
      legacy.effectiveMode,
      resolvePresenceMode({
        humanPresence: legacy.humanPresence,
        agentPresence: legacy.agentPresence,
        leaseValid: resolved.mode === "model-solo"
      }),
      `${name}: the 0.1 resolver agrees`
    );
  }
});

test("0.1 presence values read back into the matrix", () => {
  // Plain 0.1 cowork is the offer-and-click rhythm: the human holds the click.
  const read = fromLegacyPresence({ humanPresence: "present", agentPresence: "active" });
  assert.deepEqual(read.human, { availability: "here", role: "executing" });
  assert.deepEqual(read.model, { availability: "here", role: "advising" });

  // An explicitly collaborating model is the one working; the human advises.
  const modelWorking = fromLegacyPresence({
    humanPresence: "present",
    agentPresence: "active",
    agentEngagement: "collaborating"
  });
  assert.deepEqual(modelWorking.human, { availability: "here", role: "advising" });
  assert.deepEqual(modelWorking.model, { availability: "here", role: "executing" });
  assert.equal(
    resolveWorkMode({ ...modelWorking, modelAuthorityValid: true }).authority,
    "model"
  );

  assert.equal(
    fromLegacyPresence({ humanPresence: "present", agentPresence: "paused" }).model.availability,
    "standby"
  );
  assert.throws(
    () => fromLegacyPresence({ humanPresence: "asleep", agentPresence: "active" }),
    CoworkProtocolError
  );
});
