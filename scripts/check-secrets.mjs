import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PATTERNS = [
  {
    kind: "OpenAI-style API key",
    expression: new RegExp(
      `${["s", "k"].join("")}-(?:(?:proj|svcacct)-)?[A-Za-z0-9_-]{20,}`,
      "g"
    )
  },
  {
    kind: "GitHub-style token",
    expression: new RegExp(`${["g", "h"].join("")}[pousr]_[A-Za-z0-9]{30,}`, "g")
  },
  {
    kind: "AWS access key id",
    expression: new RegExp(`${["A", "K", "I", "A"].join("")}[0-9A-Z]{16}`, "g")
  }
];

const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  "coverage",
  "dist",
  "dist-browser-companion",
  "node_modules"
]);
const BINARY_EXTENSIONS = new Set([
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".pdf",
  ".png",
  ".webp",
  ".zip"
]);

export function findPotentialSecrets(text, filePath) {
  const findings = [];
  for (const { kind, expression } of PATTERNS) {
    expression.lastIndex = 0;
    for (const match of text.matchAll(expression)) {
      findings.push({
        path: filePath,
        line: text.slice(0, match.index).split(/\r?\n/).length,
        kind
      });
    }
  }
  return findings;
}

async function filesUnder(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name)) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(entryPath)));
    else if (entry.isFile()) files.push(entryPath);
  }
  return files;
}

export async function scanRepository(root) {
  const absoluteRoot = path.resolve(root);
  const findings = [];
  for (const filePath of await filesUnder(absoluteRoot)) {
    if (BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase())) continue;
    if ((await stat(filePath)).size > 1_000_000) continue;
    let text;
    try {
      text = await readFile(filePath, "utf8");
    } catch {
      continue;
    }
    findings.push(
      ...findPotentialSecrets(text, path.relative(absoluteRoot, filePath).replaceAll("\\", "/"))
    );
  }
  return findings;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = path.resolve(process.argv[2] ?? process.cwd());
  const findings = await scanRepository(root);
  if (findings.length === 0) {
    console.log("Secret scan: PASS (0 high-confidence findings)");
  } else {
    for (const finding of findings) {
      console.error(`${finding.path}:${finding.line} ${finding.kind}`);
    }
    process.exitCode = 1;
  }
}
