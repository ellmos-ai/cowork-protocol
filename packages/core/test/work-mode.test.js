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

const here = (role) => ({ availability: "here", role });
const standby = { availability: "standby", role: "observing" };
const away = { availability: "away", role: "observing" };

const CELLS = [
  ["both act, simultaneous allowed", here("acting"), here("acting"), true, "parallel", "both"],
  ["both act, simultaneous denied - the human keeps the mouse", here("acting"), here("acting"), false, "cowork", "human"],
  ["human acts, model advises", here("acting"), here("observing"), false, "cowork", "human"],
  ["human acts, model on standby", here("acting"), standby, false, "human-solo", "human"],
  ["human acts, model disconnected", here("acting"), away, false, "human-solo", "human"],
  ["model acts, human watches", here("observing"), here("acting"), false, "cowork", "model"],
  ["model acts, human briefly away", standby, here("acting"), false, "model-solo", "model"],
  ["model acts, human gone", away, here("acting"), false, "model-solo", "model"],
  ["both present, nobody acting", here("observing"), here("observing"), false, "idle", "none"],
  ["human watches, model on standby", here("observing"), standby, false, "idle", "none"],
  ["human away, model advising only", standby, here("observing"), false, "idle", "none"],
  ["nobody there", away, standby, false, "idle", "none"]
];

test("every matrix cell resolves to one mode and one authority holder", () => {
  for (const [name, human, model, allowParallel, mode, authority] of CELLS) {
    const resolved = resolveWorkMode({ human, model, allowParallel });
    assert.equal(resolved.mode, mode, name);
    assert.equal(resolved.authority, authority, name);
  }
});

test("action rights are derived, never chosen: authority is the click right", () => {
  for (const [name, human, model, allowParallel] of CELLS) {
    const resolved = resolveWorkMode({ human, model, allowParallel });
    assert.equal(resolved.human.canExecute, hasAuthority(resolved, "human"), name);
    assert.equal(resolved.model.canExecute, hasAuthority(resolved, "model"), name);
    // Only an actor that is here can hold authority or propose anything.
    if (resolved.human.canExecute || resolved.human.canPropose) {
      assert.equal(human.availability, "here", name);
    }
    if (resolved.model.canExecute || resolved.model.canPropose) {
      assert.equal(model.availability, "here", name);
    }
    // Exactly one of the two rights per present actor: act or advise.
    assert.ok(!(resolved.human.canExecute && resolved.human.canPropose), name);
    assert.ok(!(resolved.model.canExecute && resolved.model.canPropose), name);
  }
});

test("a solo mode means the partner is not here", () => {
  for (const availability of ["here", "standby", "away"]) {
    for (const role of ["acting", "observing"]) {
      const resolved = resolveWorkMode({
        human: here("acting"),
        model: { availability, role }
      });
      assert.equal(resolved.mode === "human-solo", availability !== "here");
    }
  }
});

test("a model set to act without a valid authority record falls back to advising", () => {
  const lapsed = resolveWorkMode({
    human: standby,
    model: here("acting"),
    modelAuthorityValid: false
  });
  assert.equal(lapsed.mode, "idle");
  assert.equal(lapsed.authority, "none");
  assert.equal(lapsed.model.role, "observing");
  assert.equal(lapsed.authorityLapsed, true);
  assert.equal(lapsed.model.canExecute, false);
});

test("the human returning takes authority back from a working model", () => {
  const solo = resolveWorkMode({ human: away, model: here("acting") });
  assert.equal(solo.mode, "model-solo");
  const returned = resolveWorkMode({ human: here("acting"), model: here("acting") });
  assert.equal(returned.mode, "cowork");
  assert.equal(returned.authority, "human");
  assert.equal(returned.model.role, "observing");
  assert.equal(returned.model.canPropose, true);
});

test("unknown status values fail closed instead of granting a work mode", () => {
  assert.throws(
    () => resolveWorkMode({ human: { availability: "maybe" }, model: standby }),
    CoworkProtocolError
  );
  assert.throws(
    () => resolveWorkMode({ human: here("acting"), model: { availability: "here", role: "boss" } }),
    CoworkProtocolError
  );
});

test("the matrix maps onto the published 0.1 presence vocabulary", () => {
  for (const [name, human, model, allowParallel] of CELLS) {
    const resolved = resolveWorkMode({ human, model, allowParallel });
    const legacy = toLegacyPresence(resolved);
    assert.ok(
      ["present", "afk-short", "afk-long"].includes(legacy.humanPresence),
      name
    );
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
      `${name}: legacy resolver agrees`
    );
  }
});

test("0.1 presence values read back into the matrix", () => {
  // Plain 0.1 cowork is the offer-and-click rhythm: the human holds the click.
  const read = fromLegacyPresence({ humanPresence: "present", agentPresence: "active" });
  assert.deepEqual(read.human, { availability: "here", role: "acting" });
  assert.deepEqual(read.model, { availability: "here", role: "observing" });
  // An explicitly collaborating model is the one working; the human watches.
  const modelWorking = fromLegacyPresence({
    humanPresence: "present",
    agentPresence: "active",
    agentEngagement: "collaborating"
  });
  assert.deepEqual(modelWorking.human, { availability: "here", role: "observing" });
  assert.deepEqual(modelWorking.model, { availability: "here", role: "acting" });
  assert.equal(resolveWorkMode(modelWorking).authority, "model");
  const observing = fromLegacyPresence({
    humanPresence: "afk-short",
    agentPresence: "active",
    agentEngagement: "observing"
  });
  assert.equal(observing.human.availability, "standby");
  assert.equal(observing.model.role, "observing");
  assert.equal(
    fromLegacyPresence({ humanPresence: "present", agentPresence: "paused" }).model.availability,
    "standby"
  );
  assert.throws(
    () => fromLegacyPresence({ humanPresence: "asleep", agentPresence: "active" }),
    CoworkProtocolError
  );
});
