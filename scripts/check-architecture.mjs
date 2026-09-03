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
assert.match(svg, /Interchangeable UI/);
assert.match(svg, /Session Authority/);
assert.match(svg, /Context \+ gateway/);
assert.match(svg, /ONE ACTIVE SEAT/);
assert.match(svg, /PROTOCOL CORE · STRONGEST AVAILABLE CONNECTOR/);
assert.match(svg, /Source-backed component view/);
assert.match(svg, /Browser relay \+ Side Panel/);
assert.match(svg, /350 → 1,200 → 400×400 relay lens/);
assert.match(svg, /Desktop: profiled Open Compute · red signal/);
assert.match(svg, /semantic first · bounded visual escalation/);
assert.match(svg, /visible offer → human click → observed verification/);
assert.match(svg, /WORK MODE MATRIX/);
assert.match(svg, /Present\? · Working on\? · Role\?/);
assert.match(svg, /Sparring · Doubling · solo work/);
assert.match(svg, /model executes only inside a grant or lease/);
assert.match(svg, /Cowork tools registered over WebMCP/);
assert.match(svg, /One protocol · one human surface · three hosts/);
assert.match(svg, /demo · direct · none/);
assert.match(svg, /page host · companion/);

assert.match(docs, /!\[Cowork Protocol architecture overview\]\(\.\.\/design\/architecture-overview\.svg\)/);
assert.match(
  docs,
  /The Mermaid views below remain the source-backed\s+engineering detail and text alternatives\./
);
assert.match(readme, /\[!\[Cowork Protocol architecture:[^\]]+\]\(design\/architecture-overview\.png\)\]\(docs\/architecture\.md\)/);

assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
assert.equal(png.readUInt32BE(16), 1800);
assert.equal(png.readUInt32BE(20), 1050);

console.log(
  JSON.stringify(
    {
      architectureArtifactClaim: true,
      supportedConnectorPaths: [
        "native-cowork",
        "existing-webmcp",
        "no-webmcp-relay",
        "profiled-open-compute"
      ],
      providerNeutralSurfaceClaim: true,
      workModeMatrix: true,
      accessibleSvg: true,
      documented: true,
      png: { width: 1800, height: 1050 }
    },
    null,
    2
  )
);
