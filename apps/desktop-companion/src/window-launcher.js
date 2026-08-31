import { spawn } from "node:child_process";
import { access } from "node:fs/promises";

const WINDOWS_APP_RUNTIMES = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
];

function assertLoopbackUrl(value) {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    !new Set(["127.0.0.1", "localhost", "[::1]"]).has(url.hostname)
  ) {
    throw new TypeError("Companion app window URL must use loopback HTTP");
  }
  return url.href;
}

export async function launchCompanionWindow({
  url,
  platform = process.platform,
  accessImpl = access,
  spawnImpl = spawn
}) {
  const appUrl = assertLoopbackUrl(url);
  if (platform !== "win32") {
    return { launched: false, reason: "BROWSER_APP_RUNTIME_NOT_FOUND" };
  }
  let browserPath = null;
  for (const candidate of WINDOWS_APP_RUNTIMES) {
    try {
      await accessImpl(candidate);
      browserPath = candidate;
      break;
    } catch {
      // Try the next explicitly bounded browser app runtime.
    }
  }
  if (browserPath === null) {
    return { launched: false, reason: "BROWSER_APP_RUNTIME_NOT_FOUND" };
  }
  const child = spawnImpl(
    browserPath,
    [`--app=${appUrl.replace(/\/$/, "")}`, "--window-size=430,760"],
    {
      detached: true,
      stdio: "ignore",
      windowsHide: false
    }
  );
  child.unref();
  return { launched: true, browserPath };
}
