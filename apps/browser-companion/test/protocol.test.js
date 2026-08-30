import assert from "node:assert/strict";
import test from "node:test";

import {
  computeVisualCrop,
  describeDomTarget,
  normalizeCompanionRequest
} from "../src/protocol.js";

function fakeElement(overrides = {}) {
  const attributes = new Map(Object.entries(overrides.attributes ?? {}));
  return {
    tagName: "INPUT",
    id: "project-title",
    name: "title",
    type: "text",
    value: "Draft",
    selectionStart: 0,
    selectionEnd: 5,
    labels: [{ textContent: "Project title" }],
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
    ...overrides
  };
}

function fakeDocument(element, { duplicateName = false } = {}) {
  return {
    getElementById(id) {
      return id === element.id ? element : null;
    },
    getElementsByName(name) {
      if (name !== element.name) return [];
      return duplicateName ? [element, {}] : [element];
    }
  };
}

test("the DOM target descriptor prefers a unique stable id and keeps only selected text", () => {
  const element = fakeElement();
  const target = describeDomTarget(element, fakeDocument(element));

  assert.deepEqual(target, {
    stableId: "id:project-title",
    tagName: "input",
    role: "textbox",
    label: "Project title",
    selectedText: "Draft"
  });
});

test("sensitive and unstable controls remain explain-only", () => {
  const password = fakeElement({ id: "", name: "secret", type: "password" });
  const passwordTarget = describeDomTarget(password, fakeDocument(password));
  assert.equal(passwordTarget.stableId, undefined);
  assert.equal(passwordTarget.selectedText, undefined);
  assert.equal(passwordTarget.label, "Project title");

  const duplicate = fakeElement({ id: "", name: "title" });
  const duplicateTarget = describeDomTarget(
    duplicate,
    fakeDocument(duplicate, { duplicateName: true })
  );
  assert.equal(duplicateTarget.stableId, undefined);
});

test("the visual crop stays pointer-centered, bounded and scaled to screenshot pixels", () => {
  assert.deepEqual(
    computeVisualCrop({
      center: { x: 900, y: 700 },
      maximumWidth: 400,
      maximumHeight: 400,
      viewportWidth: 1000,
      viewportHeight: 800,
      bitmapWidth: 2000,
      bitmapHeight: 1600
    }),
    {
      css: { left: 600, top: 400, width: 400, height: 400 },
      source: { x: 1200, y: 800, width: 800, height: 800 },
      output: { width: 400, height: 400 }
    }
  );

  assert.equal(
    normalizeCompanionRequest({
      source: "cowork-page-client",
      protocolVersion: "0.1",
      requestId: "request-visual",
      method: "consumeVisualRegion",
      arguments: { referenceId: "pointer-region:fixture" }
    }),
    null
  );

  assert.deepEqual(
    computeVisualCrop({
      center: { x: 25, y: 30 },
      maximumWidth: 400,
      maximumHeight: 400,
      viewportWidth: 300,
      viewportHeight: 200,
      bitmapWidth: 600,
      bitmapHeight: 400
    }).css,
    { left: 0, top: 0, width: 300, height: 200 }
  );
});

test("only bounded versioned page-client requests cross the extension transport", () => {
  assert.deepEqual(
    normalizeCompanionRequest({
      source: "cowork-page-client",
      protocolVersion: "0.1",
      requestId: "request-1",
      method: "requestContext",
      arguments: { currentLevel: 0, requestedLevel: 1 }
    }),
    {
      requestId: "request-1",
      method: "requestContext",
      arguments: { currentLevel: 0, requestedLevel: 1 }
    }
  );

  assert.equal(
    normalizeCompanionRequest({
      source: "cowork-page-client",
      protocolVersion: "0.1",
      requestId: "request-2",
      method: "confirmAction",
      arguments: {}
    }),
    null
  );
  assert.equal(
    normalizeCompanionRequest({
      source: "cowork-page-client",
      protocolVersion: "0.1",
      requestId: "x".repeat(121),
      method: "readFocus",
      arguments: {}
    }),
    null
  );
});
