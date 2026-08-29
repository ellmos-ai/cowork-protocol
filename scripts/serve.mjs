import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

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

export function createStaticServer({ root }) {
  const absoluteRoot = path.resolve(root);
  return createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://localhost");
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
