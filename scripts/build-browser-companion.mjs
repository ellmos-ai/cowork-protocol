import { copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const EXTENSION_FILES = [
  "apps/browser-companion/content-loader.js",
  "apps/browser-companion/manifest.json",
  "apps/browser-companion/service-worker.js",
  "apps/browser-companion/src/content-runtime.js",
  "apps/browser-companion/src/protocol.js",
  "packages/bridge/src/bounded-result.js",
  "packages/bridge/src/companion.js",
  "packages/bridge/src/index.js",
  "packages/bridge/src/legacy.js",
  "packages/core/src/index.js"
];

function outputPathFor(relativePath) {
  if (relativePath === "apps/browser-companion/manifest.json") return "manifest.json";
  if (relativePath === "apps/browser-companion/content-loader.js") return "content-loader.js";
  if (relativePath === "apps/browser-companion/service-worker.js") return "service-worker.js";
  return `modules/${relativePath}`;
}

export async function buildBrowserCompanion({ sourceRoot, outputRoot }) {
  const absoluteSource = path.resolve(sourceRoot);
  const absoluteOutput = path.resolve(outputRoot);
  if (path.basename(absoluteOutput).toLowerCase() !== "dist-browser-companion") {
    throw new Error(`Refusing to replace a non-dist-browser-companion output: ${absoluteOutput}`);
  }
  if (absoluteOutput === absoluteSource) {
    throw new Error("Browser companion output cannot replace the source repository");
  }

  await rm(absoluteOutput, { recursive: true, force: true });
  const files = [];
  for (const relativePath of EXTENSION_FILES) {
    const sourcePath = path.resolve(absoluteSource, relativePath);
    if (!sourcePath.startsWith(`${absoluteSource}${path.sep}`)) {
      throw new Error(`Extension file escapes the source root: ${relativePath}`);
    }
    const builtPath = outputPathFor(relativePath);
    const destination = path.join(absoluteOutput, builtPath);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(sourcePath, destination);
    files.push(builtPath.replaceAll("\\", "/"));
  }
  return { outputRoot: absoluteOutput, files: files.sort() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sourceRoot = path.resolve(process.cwd());
  const report = await buildBrowserCompanion({
    sourceRoot,
    outputRoot: path.join(sourceRoot, "dist-browser-companion")
  });
  console.log(
    `Browser companion artifact: ${report.files.length} files in ${report.outputRoot}`
  );
}
