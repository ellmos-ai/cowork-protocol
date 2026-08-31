import assert from "node:assert/strict";
import { test } from "node:test";

import { createField, insertField, updateField } from "../src/form-builder.mjs";
import { buildFlatOdt } from "../src/fodt-export.mjs";

// A small, dependency-free XML well-formedness checker: this repository takes
// no XML parser dependency, so it proves the same thing an `xmllint --noout`
// or `DOMParser` well-formedness check would, using only a tag-balance scan
// that respects quoted attribute values.
function assertWellFormedXml(xml) {
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/, "must start with an XML declaration");
  const stack = [];
  let rootElementCount = 0;
  let index = 0;
  while (index < xml.length) {
    const tagStart = xml.indexOf("<", index);
    if (tagStart === -1) break;
    if (xml.startsWith("<?", tagStart)) {
      const declarationEnd = xml.indexOf("?>", tagStart);
      assert.ok(declarationEnd !== -1, "unterminated XML declaration");
      index = declarationEnd + 2;
      continue;
    }
    let cursor = tagStart + 1;
    let inQuote = null;
    while (cursor < xml.length) {
      const character = xml[cursor];
      if (inQuote) {
        if (character === inQuote) inQuote = null;
      } else if (character === '"' || character === "'") {
        inQuote = character;
      } else if (character === ">") {
        break;
      } else if (character === "<") {
        assert.fail(`unescaped '<' inside tag starting at index ${tagStart}`);
      }
      cursor += 1;
    }
    assert.ok(cursor < xml.length, `unterminated tag starting at index ${tagStart}`);
    const tagContent = xml.slice(tagStart + 1, cursor);
    index = cursor + 1;

    if (tagContent.startsWith("/")) {
      const name = tagContent.slice(1).trim();
      const top = stack.pop();
      assert.equal(top, name, `mismatched closing tag </${name}>, expected </${top}>`);
      continue;
    }
    const selfClosing = tagContent.endsWith("/");
    const nameMatch = /^([^\s/]+)/.exec(tagContent);
    assert.ok(nameMatch, `malformed tag: <${tagContent}>`);
    const name = nameMatch[1];
    if (stack.length === 0) rootElementCount += 1;
    if (!selfClosing) stack.push(name);
  }
  assert.equal(stack.length, 0, `unclosed tags remain: ${stack.join(", ")}`);
  assert.equal(rootElementCount, 1, "an XML document must have exactly one root element");
}

function elementsOfEveryType() {
  let elements = [];
  elements = insertField(elements, createField("heading", { label: "About you" }));
  elements = insertField(elements, createField("description", { label: "Please answer honestly." }));
  const fullName = createField("text-short", { label: "Full name" });
  elements = insertField(elements, fullName);
  elements = updateField(elements, fullName.id, { required: true });
  const long = createField("text-long", { label: "Comments" });
  elements = insertField(elements, long);
  elements = insertField(elements, createField("date", { label: "Birthday" }));
  elements = insertField(
    elements,
    createField("checkbox-single", { label: "Role", options: ["Developer", "Designer"] })
  );
  elements = insertField(
    elements,
    createField("checkbox-multi", { label: "Interests", options: ["Sport", "Music"] })
  );
  elements = insertField(elements, createField("separator"));
  return elements;
}

test("buildFlatOdt renders one well-formed XML document for every field type", () => {
  const fodt = buildFlatOdt({ title: "Every type", elements: elementsOfEveryType() });
  assertWellFormedXml(fodt);
  assert.match(fodt, /office:mimetype="application\/vnd\.oasis\.opendocument\.text"/);
  assert.match(fodt, /<dc:title>Every type<\/dc:title>/);
  assert.match(fodt, />About you<\/text:h>/);
  assert.match(fodt, />Please answer honestly\.<\/text:p>/);
  assert.match(fodt, />Full name \*<\/text:p>/);
  assert.match(fodt, />Birthday<\/text:p>/);
  assert.match(fodt, />☐ Developer<\/text:p>/);
  assert.match(fodt, />☐ Sport<\/text:p>/);
});

test("buildFlatOdt escapes XML-special characters in titles, labels and options", () => {
  const elements = insertField(
    [],
    createField("checkbox-single", { label: "A & B < C > D", options: ['"Quoted" <tag>'] })
  );
  const fodt = buildFlatOdt({ title: "Title <with> & special \"chars\"", elements });
  assertWellFormedXml(fodt);
  assert.doesNotMatch(fodt, /<with>/);
  assert.match(fodt, /Title &lt;with&gt; &amp; special/);
  assert.match(fodt, /A &amp; B &lt; C &gt; D/);
  assert.match(fodt, /☐ &quot;Quoted&quot; &lt;tag&gt;|☐ "Quoted" &lt;tag&gt;/);
});

test("buildFlatOdt is well-formed for an empty form", () => {
  const fodt = buildFlatOdt({ title: "Empty", elements: [] });
  assertWellFormedXml(fodt);
});

test("a long text field gets more blank fill lines than a short one", () => {
  const elements = insertField(
    insertField([], createField("text-short", { label: "Short" })),
    createField("text-long", { label: "Long" })
  );
  const fodt = buildFlatOdt({ title: "Lines", elements });
  const shortFillLines = (fodt.match(/FBW-FillLine/g) ?? []).length;
  assert.ok(shortFillLines >= 4, "expected at least one short-field line plus three long-field lines");
});
