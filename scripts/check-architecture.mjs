import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const architectureSvgUrl = new URL("../design/architecture-overview.svg", import.meta.url);
const architecturePngUrl = new URL("../design/architecture-overview.png", import.meta.url);
const architectureDocsUrl = new URL("../docs/architecture.md", import.meta.url);
const readmeUrl = new URL("../README.md", import.meta.url);

const [svg, png, docs, readme] = await Promise.all([
  readFile(architectureSvgUrl, "utf8"),
  readFile(architecturePngUrl),
  readFile(architectureDocsUrl, "utf8"),
  readFile(readmeUrl, "utf8")
]);

assert.match(svg, /role="img" aria-labelledby="title description"/);
assert.match(svg, /<title id="title">Cowork Protocol architecture overview<\/title>/);
assert.match(svg, /<desc id="description">[^<]{120,}<\/desc>/);
assert.match(svg, /1 · Native Cowork/);
assert.match(svg, /2 · Existing WebMCP/);
assert.match(svg, /3 · No WebMCP/);
assert.match(svg, /Browser Companion/);
assert.match(svg, /350 → 1,200 → 400×400 one-shot · trusted click/);
assert.match(svg, /visible offer → human click → observed verification/);

assert.match(docs, /!\[Cowork Protocol architecture overview\]\(\.\.\/design\/architecture-overview\.svg\)/);
assert.match(docs, /The Mermaid views below remain the source-backed engineering detail and text alternatives\./);
assert.match(readme, /\[!\[Cowork Protocol architecture:[^\]]+\]\(design\/architecture-overview\.png\)\]\(docs\/architecture\.md\)/);

assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
assert.equal(png.readUInt32BE(16), 1800);
assert.equal(png.readUInt32BE(20), 1050);

console.log(
  JSON.stringify(
    {
      architectureArtifactClaim: true,
      supportedConnectorPaths: ["native-cowork", "existing-webmcp", "no-webmcp-companion"],
      accessibleSvg: true,
      documented: true,
      png: { width: 1800, height: 1050 }
    },
    null,
    2
  )
);
