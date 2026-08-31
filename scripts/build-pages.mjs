import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PUBLIC_FILES = [
  "LICENSE",
  "index.html",
  "apps/formbuilder-showcase/FORMBUILDER-NOTICE.md",
  "apps/formbuilder-showcase/index.html",
  "apps/formbuilder-showcase/styles.css",
  "apps/formbuilder-showcase/src/app.js",
  "apps/formbuilder-showcase/src/builder-cowork.js",
  "apps/formbuilder-showcase/src/builder-cowork-ui.js",
  "apps/formbuilder-showcase/src/builder-view.js",
  "apps/formbuilder-showcase/src/fodt-export.mjs",
  "apps/formbuilder-showcase/src/form-builder.mjs",
  "apps/formbuilder-showcase/src/form-engine.mjs",
  "apps/formbuilder-showcase/src/formbuilder-use-case.js",
  "apps/formbuilder-showcase/src/interaction-log.js",
  "apps/formbuilder-showcase/src/local-conversation.js",
  "apps/formbuilder-showcase/src/session.js",
  "apps/formbuilder-showcase/src/speech-controller.js",
  "apps/formbuilder-showcase/src/view-model.js",
  "packages/core/src/index.js",
  "packages/conversation/src/index.js",
  "packages/formbuilder-connector/src/index.js",
  "packages/integration-contract/src/index.js",
  "packages/model-transport/src/browser.js",
  "packages/native-webmcp/src/index.js",
  "packages/reference-ui/src/index.js",
  "packages/reference-ui/assets/cowork-dialogue-mark.svg",
  "packages/session-authority/src/index.js"
];

export async function buildPages({ sourceRoot, outputRoot }) {
  const absoluteSource = path.resolve(sourceRoot);
  const absoluteOutput = path.resolve(outputRoot);
  if (path.basename(absoluteOutput).toLowerCase() !== "dist") {
    throw new Error(`Refusing to replace a non-dist output: ${absoluteOutput}`);
  }
  if (absoluteOutput === absoluteSource) {
    throw new Error("Pages output cannot replace the source repository");
  }

  await rm(absoluteOutput, { recursive: true, force: true });
  for (const relativePath of PUBLIC_FILES) {
    const sourcePath = path.resolve(absoluteSource, relativePath);
    if (!sourcePath.startsWith(`${absoluteSource}${path.sep}`)) {
      throw new Error(`Public file escapes the source root: ${relativePath}`);
    }
    const outputPath = path.resolve(absoluteOutput, relativePath);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await copyFile(sourcePath, outputPath);
  }
  await writeFile(path.join(absoluteOutput, ".nojekyll"), "", "utf8");

  return {
    outputRoot: absoluteOutput,
    files: [...PUBLIC_FILES, ".nojekyll"].sort()
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sourceRoot = path.resolve(process.cwd());
  const report = await buildPages({
    sourceRoot,
    outputRoot: path.join(sourceRoot, "dist")
  });
  console.log(`Pages artifact: ${report.files.length} files in ${report.outputRoot}`);
}
