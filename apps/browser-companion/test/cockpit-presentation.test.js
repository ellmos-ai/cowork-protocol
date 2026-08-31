import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCockpitPresentation,
  nextHumanPresence,
  nextModelEngagement
} from "../src/cockpit-presentation.js";

function build(overrides = {}) {
  return buildCockpitPresentation({
    enabled: true,
    mode: "native-cowork",
    executionMode: "structured",
    humanPresence: "present",
    agentEngagement: "collaborating",
    soloLeaseValid: false,
    contextLevel: 0,
    ...overrides
  });
}

test("the cockpit turns live when human and model collaborate", () => {
  assert.deepEqual(build(), {
    route: "native",
    routeLabel: "Native Cowork",
    executionMode: "structured",
    executionLabel: "Structured actions",
    computerUseActive: false,
    humanState: "present",
    humanLabel: "You are here",
    modelState: "collaborating",
    modelLabel: "Model collaborating",
    effectiveMode: "cowork",
    modeLabel: "Working together",
    relayState: "live",
    contextLevel: 0,
    contextLabel: "Focus only"
  });
});

test("observing is an explain-only engagement, not a second presence value", () => {
  const presentation = build({ agentEngagement: "observing" });
  assert.equal(presentation.modelState, "observing");
  assert.equal(presentation.modelLabel, "Model observing");
  assert.equal(presentation.effectiveMode, "cowork");
  assert.equal(presentation.modeLabel, "Model watching");
  assert.equal(presentation.relayState, "watching");
});

test("a paused model makes the present human the only worker", () => {
  const presentation = build({ enabled: false, mode: "off", agentEngagement: "paused" });
  assert.equal(presentation.route, "off");
  assert.equal(presentation.effectiveMode, "human-solo");
  assert.equal(presentation.modelState, "paused");
  assert.equal(presentation.relayState, "dormant");
});

test("brief human absence becomes agent solo only with a real lease", () => {
  const solo = build({ humanPresence: "afk-short", soloLeaseValid: true });
  assert.equal(solo.humanState, "afk-short");
  assert.equal(solo.humanLabel, "You are briefly away");
  assert.equal(solo.effectiveMode, "agent-solo");
  assert.equal(solo.relayState, "to-model");

  const refused = build({ humanPresence: "afk-short", soloLeaseValid: false });
  assert.equal(refused.effectiveMode, "idle");
  assert.equal(refused.relayState, "dormant");
});

test("long absence and a paused model stay visibly idle", () => {
  const presentation = build({
    enabled: false,
    mode: "off",
    humanPresence: "afk-long",
    agentEngagement: "paused"
  });
  assert.equal(presentation.humanState, "afk-long");
  assert.equal(presentation.humanLabel, "You are away");
  assert.equal(presentation.effectiveMode, "idle");
  assert.equal(presentation.modeLabel, "Both paused");
});

test("connector and context instruments expose only bounded real levels", () => {
  assert.equal(build({ mode: "native-webmcp", contextLevel: 1 }).route, "webmcp");
  assert.equal(build({ mode: "legacy-host-companion", contextLevel: 2 }).route, "bridge");
  assert.equal(build({ contextLevel: 2 }).contextLabel, "Related context");
  assert.equal(build({ contextLevel: 3 }).contextLabel, "One visual lens");
  assert.throws(() => build({ contextLevel: 4 }), /context level/);
});

test("computer use is a separate expensive execution signal, never a connector alias", () => {
  const presentation = build({
    mode: "legacy-host-companion",
    executionMode: "computer-use"
  });
  assert.equal(presentation.route, "bridge");
  assert.equal(presentation.routeLabel, "Bounded Bridge");
  assert.equal(presentation.executionMode, "computer-use");
  assert.equal(presentation.executionLabel, "Computer use · higher token use");
  assert.equal(presentation.computerUseActive, true);
  assert.throws(() => build({ executionMode: "visual-ish" }), /execution mode/);
});

test("unknown actor states fail closed instead of inventing a visual mode", () => {
  assert.throws(() => build({ humanPresence: "maybe" }), /human presence/);
  assert.throws(() => build({ agentEngagement: "background" }), /model engagement/);
});

test("actor clicks cycle through the visible state language in a stable order", () => {
  assert.equal(nextModelEngagement("collaborating"), "observing");
  assert.equal(nextModelEngagement("observing"), "paused");
  assert.equal(nextModelEngagement("paused"), "collaborating");
  assert.equal(nextHumanPresence("present"), "afk-short");
  assert.equal(nextHumanPresence("afk-short"), "afk-long");
  assert.equal(nextHumanPresence("afk-long"), "present");
  assert.throws(() => nextModelEngagement("unknown"), /model engagement/);
  assert.throws(() => nextHumanPresence("unknown"), /human presence/);
});
