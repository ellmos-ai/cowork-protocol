import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import * as configModule from "../src/cli-config.js";

test("CLI configuration persists sessions and opens the independent surface by default", () => {
  assert.equal(typeof configModule.createCompanionCliConfig, "function");
  const config = configModule.createCompanionCliConfig({
    env: {
      COWORK_ALLOWED_ORIGINS: "https://forms.example,http://127.0.0.1:4173",
      LOCALAPPDATA: "C:\\Users\\tester\\AppData\\Local"
    },
    cwd: "C:\\repo"
  });
  assert.deepEqual(config.allowedOrigins, [
    "https://forms.example",
    "http://127.0.0.1:4173"
  ]);
  assert.equal(
    config.sessionStorePath,
    path.join("C:\\Users\\tester\\AppData\\Local", "Cowork Protocol", "sessions.json")
  );
  assert.equal(config.openWindow, true);
  assert.equal(config.tray, true);
  assert.equal(config.model, null);
});

test("a model endpoint and model id must be configured together", () => {
  assert.throws(
    () => configModule.createCompanionCliConfig({
      env: {
        COWORK_ALLOWED_ORIGINS: "https://forms.example",
        COWORK_MODEL_ENDPOINT: "https://models.example/v1/chat/completions"
      },
      cwd: "C:\\repo"
    }),
    /configured together/
  );
  const config = configModule.createCompanionCliConfig({
    env: {
      COWORK_ALLOWED_ORIGINS: "https://forms.example",
      COWORK_MODEL_ENDPOINT: "https://models.example/v1/chat/completions",
      COWORK_MODEL: "preferred-model",
      COWORK_OPEN_WINDOW: "0",
      COWORK_TRAY: "0",
      COWORK_SESSION_STORE: "C:\\state\\cowork.json"
    },
    cwd: "C:\\repo"
  });
  assert.equal(config.openWindow, false);
  assert.equal(config.tray, false);
  assert.equal(config.model.model, "preferred-model");
  assert.equal(config.sessionStorePath, "C:\\state\\cowork.json");
});
