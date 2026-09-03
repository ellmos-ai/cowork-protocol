import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTOR_STATUS_CYCLE,
  buildCockpitPresentation,
  nextActorStatus,
  nextAvailableStatus
} from "../src/cockpit-presentation.js";

const AREA = "Event registration";
const OTHER_AREA = "Speaker list";
const HERE_EXECUTING = { availability: "here", role: "executing" };
const HERE_ADVISING = { availability: "here", role: "advising" };
const STANDBY = { availability: "standby", role: "advising" };
const AWAY = { availability: "away", role: "advising" };

function build(overrides = {}) {
  return buildCockpitPresentation({
    mode: "native-cowork",
    executionMode: "structured",
    human: { ...HERE_EXECUTING, area: AREA },
    model: { ...HERE_ADVISING, area: AREA },
    modelAuthorityValid: true,
    contextLevel: 0,
    ...overrides
  });
}

test("both here on one area, the human executing, means the human holds the click right", () => {
  assert.deepEqual(build(), {
    route: "native",
    routeLabel: "Native Cowork",
    executionMode: "structured",
    executionLabel: "Structured actions",
    computerUseActive: false,
    providerId: "cowork-reference-ui",
    mode: "sparring",
    authority: "human",
    modeLabel: "Sparring · you execute",
    modeDetail: "You act, the model advises. Say the word and it swaps.",
    relayState: "watching",
    humanState: "here-executing",
    humanLabel: "You are executing",
    humanTone: "green",
    humanArea: AREA,
    modelState: "here-advising",
    modelLabel: "Model is advising",
    modelTone: "green",
    modelArea: AREA,
    roleLabel: "Advising",
    roleDetail: "Explains and proposes. Nothing changes without your click.",
    areaLabel: "Both on Event registration",
    authorityLabel: "You hold the click right",
    authorityLapsed: false,
    doublingAvailable: false,
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

// The security core: a role is an intent, the grant is the evidence.
test("a model set to execute without a current grant does not execute", () => {
  const lapsed = build({
    human: { ...HERE_ADVISING, area: AREA },
    model: { ...HERE_EXECUTING, area: AREA },
    modelAuthorityValid: false
  });
  assert.equal(lapsed.authorityLapsed, true);
  assert.equal(lapsed.modelState, "here-advising");
  assert.equal(lapsed.roleLabel, "Advising");
  assert.equal(lapsed.authority, "none");
  assert.equal(lapsed.mode, "idle");
  assert.equal(lapsed.relayState, "dormant");

  // The same statuses with a grant do execute - so it is the record that
  // decides, not the wording.
  const granted = build({
    human: { ...HERE_ADVISING, area: AREA },
    model: { ...HERE_EXECUTING, area: AREA },
    modelAuthorityValid: true
  });
  assert.equal(granted.authorityLapsed, false);
  assert.equal(granted.modelState, "here-executing");
  assert.equal(granted.authority, "model");
  assert.equal(granted.modeLabel, "Sparring · model executes");

  // A present human is not an authority record either.
  const humanPresent = build({
    human: { ...HERE_EXECUTING, area: AREA },
    model: { ...HERE_EXECUTING, area: AREA },
    modelAuthorityValid: false
  });
  assert.equal(humanPresent.authorityLapsed, true);
  assert.equal(humanPresent.modelState, "here-advising");
  assert.equal(humanPresent.authority, "human");
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
  const presentation = build({
    mode: "off",
    human: { ...HERE_EXECUTING, area: null },
    model: { ...AWAY, area: null }
  });
  assert.equal(
    presentation.routeExplainer,
    "Not attached. Click the toolbar icon on a page to attach this panel."
  );
  assert.equal(presentation.seatNote, "No page attached.");
  assert.equal(presentation.modelState, "away");
  assert.equal(presentation.modelLabel, "No model connected");
  assert.equal(presentation.roleLabel, "No seat");
  assert.equal(presentation.areaLabel, "Nothing claimed yet");
});

test("doubling needs two areas, not a switch", () => {
  const sameArea = build({
    human: { ...HERE_EXECUTING, area: AREA },
    model: { ...HERE_EXECUTING, area: AREA }
  });
  assert.equal(sameArea.mode, "sparring");
  assert.equal(sameArea.authority, "human");
  assert.equal(sameArea.doublingAvailable, false);

  const separateAreas = build({
    human: { ...HERE_EXECUTING, area: AREA },
    model: { ...HERE_EXECUTING, area: OTHER_AREA }
  });
  assert.equal(separateAreas.mode, "doubling");
  assert.equal(separateAreas.authority, "both");
  assert.equal(separateAreas.doublingAvailable, true);
  assert.equal(separateAreas.modeLabel, "Doubling");
  assert.equal(separateAreas.areaLabel, "You: Event registration · Model: Speaker list");
  assert.equal(separateAreas.authorityLabel, "Both hold the click right, each in its own area");
});

test("advising is the advisory seat: it comments and proposes, it does not click", () => {
  const advising = build();
  assert.equal(advising.modelState, "here-advising");
  assert.equal(advising.roleDetail, "Explains and proposes. Nothing changes without your click.");
  assert.equal(advising.relayState, "watching");

  const modelExecutes = build({
    human: { ...HERE_ADVISING, area: AREA },
    model: { ...HERE_EXECUTING, area: AREA }
  });
  assert.equal(modelExecutes.mode, "sparring");
  assert.equal(modelExecutes.authority, "model");
  assert.equal(modelExecutes.relayState, "live");
  assert.equal(modelExecutes.roleLabel, "Executing");
  assert.equal(modelExecutes.authorityLabel, "The model holds the click right");
});

test("a model on standby is connected but not working, and away has no seat at all", () => {
  const standby = build({ model: { ...STANDBY, area: AREA } });
  assert.equal(standby.mode, "human-solo");
  assert.equal(standby.modelState, "standby");
  assert.equal(standby.modelLabel, "Model on standby");
  assert.equal(standby.roleLabel, "Standing by");
  assert.equal(standby.relayState, "dormant");

  const away = build({ model: { ...AWAY, area: null } });
  assert.equal(away.modelState, "away");
  assert.equal(away.modelLabel, "No model connected");
  assert.equal(away.roleLabel, "No seat");
  assert.equal(away.areaLabel, "You: Event registration");
});

test("absence becomes model solo only with a valid authority record", () => {
  const solo = build({
    human: { ...STANDBY, area: AREA },
    model: { ...HERE_EXECUTING, area: AREA }
  });
  assert.equal(solo.humanState, "standby");
  assert.equal(solo.humanLabel, "You are briefly away");
  assert.equal(solo.mode, "model-solo");
  assert.equal(solo.modeLabel, "Model works alone");
  assert.equal(solo.relayState, "to-model");

  const refused = build({
    human: { ...STANDBY, area: AREA },
    model: { ...HERE_EXECUTING, area: AREA },
    modelAuthorityValid: false
  });
  assert.equal(refused.mode, "idle");
  assert.equal(refused.authorityLapsed, true);
  assert.equal(refused.relayState, "dormant");
});

test("long absence and a disconnected model stay visibly idle", () => {
  const presentation = build({
    mode: "off",
    human: { ...AWAY, area: null },
    model: { ...AWAY, area: null }
  });
  assert.equal(presentation.humanState, "away");
  assert.equal(presentation.humanLabel, "You are away");
  assert.equal(presentation.mode, "idle");
  assert.equal(presentation.modeLabel, "Nobody is executing");
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
  assert.throws(() => build({ human: { availability: "maybe", role: "executing" } }), /actor status/);
  assert.throws(() => build({ model: { availability: "here", role: "lurking" } }), /actor status/);
  assert.throws(() => build({ human: { ...HERE_EXECUTING, area: "  " } }), /actor status/);
});

test("a figure click cycles the four statuses in a stable order", () => {
  assert.deepEqual(ACTOR_STATUS_CYCLE, [HERE_EXECUTING, HERE_ADVISING, STANDBY, AWAY]);
  assert.deepEqual(nextActorStatus(HERE_EXECUTING), HERE_ADVISING);
  assert.deepEqual(nextActorStatus(HERE_ADVISING), STANDBY);
  assert.deepEqual(nextActorStatus(STANDBY), AWAY);
  assert.deepEqual(nextActorStatus(AWAY), HERE_EXECUTING);
  // Availability alone identifies an actor that is not here, whatever role a
  // caller passes with it.
  assert.deepEqual(nextActorStatus({ availability: "standby", role: "executing" }), AWAY);
  assert.throws(() => nextActorStatus({ availability: "unknown" }), /actor status/);
});

test("the cycle skips what this surface cannot grant instead of faking it", () => {
  // No grant: executing is unreachable, so the model cycles advising -> standby.
  const noGrant = (candidate) =>
    candidate.availability === "here" && candidate.role === "executing";
  assert.deepEqual(nextAvailableStatus(HERE_ADVISING, noGrant), STANDBY);
  assert.deepEqual(nextAvailableStatus(AWAY, noGrant), HERE_ADVISING);

  // No seat at all: nothing but away is reachable, and the cycle says so
  // rather than clicking a seat into existence.
  assert.equal(nextAvailableStatus(AWAY, (candidate) => candidate.availability !== "away"), null);

  // No grant for the human either: the two here-statuses stay reachable.
  const cannotLeave = (candidate) => candidate.availability !== "here";
  assert.deepEqual(nextAvailableStatus(HERE_EXECUTING, cannotLeave), HERE_ADVISING);
  assert.deepEqual(nextAvailableStatus(HERE_ADVISING, cannotLeave), HERE_EXECUTING);
});

test("registered Cowork tools name their own route and seat", () => {
  const registered = build({ mode: "legacy-host-companion", toolsRegistered: true });
  assert.equal(registered.route, "bridge-webmcp");
  assert.equal(registered.routeLabel, "Bridge + WebMCP");
  assert.match(registered.routeExplainer, /registered Cowork tools here/);
  assert.match(registered.routeExplainer, /your click stays in this panel/);
  // The tools are the extension's; the model still is not.
  assert.match(registered.seatNote, /whichever WebMCP agent this browser attaches/);
  assert.equal(build({ mode: "legacy-host-companion" }).route, "bridge");
});
