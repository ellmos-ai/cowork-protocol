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
    assert.deepEqual(manifest.host_permissions, ["<all_urls>"]);
    assert.deepEqual(manifest.content_scripts[0].matches, ["<all_urls>"]);
    assert.equal(manifest.background.type, "module");
    assert.equal(manifest.action.default_title, "Open Cowork Protocol");
    assert.deepEqual(manifest.permissions, ["sidePanel"]);
    assert.equal(manifest.side_panel.default_path, "sidepanel.html");
    assert.equal(manifest.content_scripts[0].world, "MAIN");
    assert.deepEqual(manifest.content_scripts[0].js, ["native-page-bridge.js"]);
    assert.equal(report.files.includes("native-page-bridge.js"), true);
    assert.equal(
      report.files.includes("modules/apps/browser-companion/src/native-page-client.js"),
      true
    );
    assert.equal(report.files.includes("sidepanel.html"), true);
    assert.equal(report.files.includes("sidepanel.css"), true);
    assert.equal(report.files.includes("sidepanel.js"), true);
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
