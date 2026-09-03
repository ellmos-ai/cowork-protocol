import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTOR_STATUS_CYCLE,
  buildCockpitPresentation,
  nextActorStatus
} from "../src/cockpit-presentation.js";

const HERE_ACTING = { availability: "here", role: "acting" };
const HERE_OBSERVING = { availability: "here", role: "observing" };
const STANDBY = { availability: "standby", role: "observing" };
const AWAY = { availability: "away", role: "observing" };

function build(overrides = {}) {
  return buildCockpitPresentation({
    mode: "native-cowork",
    executionMode: "structured",
    human: HERE_ACTING,
    model: HERE_OBSERVING,
    allowParallel: false,
    modelAuthorityValid: true,
    contextLevel: 0,
    ...overrides
  });
}

test("both here and the human acting means the human holds the click right", () => {
  assert.deepEqual(build(), {
    route: "native",
    routeLabel: "Native Cowork",
    executionMode: "structured",
    executionLabel: "Structured actions",
    computerUseActive: false,
    providerId: "cowork-reference-ui",
    mode: "cowork",
    authority: "human",
    modeLabel: "Together · you act",
    modeDetail: "You click. The model watches and suggests.",
    relayState: "watching",
    humanState: "here-acting",
    humanLabel: "You are working",
    humanTone: "green",
    modelState: "here-observing",
    modelLabel: "Model is advising",
    modelTone: "green",
    taskLabel: "Advise",
    taskDetail: "Explains and proposes. Nothing changes without your click.",
    authorityLabel: "You hold the click right",
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

  const bridge = build({ mode: "legacy-host-companion" });
  assert.match(bridge.routeExplainer, /^Bridge — no protocol on this page/);
  assert.equal(bridge.seatNote, webmcp.seatNote);
});

test("an unattached panel explains how to attach instead of naming a seat", () => {
  const presentation = build({ mode: "off", model: AWAY });
  assert.equal(
    presentation.routeExplainer,
    "Not attached. Click the toolbar icon on a page to attach this panel."
  );
  assert.equal(presentation.seatNote, "No page attached.");
  assert.equal(presentation.modelState, "away");
  assert.equal(presentation.taskLabel, "Disconnected");
});

test("the hand on the mouse wins when both act and parallel work is not allowed", () => {
  const conflict = build({ model: HERE_ACTING });
  assert.equal(conflict.mode, "cowork");
  assert.equal(conflict.authority, "human");
  assert.equal(conflict.modelState, "here-observing");
  assert.equal(conflict.modeLabel, "Together · you act");

  const parallel = build({ model: HERE_ACTING, allowParallel: true });
  assert.equal(parallel.mode, "parallel");
  assert.equal(parallel.authority, "both");
  assert.equal(parallel.modeLabel, "Both at once");
  assert.equal(parallel.authorityLabel, "Both hold the click right");
  assert.equal(parallel.relayState, "live");
});

test("observing is advising: it comments and proposes, it does not click", () => {
  const advising = build();
  assert.equal(advising.modelState, "here-observing");
  assert.equal(advising.modelLabel, "Model is advising");
  assert.equal(advising.taskLabel, "Advise");
  assert.equal(advising.relayState, "watching");

  const modelActs = build({ human: HERE_OBSERVING, model: HERE_ACTING });
  assert.equal(modelActs.mode, "cowork");
  assert.equal(modelActs.authority, "model");
  assert.equal(modelActs.modeLabel, "Together · model acts");
  assert.equal(modelActs.relayState, "live");
  assert.equal(modelActs.authorityLabel, "The model holds the click right");
});

test("a standby model makes the present human the only worker", () => {
  const presentation = build({ mode: "off", model: STANDBY });
  assert.equal(presentation.route, "off");
  assert.equal(presentation.mode, "human-solo");
  assert.equal(presentation.modelState, "standby");
  assert.equal(presentation.modeLabel, "You work alone");
  assert.equal(presentation.relayState, "dormant");
  assert.equal(presentation.taskLabel, "Stand by");
});

test("absence becomes model solo only with a valid authority record", () => {
  const solo = build({ human: STANDBY, model: HERE_ACTING });
  assert.equal(solo.humanState, "standby");
  assert.equal(solo.humanLabel, "You are briefly away");
  assert.equal(solo.mode, "model-solo");
  assert.equal(solo.modeLabel, "Model works alone");
  assert.equal(solo.relayState, "to-model");

  const refused = build({
    human: STANDBY,
    model: HERE_ACTING,
    modelAuthorityValid: false
  });
  assert.equal(refused.mode, "idle");
  assert.equal(refused.modelState, "here-observing");
  assert.equal(refused.relayState, "dormant");
});

test("long absence and a disconnected model stay visibly idle", () => {
  const presentation = build({ mode: "off", human: AWAY, model: AWAY });
  assert.equal(presentation.humanState, "away");
  assert.equal(presentation.humanLabel, "You are away");
  assert.equal(presentation.mode, "idle");
  assert.equal(presentation.modeLabel, "Nobody is acting");
  assert.equal(presentation.authorityLabel, "Nobody holds the click right");
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
  assert.throws(() => build({ human: { availability: "maybe", role: "acting" } }), /actor status/);
  assert.throws(() => build({ model: { availability: "here", role: "background" } }), /actor status/);
});

test("a figure click cycles the four statuses in a stable order", () => {
  assert.deepEqual(ACTOR_STATUS_CYCLE, [HERE_ACTING, HERE_OBSERVING, STANDBY, AWAY]);
  assert.deepEqual(nextActorStatus(HERE_ACTING), HERE_OBSERVING);
  assert.deepEqual(nextActorStatus(HERE_OBSERVING), STANDBY);
  assert.deepEqual(nextActorStatus(STANDBY), AWAY);
  assert.deepEqual(nextActorStatus(AWAY), HERE_ACTING);
  // Availability alone identifies an actor that is not here, whatever role a
  // caller passes with it.
  assert.deepEqual(nextActorStatus({ availability: "standby", role: "acting" }), AWAY);
  assert.throws(() => nextActorStatus({ availability: "unknown" }), /actor status/);
});
