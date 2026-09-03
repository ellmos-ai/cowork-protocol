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
    relayDetail: "Ideas and actions relay through the page",
    routeExplainer:
      "Native — this page speaks Cowork Protocol. This panel relays the page's own tools; " +
      "offers appear in the page's Cowork panel and are clicked there.",
    seatNote:
      "Model seat: the page's own (Desktop Companion, page host, direct model or demo helper). " +
      "This extension adds no model.",
    contextLevel: 0,
    contextLabel: "Focus only"
  });
});

test("the panel never claims a model seat it does not have", () => {
  const webmcp = build({ mode: "native-webmcp" });
  assert.match(webmcp.routeExplainer, /^WebMCP — the page exposes WebMCP tools/);
  assert.match(webmcp.seatNote, /^Model seat: none\./);
  assert.match(webmcp.seatNote, /npm run start:companion-host/);
  assert.equal(webmcp.relayState, "live");
  assert.equal(webmcp.relayDetail, "Ready to relay — no model connected in this extension");

  const bridge = build({ mode: "legacy-host-companion" });
  assert.match(bridge.routeExplainer, /^Bridge — no protocol on this page/);
  assert.equal(bridge.seatNote, webmcp.seatNote);
  assert.equal(bridge.relayDetail, "Ready to relay — no model connected in this extension");
});

test("an unattached panel explains how to attach instead of naming a seat", () => {
  const presentation = build({ enabled: false, mode: "off", agentEngagement: "paused" });
  assert.equal(
    presentation.routeExplainer,
    "Not attached. Click the toolbar icon on a page to attach this panel."
  );
  assert.equal(presentation.seatNote, "No page attached.");
  assert.equal(presentation.relayDetail, "Model is paused");
});

test("the relay detail follows the relay state, not the route, once work is scoped", () => {
  assert.equal(
    build({ agentEngagement: "observing" }).relayDetail,
    "Model reads and explains only"
  );
  assert.equal(
    build({ humanPresence: "afk-short", soloLeaseValid: true }).relayDetail,
    "Scoped solo work is flowing to the model"
  );
  assert.equal(
    build({ mode: "legacy-host-companion", humanPresence: "afk-short" }).relayDetail,
    "No collaboration turn is active"
  );
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
