// Shared runtime helpers for the browser smokes: locating a browser that can
// load an unpacked extension, and removing the temporary browser profile.
import { access, lstat, mkdtemp, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Optional local cache of Chrome for Testing, laid out by
// `npx @puppeteer/browsers install chrome@<version> --path <root-parent>`:
// <root>/<version>/chrome-win64/chrome.exe.
export const CHROME_FOR_TESTING_ROOT = "C:\\_Local_DEV\\tools\\chrome-for-testing\\chrome";

const BRANDED_BROWSER_PATHS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable"
];

export async function firstExisting(paths) {
  for (const candidate of paths) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next explicit browser path.
    }
  }
  return null;
}

/** Newest locally cached Chrome for Testing, or null when the cache is absent. */
export async function installedChromeForTesting(root = CHROME_FOR_TESTING_ROOT) {
  if (process.platform !== "win32") return null;
  let versions;
  try {
    versions = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
  } catch {
    return null;
  }
  return firstExisting(versions.map((version) => path.join(root, version, "chrome-win64", "chrome.exe")));
}

/**
 * The extension smokes need a browser that still honors `--load-extension`.
 * Branded Chrome ignores that switch since Chrome 137, so a cached Chrome for
 * Testing wins over the installed browsers; an explicit path always wins.
 */
export async function resolveExtensionBrowserPath() {
  const configured = process.env.COWORK_COMPANION_BROWSER_PATH ?? process.env.COWORK_CHROME_PATH;
  if (configured) {
    await access(configured);
    return configured;
  }
  const candidate = (await installedChromeForTesting()) ?? (await firstExisting(BRANDED_BROWSER_PATHS));
  if (!candidate) throw new Error("Chrome was not found; set COWORK_CHROME_PATH");
  return candidate;
}

const TEMP_PROFILE_PREFIXES = new Set([
  "cowork-accessibility-smoke-",
  "cowork-cockpit-smoke-",
  "cowork-companion-mcp-smoke-",
  "cowork-companion-smoke-",
  "cowork-contrast-smoke-",
  "cowork-formbuilder-smoke-",
  "cowork-model-host-smoke-",
  "cowork-native-companion-",
  "cowork-session-surface-smoke-",
  "cowork-smoke-runtime-cft-",
  "cowork-smoke-runtime-nested-",
  "cowork-smoke-runtime-replaced-",
  "cowork-smoke-runtime-test-",
  "cowork-webmcp-companion-",
  "cowork-webmcp-smoke-"
]);
const OWNED_TEMP_PROFILES = new Map();
const RETIRED_TEMP_PROFILES = new Set();

function profilePathKey(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isDirectChild(parentPath, childPath) {
  const relative = path.relative(parentPath, childPath);
  return Boolean(relative)
    && relative !== ".."
    && !relative.startsWith(".." + path.sep)
    && !path.isAbsolute(relative)
    && !relative.includes(path.sep);
}

/**
 * Creates and records a private directory for one browser smoke. Prefixes are
 * explicit leaf names so caller input cannot make mkdtemp escape os.tmpdir().
 */
export async function createTempProfile(prefix) {
  if (
    typeof prefix !== "string"
    || !TEMP_PROFILE_PREFIXES.has(prefix)
    || path.basename(prefix) !== prefix
    || path.isAbsolute(prefix)
    || prefix.includes("/")
    || prefix.includes("\\")
    || prefix.includes("..")
  ) {
    throw new Error("Temporary profile prefix must be an approved single leaf name");
  }

  const tempRoot = path.resolve(tmpdir());
  const realTempRoot = await realpath(tempRoot);
  const createdPath = await mkdtemp(path.join(tempRoot, prefix));
  const resolved = path.resolve(createdPath);
  if (!isDirectChild(tempRoot, resolved)) {
    throw new Error("Created profile is not a direct child of the temporary directory");
  }

  const initialStat = await lstat(resolved);
  if (!initialStat.isDirectory() || initialStat.isSymbolicLink()) {
    throw new Error("Created profile is not a regular directory");
  }
  const realProfilePath = await realpath(resolved);
  const realParentPath = await realpath(path.dirname(resolved));
  if (
    profilePathKey(realParentPath) !== profilePathKey(realTempRoot)
    || !isDirectChild(realTempRoot, realProfilePath)
  ) {
    throw new Error("Created profile resolved outside the temporary directory");
  }

  OWNED_TEMP_PROFILES.set(profilePathKey(resolved), {
    realParentPath,
    realProfilePath,
    dev: initialStat.dev,
    ino: initialStat.ino
  });
  return resolved;
}

/**
 * Removes only an exact profile created by createTempProfile in this process
 * after its browser was stopped. On Windows, Chrome's crashpad handler and
 * SQLite journals can hold files for a moment after the main process exits;
 * a leftover profile is reported, not turned into a failed smoke.
 *
 * A replaced path, symlink/junction, nested child, or unrelated temp directory
 * is rejected before recursive removal. Successfully removed paths are
 * idempotent, but a path that later reappears is never removed again.
 */
export async function removeTempProfile(profilePath) {
  const resolved = path.resolve(profilePath);
  const tempRoot = path.resolve(tmpdir());
  if (!isDirectChild(tempRoot, resolved)) {
    throw new Error("Refusing to remove anything except a direct owned temporary profile");
  }

  const key = profilePathKey(resolved);
  const ownership = OWNED_TEMP_PROFILES.get(key);
  if (!ownership) {
    throw new Error("Refusing to remove a profile not created by createTempProfile in this process");
  }

  if (RETIRED_TEMP_PROFILES.has(key)) {
    try {
      await lstat(resolved);
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    throw new Error("Refusing to remove a profile path that reappeared after cleanup");
  }

  let currentStat;
  try {
    currentStat = await lstat(resolved);
  } catch (error) {
    if (error.code === "ENOENT") {
      RETIRED_TEMP_PROFILES.add(key);
      return;
    }
    throw error;
  }
  if (
    !currentStat.isDirectory()
    || currentStat.isSymbolicLink()
    || currentStat.dev !== ownership.dev
    || currentStat.ino !== ownership.ino
  ) {
    throw new Error("Refusing to remove a replaced, linked, or non-directory profile");
  }

  const realTempRoot = await realpath(tempRoot);
  const realParentPath = await realpath(path.dirname(resolved));
  const realProfilePath = await realpath(resolved);
  if (
    profilePathKey(realTempRoot) !== profilePathKey(ownership.realParentPath)
    || profilePathKey(realParentPath) !== profilePathKey(ownership.realParentPath)
    || profilePathKey(realProfilePath) !== profilePathKey(ownership.realProfilePath)
    || !isDirectChild(realTempRoot, realProfilePath)
  ) {
    throw new Error("Refusing to remove a profile whose real path changed");
  }

  // Recheck the leaf immediately before rm so a symlink/reparse replacement
  // or changed directory identity is rejected before recursive deletion.
  const finalStat = await lstat(resolved);
  const finalRealPath = await realpath(resolved);
  if (
    !finalStat.isDirectory()
    || finalStat.isSymbolicLink()
    || finalStat.dev !== ownership.dev
    || finalStat.ino !== ownership.ino
    || profilePathKey(finalRealPath) !== profilePathKey(ownership.realProfilePath)
  ) {
    throw new Error("Refusing to remove a profile replaced before cleanup");
  }

  try {
    // ponytail: ~5 s of retries covers the observed handle lag; if it ever does not, warn instead of failing.
    await rm(resolved, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  } catch (error) {
    process.stderr.write(
      "warning: temporary browser profile not removed (" + (error.code ?? error.message) + "): " + resolved + "\n"
    );
    return;
  }

  try {
    await lstat(resolved);
  } catch (error) {
    if (error.code === "ENOENT") {
      RETIRED_TEMP_PROFILES.add(key);
      return;
    }
    throw error;
  }
  process.stderr.write("warning: temporary browser profile still exists after cleanup: " + resolved + "\n");
}
