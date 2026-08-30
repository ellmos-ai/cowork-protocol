import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  ConversationProtocolError,
  normalizeConversationReply,
  normalizeConversationTurn
} from "../packages/conversation/src/index.js";

const CONTENT_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".svg", "image/svg+xml"]
]);

function resolveInsideRoot(root, pathname) {
  const relative = decodeURIComponent(pathname).replace(/^[/\\]+/, "");
  const resolved = path.resolve(root, relative);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) return null;
  return resolved;
}

function writeJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  }).end(body);
}

async function readJsonBody(request, maximumBytes = 4096) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > maximumBytes) {
      const error = new Error("Request body is too large");
      error.code = "REQUEST_TOO_LARGE";
      throw error;
    }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function handleModelRequest(request, response, requestUrl, modelTurnHandler) {
  if (requestUrl.pathname === "/__cowork/model/status") {
    if (request.method !== "GET") {
      writeJson(response, 405, { code: "METHOD_NOT_ALLOWED" });
      return true;
    }
    writeJson(response, 200, {
      protocolVersion: "0.1",
      available: typeof modelTurnHandler === "function",
      transport: "same-origin-model-host"
    });
    return true;
  }
  if (requestUrl.pathname !== "/__cowork/model/turn") return false;
  if (request.method !== "POST") {
    writeJson(response, 405, { code: "METHOD_NOT_ALLOWED" });
    return true;
  }
  if (typeof modelTurnHandler !== "function") {
    writeJson(response, 503, {
      code: "MODEL_HOST_UNAVAILABLE",
      message: "No preferred model host is configured"
    });
    return true;
  }
  if (!(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
    writeJson(response, 415, { code: "JSON_REQUIRED" });
    return true;
  }

  let envelope;
  try {
    envelope = await readJsonBody(request);
  } catch (error) {
    writeJson(response, error.code === "REQUEST_TOO_LARGE" ? 413 : 400, {
      code: error.code === "REQUEST_TOO_LARGE" ? error.code : "INVALID_JSON"
    });
    return true;
  }
  if (
    !envelope ||
    typeof envelope !== "object" ||
    Array.isArray(envelope) ||
    Object.keys(envelope).length !== 2 ||
    envelope.protocolVersion !== "0.1" ||
    !Object.hasOwn(envelope, "turn")
  ) {
    writeJson(response, 400, { code: "INVALID_CONVERSATION_TURN" });
    return true;
  }

  let turn;
  try {
    turn = normalizeConversationTurn(envelope.turn);
  } catch (error) {
    writeJson(response, 400, {
      code:
        error instanceof ConversationProtocolError
          ? error.code
          : "INVALID_CONVERSATION_TURN"
    });
    return true;
  }
  try {
    const reply = normalizeConversationReply(
      await modelTurnHandler(turn, {
        requestKeys: Object.keys(envelope).sort(),
        authorizationHeaderPresent: typeof request.headers.authorization === "string"
      })
    );
    writeJson(response, 200, { protocolVersion: "0.1", reply });
  } catch {
    writeJson(response, 502, {
      code: "MODEL_HOST_FAILED",
      message: "Preferred model host did not return a usable bounded reply"
    });
  }
  return true;
}

export function createStaticServer({ root, modelTurnHandler = null }) {
  const absoluteRoot = path.resolve(root);
  return createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://localhost");
      if (await handleModelRequest(request, response, requestUrl, modelTurnHandler)) return;
      let filePath = resolveInsideRoot(absoluteRoot, requestUrl.pathname);
      if (!filePath) {
        response.writeHead(403).end("Forbidden");
        return;
      }

      const fileStat = await stat(filePath);
      if (fileStat.isDirectory()) filePath = path.join(filePath, "index.html");
      const finalStat = await stat(filePath);
      if (!finalStat.isFile()) throw new Error("Not a file");

      const contentType = CONTENT_TYPES.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream";
      response.writeHead(200, {
        "Content-Type": contentType,
        "Content-Length": finalStat.size,
        "Cache-Control": "no-store"
      });
      createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = path.resolve(process.cwd(), process.argv[3] ?? ".");
  const port = Number(process.env.COWORK_PORT ?? process.argv[2] ?? 4173);
  const server = createStaticServer({ root });
  server.listen(port, "127.0.0.1", () => {
    console.log(`Cowork Protocol site: http://127.0.0.1:${port}/`);
  });
}
