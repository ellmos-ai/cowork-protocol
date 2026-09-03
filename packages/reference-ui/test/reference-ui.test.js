import assert from "node:assert/strict";
import test from "node:test";

import {
  REFERENCE_UI_PROVIDER_ID,
  buildWorkModePresentation,
  statusForWorkModeChoice,
  workModeChoices
} from "../src/index.js";
import { resolveWorkMode } from "../../core/src/index.js";

const HUMAN_AREA = "field:full-name";
const MODEL_AREA = "field:email";

function resolved(choiceId, { modelAuthorityValid = true } = {}) {
  const status = statusForWorkModeChoice(choiceId, {
    human: { area: HUMAN_AREA },
    model: { area: MODEL_AREA }
  });
  return resolveWorkMode({ ...status, modelAuthorityValid });
}

test("picking a mode and resolving it returns the words that mode promises", () => {
  const expected = {
    "sparring-human": ["Sparring · you execute", "You are executing", "Model is advising"],
    "sparring-model": ["Sparring · model executes", "You are advising", "Model is executing"],
    doubling: ["Doubling", "You are executing", "Model is executing"],
    "human-solo": ["You work alone", "You are executing", "Model on standby"],
    "model-solo": ["Model works alone", "You are briefly away", "Model is executing"],
    idle: ["Nobody is executing", "You are advising", "Model on standby"]
  };

  for (const [choiceId, [modeLabel, humanLabel, modelLabel]] of Object.entries(expected)) {
    const presentation = buildWorkModePresentation(resolved(choiceId));
    assert.equal(presentation.modeLabel, modeLabel, choiceId);
    assert.equal(presentation.humanLabel, humanLabel, choiceId);
    assert.equal(presentation.modelLabel, modelLabel, choiceId);
    assert.equal(presentation.providerId, REFERENCE_UI_PROVIDER_ID, choiceId);
  }
});

test("the same presentation serves every surface: one vocabulary, no per-surface wording", () => {
  const presentation = buildWorkModePresentation(resolved("sparring-model"));
  // Everything a surface needs to render is here; nothing is left to invent.
  for (const key of [
    "modeLabel",
    "modeDetail",
    "relayState",
    "humanLabel",
    "humanBadge",
    "humanTone",
    "modelLabel",
    "modelBadge",
    "modelTone",
    "roleLabel",
    "roleDetail",
    "areaLabel",
    "authorityLabel"
  ]) {
    assert.equal(typeof presentation[key], "string", key);
    assert.notEqual(presentation[key].trim(), "", key);
  }
  assert.equal(presentation.authorityLabel, "The model holds the click right");
  assert.equal(presentation.areaLabel, `You: ${HUMAN_AREA} · Model: ${MODEL_AREA}`);
});

test("doubling is offered only while the two are on different areas", () => {
  const apart = resolved("doubling");
  assert.equal(apart.mode, "doubling");
  assert.ok(workModeChoices(apart).some((choice) => choice.id === "doubling"));

  const together = resolveWorkMode({
    human: { availability: "here", role: "executing", area: HUMAN_AREA },
    model: { availability: "here", role: "executing", area: HUMAN_AREA },
    modelAuthorityValid: true
  });
  assert.equal(together.mode, "sparring");
  assert.equal(
    workModeChoices(together).some((choice) => choice.id === "doubling"),
    false,
    "a mode the task cannot deliver is not offered"
  );
});

test("a model without a valid grant is shown advising, not executing", () => {
  const presentation = buildWorkModePresentation(
    resolved("sparring-model", { modelAuthorityValid: false })
  );
  assert.equal(presentation.modelLabel, "Model is advising");
  assert.equal(presentation.roleLabel, "Advising");
  assert.equal(presentation.authorityLabel, "Nobody holds the click right");
});

test("picking a mode carries the areas over instead of inventing them", () => {
  const status = statusForWorkModeChoice("sparring-model", {
    human: { area: HUMAN_AREA },
    model: { area: MODEL_AREA }
  });
  assert.equal(status.human.area, HUMAN_AREA);
  assert.equal(status.model.area, MODEL_AREA);

  const empty = statusForWorkModeChoice("sparring-model");
  assert.equal(empty.human.area, null);
  assert.equal(empty.model.area, null);
  assert.equal(
    buildWorkModePresentation(resolveWorkMode({ ...empty, modelAuthorityValid: true })).areaLabel,
    "Nothing claimed yet"
  );
});

test("a disconnected seat reads as no seat, not as a paused model", () => {
  const presentation = buildWorkModePresentation(
    resolveWorkMode({
      human: { availability: "here", role: "executing", area: HUMAN_AREA },
      model: { availability: "away", role: "advising", area: null }
    })
  );
  assert.equal(presentation.modelLabel, "No model connected");
  assert.equal(presentation.roleLabel, "No seat");
});

test("unknown protocol state never becomes a guessed UI mode", () => {
  assert.throws(() => buildWorkModePresentation(undefined), TypeError);
  assert.throws(
    () =>
      buildWorkModePresentation({
        mode: "brainstorm",
        authority: "human",
        human: { availability: "here", role: "executing", area: null },
        model: { availability: "here", role: "advising", area: null }
      }),
    TypeError
  );
  assert.throws(() => statusForWorkModeChoice("freestyle"), TypeError);
});
