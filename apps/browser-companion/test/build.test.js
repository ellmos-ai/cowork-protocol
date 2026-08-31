import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { buildBrowserCompanion } from "../../../scripts/build-browser-companion.mjs";

test("the browser companion builds a self-contained MV3 extension", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "cowork-companion-build-"));
  const outputRoot = path.join(tempRoot, "dist-browser-companion");
  try {
    const report = await buildBrowserCompanion({
      sourceRoot: path.resolve("."),
      outputRoot
    });
    assert.equal(report.files.includes("manifest.json"), true);
    assert.equal(
      report.files.includes("modules/packages/bridge/src/companion.js"),
      true
    );
    assert.equal(
      report.files.includes("modules/packages/core/src/index.js"),
      true
    );

    const manifest = JSON.parse(
      await readFile(path.join(outputRoot, "manifest.json"), "utf8")
    );
    assert.equal(manifest.manifest_version, 3);
    assert.equal("host_permissions" in manifest, false);
    assert.equal("content_scripts" in manifest, false);
    assert.equal(manifest.background.type, "module");
    assert.equal(manifest.action.default_title, "Open Cowork Protocol");
    assert.deepEqual(manifest.permissions, ["activeTab", "scripting", "sidePanel"]);
    assert.equal(manifest.side_panel.default_path, "sidepanel.html");
    assert.equal(
      manifest.commands._execute_action.suggested_key.default,
      "Ctrl+Shift+Y"
    );
    assert.equal(report.files.includes("native-page-bridge.js"), true);
    assert.equal(
      report.files.includes("modules/apps/browser-companion/src/native-page-client.js"),
      true
    );
    assert.equal(report.files.includes("sidepanel.html"), true);
    assert.equal(report.files.includes("sidepanel.css"), true);
    assert.equal(report.files.includes("sidepanel.js"), true);
    assert.equal(
      report.files.includes(
        "modules/apps/browser-companion/src/cockpit-presentation.js"
      ),
      true
    );
    assert.equal(
      report.files.includes(
        "modules/packages/reference-ui/assets/cowork-dialogue-mark.svg"
      ),
      true
    );
    assert.equal(
      manifest.web_accessible_resources[0].resources.includes(
        "modules/packages/reference-ui/src/index.js"
      ),
      true
    );
    for (const size of [16, 48, 128]) {
      assert.equal(report.files.includes(`icons/icon-${size}.png`), true);
      assert.equal(manifest.icons[String(size)], `icons/icon-${size}.png`);
      assert.equal(manifest.action.default_icon[String(size)], `icons/icon-${size}.png`);
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("the extension build refuses to replace an unrelated directory", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "cowork-companion-guard-"));
  try {
    await assert.rejects(
      buildBrowserCompanion({
        sourceRoot: path.resolve("."),
        outputRoot: path.join(tempRoot, "important")
      }),
      /dist-browser-companion/
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
