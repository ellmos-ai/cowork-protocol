import assert from "node:assert/strict";
import test from "node:test";

import * as launcherModule from "../src/window-launcher.js";

test("Windows launches the Companion as an independent app window without an extension", async () => {
  assert.equal(typeof launcherModule.launchCompanionWindow, "function");
  const calls = [];
  const child = { unrefCalled: false, unref() { this.unrefCalled = true; } };
  const result = await launcherModule.launchCompanionWindow({
    url: "http://127.0.0.1:47831/cowork/v1/ui",
    platform: "win32",
    accessImpl: async (candidate) => {
      if (!candidate.endsWith("msedge.exe")) throw Object.assign(new Error("missing"), { code: "ENOENT" });
    },
    spawnImpl: (command, args, options) => {
      calls.push({ command, args, options });
      return child;
    }
  });

  assert.equal(result.launched, true);
  assert.match(result.browserPath, /msedge\.exe$/);
  assert.deepEqual(calls[0].args, [
    "--app=http://127.0.0.1:47831/cowork/v1/ui",
    "--window-size=430,760"
  ]);
  assert.equal(calls[0].options.detached, true);
  assert.equal(calls[0].options.windowsHide, false);
  assert.equal(child.unrefCalled, true);
});

test("a missing app-window runtime reports an honest non-launch", async () => {
  const result = await launcherModule.launchCompanionWindow({
    url: "http://127.0.0.1:47831/cowork/v1/ui",
    platform: "win32",
    accessImpl: async () => {
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    },
    spawnImpl: () => {
      throw new Error("must not spawn");
    }
  });
  assert.deepEqual(result, { launched: false, reason: "BROWSER_APP_RUNTIME_NOT_FOUND" });
});
