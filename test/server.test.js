import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createStaticServer } from "../scripts/serve.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("the local server delivers the showcase and browser modules from one origin", async (context) => {
  const server = createStaticServer({ root: repositoryRoot });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));

  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const page = await fetch(`${base}/apps/formbuilder-showcase/`);
  const core = await fetch(`${base}/packages/core/src/index.js`);

  assert.equal(page.status, 200);
  assert.match(await page.text(), /Cowork Protocol — FormBuilder Showcase/);
  assert.equal(page.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(core.status, 200);
  assert.equal(core.headers.get("content-type"), "text/javascript; charset=utf-8");
});
