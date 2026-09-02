import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { installedChromeForTesting, removeTempProfile } from "../smoke-runtime.mjs";

test("removeTempProfile deletes a temp profile and tolerates one that is already gone", async () => {
  const profile = await mkdtemp(path.join(tmpdir(), "cowork-smoke-runtime-test-"));
  await writeFile(path.join(profile, "first_party_sets.db"), "x");

  await removeTempProfile(profile);
  await assert.rejects(access(profile));

  await removeTempProfile(profile);
});

test("removeTempProfile refuses a path outside the temp directory", async () => {
  await assert.rejects(removeTempProfile(path.resolve("scripts")), /outside the temp directory/);
});

test("installedChromeForTesting picks the newest cached version and null without a cache", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "cowork-smoke-runtime-cft-"));
  try {
    for (const version of ["win64-152.0.7977.64", "win64-152.0.7977.65", "win64-9.0.0.1"]) {
      const directory = path.join(root, version, "chrome-win64");
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, "chrome.exe"), "");
    }
    const found = await installedChromeForTesting(root);
    if (process.platform === "win32") {
      assert.equal(found, path.join(root, "win64-152.0.7977.65", "chrome-win64", "chrome.exe"));
    } else {
      assert.equal(found, null);
    }
    assert.equal(await installedChromeForTesting(path.join(root, "missing")), null);
  } finally {
    await removeTempProfile(root);
  }
});
