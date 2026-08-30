import path from "node:path";

import { createOpenAiCompatibleTurnSender } from "../packages/model-transport/src/openai-compatible.js";
import { createStaticServer } from "./serve.mjs";

const endpoint = process.env.COWORK_MODEL_ENDPOINT;
const model = process.env.COWORK_MODEL_ID;

if (!endpoint || !model) {
  console.error(
    "Set COWORK_MODEL_ENDPOINT and COWORK_MODEL_ID before starting the preferred model host."
  );
  process.exitCode = 1;
} else {
  const port = Number(process.env.COWORK_PORT ?? 4173);
  const modelTurnHandler = createOpenAiCompatibleTurnSender({
    endpoint,
    model,
    apiKey: process.env.COWORK_MODEL_API_KEY ?? ""
  });
  const server = createStaticServer({
    root: path.resolve(process.cwd()),
    modelTurnHandler
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`Cowork Protocol with preferred model: http://127.0.0.1:${port}/`);
    console.log("Model credentials stay in the server process and are never sent to the browser.");
  });
}
