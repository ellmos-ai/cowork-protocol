import assert from "node:assert/strict";
import test from "node:test";

import * as trayModule from "../src/tray-launcher.js";

test("Windows starts the bounded Companion tray process hidden", () => {
  assert.equal(typeof trayModule.launchCompanionTray, "function");
  const calls = [];
  const child = { unrefCalled: false, unref() { this.unrefCalled = true; } };
  const result = trayModule.launchCompanionTray({
    uiUrl: "http://127.0.0.1:47831/cowork/v1/ui",
    platform: "win32",
    spawnImpl: (command, args, options) => {
      calls.push({ command, args, options });
      return child;
    }
  });
  assert.equal(result.launched, true);
  assert.equal(calls[0].command, "powershell.exe");
  assert.equal(calls[0].args.includes("-UiUrl"), true);
  assert.equal(calls[0].args.at(-1), "http://127.0.0.1:47831/cowork/v1/ui");
  assert.equal(calls[0].options.windowsHide, true);
  assert.equal(calls[0].options.detached, true);
  assert.equal(child.unrefCalled, true);
});

test("non-Windows hosts do not claim a native tray", () => {
  assert.deepEqual(
    trayModule.launchCompanionTray({
      uiUrl: "http://127.0.0.1:47831/cowork/v1/ui",
      platform: "linux"
    }),
    { launched: false, reason: "TRAY_UNAVAILABLE" }
  );
});
