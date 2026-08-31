import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { buildPages } from "../build-pages.mjs";

async function listFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(root, absolute));
    else files.push(path.relative(root, absolute).replaceAll("\\", "/"));
  }
  return files.sort();
}

test("the Pages artifact contains only the web showcase and its runtime modules", async () => {
  const sourceRoot = path.resolve(import.meta.dirname, "../..");
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "cowork-pages-"));
  const outputRoot = path.join(temporaryRoot, "dist");

  try {
    const report = await buildPages({ sourceRoot, outputRoot });
    const files = await listFiles(outputRoot);

    assert.deepEqual(files, report.files);
    assert.equal(files.includes(".nojekyll"), true);
    assert.equal(files.includes("index.html"), true);
    assert.equal(files.includes("apps/formbuilder-showcase/index.html"), true);
    assert.equal(files.includes("apps/formbuilder-showcase/src/app.js"), true);
    assert.equal(files.includes("apps/formbuilder-showcase/src/local-conversation.js"), true);
    assert.equal(files.includes("apps/formbuilder-showcase/src/speech-controller.js"), true);
    assert.equal(files.includes("packages/conversation/src/index.js"), true);
    assert.equal(files.includes("packages/core/src/index.js"), true);
    assert.equal(files.includes("packages/formbuilder-connector/src/index.js"), true);
    assert.equal(files.includes("packages/native-webmcp/src/index.js"), true);
    assert.equal(
      files.includes("packages/reference-ui/assets/cowork-dialogue-mark.svg"),
      true
    );
    assert.equal(files.some((file) => file.includes("/test/")), false);
    assert.equal(files.some((file) => file.startsWith("docs/")), false);
    assert.equal(files.some((file) => /devpost|release-checklist|demo-script/i.test(file)), false);

    const landing = await readFile(path.join(outputRoot, "index.html"), "utf8");
    assert.match(landing, /apps\/formbuilder-showcase\//);
    const appModule = await readFile(
      path.join(outputRoot, "apps/formbuilder-showcase/src/app.js"),
      "utf8"
    );
    assert.match(appModule, /packages\/native-webmcp\/src\/index\.js/);
    assert.match(appModule, /packages\/conversation\/src\/index\.js/);
    assert.match(appModule, /\.\/local-conversation\.js/);
    assert.match(appModule, /\.\/speech-controller\.js/);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("the Pages workflow is manual-only and uses the documented action generations", async () => {
  const sourceRoot = path.resolve(import.meta.dirname, "../..");
  const workflow = await readFile(
    path.join(sourceRoot, ".github/workflows/deploy-pages.yml"),
    "utf8"
  );

  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s+push:/m);
  assert.match(workflow, /actions:\s*read/);
  assert.match(workflow, /actions\/checkout@v6/);
  assert.match(workflow, /actions\/setup-node@v6/);
  assert.match(workflow, /actions\/configure-pages@v5/);
  assert.match(workflow, /actions\/upload-pages-artifact@v4/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
});
