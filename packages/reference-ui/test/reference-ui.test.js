import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReferenceSurfacePresentation,
  REFERENCE_UI_PROVIDER_ID
} from "../src/index.js";

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
