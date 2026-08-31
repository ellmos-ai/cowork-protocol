import { readFile } from "node:fs/promises";

import { createCompanionSessionHost } from "./host.js";
import { createCompanionCliConfig } from "./cli-config.js";
import { launchCompanionWindow } from "./window-launcher.js";
import { launchCompanionTray } from "./tray-launcher.js";
import { createOpenAiCompatibleGatewaySender } from "../../../packages/model-transport/src/openai-compatible.js";
import { createOpenComputeAdapter } from "../../../packages/open-compute-adapter/src/index.js";
import { createMcpStdioClient } from "../../../packages/open-compute-adapter/src/mcp-stdio-client.js";

const config = createCompanionCliConfig();
const sendModelTurn = config.model === null
  ? null
  : createOpenAiCompatibleGatewaySender(config.model);
const computerUse = config.computerUse === null
  ? null
  : createOpenComputeAdapter({
      client: createMcpStdioClient({
        command: config.computerUse.command,
        args: config.computerUse.args,
        env: config.computerUse.env
      }),
      profile: JSON.parse(await readFile(config.computerUse.profilePath, "utf8"))
    });
const host = createCompanionSessionHost({
  allowedOrigins: config.allowedOrigins,
  sessionStorePath: config.sessionStorePath,
  sendModelTurn,
  modelProviderId: config.model?.model ?? "preferred-model",
  computerUse
});
const address = await host.listen();
const uiUrl = `http://${address.hostname}:${address.port}/cowork/v1/ui`;
console.log(
  `Cowork Companion session host listening on http://${address.hostname}:${address.port}/cowork/v1`
);
console.log(`Cowork Companion surface: ${uiUrl}`);
if (config.openWindow) {
  const windowResult = await launchCompanionWindow({ url: uiUrl });
  if (!windowResult.launched) {
    console.log("Companion app window was not opened; use the surface URL above.");
  }
}
if (config.tray) {
  const trayResult = launchCompanionTray({ uiUrl });
  if (!trayResult.launched && process.platform === "win32") {
    console.log("Companion tray icon was not started.");
  }
}

async function close() {
  await host.close();
  process.exit(0);
}

process.once("SIGINT", close);
process.once("SIGTERM", close);
