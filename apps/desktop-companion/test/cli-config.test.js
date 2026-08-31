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
  assert.equal(config.computerUse.command, "uvx");
  assert.equal(config.computerUse.env.OC_SAFETY_MODE, "confirm");
  assert.match(config.computerUse.profilePath, /cowork-open-compute-filter\.v1\.json$/);
  assert.deepEqual(config.computerUse.args, [
    "--from",
    "open-compute[mcp,local,uia] @ git+https://github.com/ellmos-ai/open-compute.git",
    "open-compute-mcp"
  ]);
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
  const sessionStorePath = path.resolve("/state/cowork.json");
  const config = configModule.createCompanionCliConfig({
    env: {
      COWORK_ALLOWED_ORIGINS: "https://forms.example",
      COWORK_MODEL_ENDPOINT: "https://models.example/v1/chat/completions",
      COWORK_MODEL: "preferred-model",
      COWORK_OPEN_WINDOW: "0",
      COWORK_TRAY: "0",
      COWORK_SESSION_STORE: sessionStorePath
    },
    cwd: "C:\\repo"
  });
  assert.equal(config.openWindow, false);
  assert.equal(config.tray, false);
  assert.equal(config.model.model, "preferred-model");
  assert.equal(config.sessionStorePath, sessionStorePath);
});

test("Computer Use is a profile-filtered optional driver with an explicit safety ceiling", () => {
  const disabled = configModule.createCompanionCliConfig({
    env: {
      COWORK_ALLOWED_ORIGINS: "https://forms.example",
      COWORK_COMPUTER_USE: "0"
    },
    cwd: "C:\\repo"
  });
  assert.equal(disabled.computerUse, null);

  const custom = configModule.createCompanionCliConfig({
    env: {
      COWORK_ALLOWED_ORIGINS: "https://forms.example",
      COWORK_OPEN_COMPUTE_COMMAND: "python",
      COWORK_OPEN_COMPUTE_ARGS: JSON.stringify(["-m", "open_compute.mcp_server"]),
      COWORK_OPEN_COMPUTE_SAFETY: "read_only"
    },
    cwd: "C:\\repo"
  });
  assert.equal(custom.computerUse.command, "python");
  assert.deepEqual(custom.computerUse.args, ["-m", "open_compute.mcp_server"]);
  assert.equal(custom.computerUse.env.OC_SAFETY_MODE, "read_only");

  assert.throws(
    () => configModule.createCompanionCliConfig({
      env: {
        COWORK_ALLOWED_ORIGINS: "https://forms.example",
        COWORK_OPEN_COMPUTE_SAFETY: "unsafe"
      }
    }),
    /OPEN_COMPUTE_SAFETY/
  );
});
