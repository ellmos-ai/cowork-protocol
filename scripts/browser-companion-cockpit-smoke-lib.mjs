// Four work modes, each reached through the three status variables per
// partner - who is here, which area, executing or advising. There is no
// action-rights control left to set separately, and no doubling switch:
// doubling needs two different areas, which one relayed page cannot give.
const EXPECTED_STATES = Object.freeze([
  Object.freeze({
    humanState: "here-advising",
    modelState: "here-executing",
    relayState: "live",
    modeLabel: "Sparring · model executes"
  }),
  Object.freeze({
    humanState: "away",
    modelState: "here-executing",
    relayState: "to-model",
    modeLabel: "Model works alone"
  }),
  Object.freeze({
    humanState: "here-executing",
    modelState: "here-advising",
    relayState: "watching",
    modeLabel: "Sparring · you execute"
  }),
  Object.freeze({
    humanState: "here-executing",
    modelState: "standby",
    relayState: "dormant",
    modeLabel: "You work alone"
  })
]);
const EXPECTED_KEYBOARD_ORDER = Object.freeze([
  "human-control",
  "model-control",
  "focus-action",
  "context-gauge",
  "offer-action",
  "voice-action",
  "handoff-action",
  "context-action",
  "toggle"
]);

// A bridge has a place, and the panel has to say which of four things is true
// of that place. Rest, arrival, crossing, departure, rest: the instruments
// exist only in the middle one, and the switch exists throughout.
const EXPECTED_BRIDGE_JOURNEY = Object.freeze([
  Object.freeze({
    bridge: "resting",
    message: "No model is crossing the bridge.",
    open: false
  }),
  Object.freeze({
    bridge: "arriving",
    message: "A model is coming across the bridge.",
    open: false
  }),
  Object.freeze({
    bridge: "crossing",
    message: "A model is on the bridge.",
    open: true
  }),
  Object.freeze({
    bridge: "leaving",
    message: "The model left the bridge.",
    open: false
  }),
  Object.freeze({
    bridge: "resting",
    message: "No model is crossing the bridge.",
    open: false
  })
]);

function fail(message) {
  throw new Error(`Cockpit browser evidence rejected: ${message}`);
}

export function validateCockpitBrowserObservation(observation) {
  if (!observation || typeof observation !== "object") fail("observation is missing");
  if (typeof observation.browser !== "string" || observation.browser.length === 0) {
    fail("browser identity is missing");
  }
  if (!Array.isArray(observation.states) || observation.states.length !== 4) {
    fail("exactly four visual states are required");
  }
  if (!Array.isArray(observation.screenshots) || observation.screenshots.length !== 4) {
    fail("all four state frames must be captured");
  }

  observation.states.forEach((state, index) => {
    const expected = EXPECTED_STATES[index];
    if (state?.viewport?.width !== 390 || state?.viewport?.height !== 844) {
      fail(`state ${index + 1} did not use the 390x844 viewport`);
    }
    if (state.documentHorizontalOverflow > 1) {
      fail(`state ${index + 1} has horizontal overflow`);
    }
    if (state.horizontallyClippedControls?.length !== 0) {
      fail(`state ${index + 1} clips a control`);
    }
    if (state.unnamedControls?.length !== 0) {
      fail(`state ${index + 1} has an unnamed control`);
    }
    if (!Number.isInteger(state.visibleControlCount) || state.visibleControlCount < 8) {
      fail(`state ${index + 1} exposes too few visible controls`);
    }
    if (state.executionMode !== "structured" || state.computerUseIndicatorVisible !== false) {
      fail(`state ${index + 1} falsely signals Computer Use`);
    }
    for (const [key, value] of Object.entries(expected)) {
      if (state[key] !== value) fail(`state ${index + 1} has the wrong ${key}`);
    }
    for (const key of ["humanLabel", "modelLabel", "humanBadge", "modelBadge"]) {
      if (typeof state[key] !== "string" || state[key].replaceAll('"', "").trim().length === 0) {
        fail(`state ${index + 1} is missing ${key}`);
      }
    }
  });

  const journey = Array.isArray(observation.bridgeJourney) ? observation.bridgeJourney : [];
  if (journey.length !== EXPECTED_BRIDGE_JOURNEY.length) {
    fail("the bridge journey from rest through arrival back to rest is incomplete");
  }
  journey.forEach((step, index) => {
    const expected = EXPECTED_BRIDGE_JOURNEY[index];
    if (step?.bridge !== expected.bridge) {
      fail(`bridge step ${index + 1} is ${step?.bridge}, not ${expected.bridge}`);
    }
    if (step.message?.trim() !== expected.message) {
      fail(`bridge step ${index + 1} does not say "${expected.message}"`);
    }
    if (step.markPaths !== 4) {
      fail(`bridge step ${index + 1} does not draw the shared bridge mark`);
    }
    if (step.powerKeyVisible !== true) {
      fail(`bridge step ${index + 1} hides the switch that got the panel here`);
    }
    if (step.focusInstrumentVisible !== expected.open || step.actorsVisible !== expected.open) {
      fail(
        expected.open
          ? `bridge step ${index + 1} withholds the instruments while a model is on the bridge`
          : `bridge step ${index + 1} offers instruments with no model on the bridge`
      );
    }
  });
  if (!journey[0]?.where?.includes("https://events.example")) {
    fail("the resting bridge does not say which page it is looking at");
  }

  if (observation.focusLabel !== "Selected: Registration title") {
    fail("the focus instrument did not execute through the real Side Panel script");
  }
  if (observation.contextLevel !== "1") {
    fail("the context instrument did not execute through the real Side Panel script");
  }
  if (!Array.isArray(observation.keyboardOrder) || observation.keyboardOrder.length !== 9) {
    fail("the keyboard path is incomplete");
  }
  if (observation.keyboardOrder.some((id, index) => id !== EXPECTED_KEYBOARD_ORDER[index])) {
    fail("the keyboard path does not follow the visible instrument order");
  }
  const responsiveSamples = Array.isArray(observation.responsiveSamples)
    ? observation.responsiveSamples
    : [];
  const expectedViewports = [[320, 640], [390, 844], [480, 900]];
  if (responsiveSamples.length !== expectedViewports.length) {
    fail("the responsive cockpit range is incomplete");
  }
  responsiveSamples.forEach((sample, index) => {
    const [width, height] = expectedViewports[index];
    if (
      sample?.viewport?.width !== width ||
      sample?.viewport?.height !== height ||
      sample.documentHorizontalOverflow > 1 ||
      sample.horizontallyClippedControls?.length !== 0
    ) {
      fail(`the ${width}x${height} responsive cockpit sample is clipped`);
    }
  });

  return {
    ...observation,
    cockpitVisualClaim: true,
    bridgeRestArriveDepartClaim: true,
    narrowViewportClaim: true,
    responsiveRangeClaim: true,
    keyboardNavigationClaim: true,
    colorOnlyStatusClaim: false,
    productionSidePanelClaim: true,
    computerUseTruthfulnessClaim: true
  };
}
