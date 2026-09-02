// Shared runtime helpers for the browser smokes: locating a browser that can
// load an unpacked extension, and removing the temporary browser profile.
import { access, readdir, rm } from "node:fs/promises";
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

/**
 * Removes a temporary browser profile after the browser was stopped. On
 * Windows, Chrome's crashpad handler and SQLite journals can hold files for a
 * moment after the main process exited; a leftover profile is reported, not
 * turned into a failed smoke whose verdict was already emitted.
 */
export async function removeTempProfile(profilePath) {
  const resolved = path.resolve(profilePath);
  if (!resolved.startsWith(path.resolve(tmpdir()) + path.sep)) {
    throw new Error(`Refusing to remove a profile outside the temp directory: ${resolved}`);
  }
  try {
    // ponytail: ~5 s of retries covers the observed handle lag; if it ever does not, warn instead of failing.
    await rm(resolved, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  } catch (error) {
    process.stderr.write(
      `warning: temporary browser profile not removed (${error.code ?? error.message}): ${resolved}\n`
    );
  }
}
