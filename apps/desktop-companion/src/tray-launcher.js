import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const TRAY_SCRIPT = fileURLToPath(new URL("../windows/cowork-tray.ps1", import.meta.url));

function assertLoopbackUiUrl(value) {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    !new Set(["127.0.0.1", "localhost", "[::1]"]).has(url.hostname)
  ) {
    throw new TypeError("Companion tray requires a loopback UI URL");
  }
  return url.href.replace(/\/$/, "");
}

export function launchCompanionTray({
  uiUrl,
  platform = process.platform,
  spawnImpl = spawn
}) {
  const normalizedUrl = assertLoopbackUiUrl(uiUrl);
  if (platform !== "win32") return { launched: false, reason: "TRAY_UNAVAILABLE" };
  const child = spawnImpl(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      TRAY_SCRIPT,
      "-UiUrl",
      normalizedUrl
    ],
    {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    }
  );
  child.unref();
  return { launched: true };
}
