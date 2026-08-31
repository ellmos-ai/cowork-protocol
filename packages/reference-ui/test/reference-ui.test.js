import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCollaborationPresentation,
  buildReferenceSurfacePresentation,
  REFERENCE_UI_PROVIDER_ID
} from "../src/index.js";

test("actor and relay semantics stay identical across embedded and companion consumers", () => {
  assert.deepEqual(
    buildCollaborationPresentation({
      humanPresence: "present",
      agentEngagement: "observing",
      effectiveMode: "cowork"
    }),
    {
      humanState: "present",
      humanLabel: "You are here",
      humanBadge: "●",
      modelState: "observing",
      modelLabel: "Model observing",
      modelBadge: "◉",
      relayState: "watching",
      modeLabel: "Model watching"
    }
  );

  assert.deepEqual(
    buildCollaborationPresentation({
      humanPresence: "afk-short",
      agentEngagement: "collaborating",
      effectiveMode: "agent-solo"
    }),
    {
      humanState: "afk-short",
      humanLabel: "You are briefly away",
      humanBadge: "◷",
      modelState: "collaborating",
      modelLabel: "Model collaborating",
      modelBadge: "✓",
      relayState: "to-model",
      modeLabel: "Model working solo"
    }
  );

  assert.equal(
    buildCollaborationPresentation({
      humanPresence: "present",
      agentEngagement: "paused",
      effectiveMode: "cowork"
    }).modeLabel,
    "Human working solo",
    "the visual layer must not show Cowork when action rights are paused"
  );

  assert.deepEqual(
    buildCollaborationPresentation({
      humanPresence: "afk-short",
      agentEngagement: "collaborating",
      effectiveMode: "idle"
    }),
    {
      humanState: "afk-short",
      humanLabel: "You are briefly away",
      humanBadge: "◷",
      modelState: "collaborating",
      modelLabel: "Model ready",
      modelBadge: "✓",
      relayState: "dormant",
      modeLabel: "Model waiting"
    },
    "an active model without delegated rights must look ready but not working"
  );
});

test("the same provider identity and presence semantics are reusable across UI hosts", () => {
  assert.deepEqual(
    buildReferenceSurfacePresentation({
      humanPresence: "afk-short",
      agentPresence: "active",
      effectiveMode: "agent-solo"
    }),
    {
      providerId: REFERENCE_UI_PROVIDER_ID,
      humanIcon: "●",
      modelIcon: "A",
      humanTone: "yellow",
      humanLabel: "Human briefly away",
      agentLabel: "Agent active",
      modeLabel: "Agent solo"
    }
  );
});

test("unknown protocol state never becomes a guessed UI mode", () => {
  assert.throws(
    () =>
      buildReferenceSurfacePresentation({
        humanPresence: "maybe-away",
        agentPresence: "active",
        effectiveMode: "cowork"
      }),
    /valid Cowork presence/
  );
});
