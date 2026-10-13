import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createTempProfile, installedChromeForTesting, removeTempProfile } from "../smoke-runtime.mjs";

test("removeTempProfile is idempotent but refuses a path that reappears", async () => {
  const profile = await createTempProfile("cowork-smoke-runtime-test-");
  await writeFile(path.join(profile, "first_party_sets.db"), "x");

  await removeTempProfile(profile);
  await assert.rejects(access(profile));
  await removeTempProfile(profile);

  try {
    await mkdir(profile);
    const canary = path.join(profile, "recreated.txt");
    await writeFile(canary, "new unrelated directory");
    await assert.rejects(removeTempProfile(profile), /reappeared after cleanup/);
    assert.equal(await readFile(canary, "utf8"), "new unrelated directory");
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
});

test("createTempProfile accepts only approved leaf prefixes", async () => {
  await assert.rejects(createTempProfile("../cowork-smoke-runtime-escape-"), /single leaf name/);
  await assert.rejects(createTempProfile("nested/cowork-smoke-runtime-escape-"), /single leaf name/);
  await assert.rejects(createTempProfile("nested\\cowork-smoke-runtime-escape-"), /single leaf name/);
});

test("removeTempProfile refuses unowned and nested temporary paths without deleting canaries", async () => {
  const ownedProfile = await createTempProfile("cowork-smoke-runtime-nested-");
  // This fixture deliberately uses an allowed prefix but bypasses the creator,
  // so the helper must still reject it as unowned.
  const unownedRoot = await mkdtemp(path.join(tmpdir(), "cowork-smoke-runtime-nested-"));
  const sourceLikeDirectory = path.join(unownedRoot, "scripts");
  const nestedOwnedDirectory = path.join(ownedProfile, "nested");
  await mkdir(sourceLikeDirectory);
  await mkdir(nestedOwnedDirectory);
  const unownedCanary = path.join(unownedRoot, "canary.txt");
  const sourceLikeCanary = path.join(sourceLikeDirectory, "canary.txt");
  const nestedCanary = path.join(nestedOwnedDirectory, "canary.txt");
  await writeFile(unownedCanary, "unowned fixture");
  await writeFile(sourceLikeCanary, "source-like fixture");
  await writeFile(nestedCanary, "nested fixture");

  try {
    await assert.rejects(removeTempProfile(tmpdir()), /Refusing to remove/);
    await assert.rejects(removeTempProfile(unownedRoot), /Refusing to remove/);
    await assert.rejects(removeTempProfile(sourceLikeDirectory), /Refusing to remove/);
    await assert.rejects(removeTempProfile(nestedOwnedDirectory), /Refusing to remove/);
    assert.equal(await readFile(unownedCanary, "utf8"), "unowned fixture");
    assert.equal(await readFile(sourceLikeCanary, "utf8"), "source-like fixture");
    assert.equal(await readFile(nestedCanary, "utf8"), "nested fixture");
  } finally {
    await removeTempProfile(ownedProfile);
    await rm(unownedRoot, { recursive: true, force: true });
  }
});

test("removeTempProfile rejects a symlink or reparse replacement without deleting either target", async () => {
  const profile = await createTempProfile("cowork-smoke-runtime-replaced-");
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), "cowork-smoke-runtime-link-fixture-"));
  const relocatedProfile = path.join(fixtureRoot, "original-profile");
  const replacementTarget = path.join(fixtureRoot, "replacement-target");
  await mkdir(replacementTarget);
  await writeFile(path.join(profile, "profile-canary.txt"), "owned original");
  await writeFile(path.join(replacementTarget, "target-canary.txt"), "unowned target");

  let originalMoved = false;
  let replacementLinked = false;
  try {
    await rename(profile, relocatedProfile);
    originalMoved = true;
    await symlink(replacementTarget, profile, process.platform === "win32" ? "junction" : "dir");
    replacementLinked = true;

    await assert.rejects(removeTempProfile(profile), /Refusing to remove/);
    assert.equal(await readFile(path.join(relocatedProfile, "profile-canary.txt"), "utf8"), "owned original");
    assert.equal(await readFile(path.join(replacementTarget, "target-canary.txt"), "utf8"), "unowned target");
  } finally {
    if (replacementLinked) await rm(profile, { recursive: true, force: true });
    if (originalMoved) await rm(relocatedProfile, { recursive: true, force: true });
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("removeTempProfile refuses an ordinary directory replacement while ownership is active", async () => {
  const profile = await createTempProfile("cowork-smoke-runtime-replaced-");
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), "cowork-smoke-runtime-replacement-fixture-"));
  const relocatedProfile = path.join(fixtureRoot, "original-profile");
  const originalCanary = path.join(relocatedProfile, "original-canary.txt");
  const replacementCanary = path.join(profile, "replacement-canary.txt");
  await writeFile(path.join(profile, "original-canary.txt"), "owned original");

  let originalMoved = false;
  let replacementCreated = false;
  try {
    await rename(profile, relocatedProfile);
    originalMoved = true;
    await mkdir(profile);
    replacementCreated = true;
    await writeFile(replacementCanary, "unowned replacement");

    await assert.rejects(removeTempProfile(profile), /replaced, linked, or non-directory/);
    assert.equal(await readFile(originalCanary, "utf8"), "owned original");
    assert.equal(await readFile(replacementCanary, "utf8"), "unowned replacement");
  } finally {
    if (replacementCreated) await rm(profile, { recursive: true, force: true });
    if (originalMoved) await rm(relocatedProfile, { recursive: true, force: true });
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("installedChromeForTesting picks the newest cached version and null without a cache", async () => {
  const root = await createTempProfile("cowork-smoke-runtime-cft-");
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
