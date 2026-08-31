// New Cowork Protocol challenge work: a dependency-free Flat ODF Text (.fodt)
// writer, built as a plain template string over the OASIS ODF 1.2 Flat XML
// format so it needs no library and opens directly in LibreOffice. No code is
// copied from doc-bricks/FormularErstellen.

import { classificationOf } from "./form-builder.mjs";

function escapeXmlText(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function paragraph(styleName, text) {
  const styleAttribute = styleName ? ` text:style-name="${styleName}"` : "";
  return `<text:p${styleAttribute}>${escapeXmlText(text)}</text:p>`;
}

function heading(level, text) {
  const styleName = level === 1 ? "FBW-H1" : "FBW-H2";
  return `<text:h text:outline-level="${level}" text:style-name="${styleName}">${escapeXmlText(text)}</text:h>`;
}

const BLANK_FILL_LINE = "_".repeat(40);

function renderElement(element) {
  const classification = classificationOf(element);
  const label = element.label ?? "";

  switch (classification) {
    case "heading-h1":
      return [heading(1, label)];
    case "heading-h2":
      return [heading(2, label)];
    case "description":
      return [paragraph("FBW-Description", label)];
    case "separator":
      return [paragraph("FBW-Separator", "—".repeat(20))];
    case "text-short":
    case "text-long":
    case "date": {
      const requiredMark = element.required ? " *" : "";
      const lines = [paragraph("FBW-FieldLabel", `${label}${requiredMark}`)];
      const fillLineCount = classification === "text-long" ? 3 : 1;
      for (let line = 0; line < fillLineCount; line += 1) {
        lines.push(paragraph("FBW-FillLine", BLANK_FILL_LINE));
      }
      return lines;
    }
    case "checkbox-single":
    case "checkbox-multi": {
      const requiredMark = element.required ? " *" : "";
      const lines = [paragraph("FBW-FieldLabel", `${label}${requiredMark}`)];
      const options = Array.isArray(element.options) && element.options.length > 0
        ? element.options
        : [];
      for (const option of options) {
        lines.push(paragraph("FBW-Option", `☐ ${option}`));
      }
      return lines;
    }
    default:
      return [paragraph("FBW-FieldLabel", label)];
  }
}

const AUTOMATIC_STYLES = `
<style:style style:name="FBW-Title" style:family="paragraph">
<style:text-properties fo:font-size="24pt" fo:font-weight="bold"/>
</style:style>
<style:style style:name="FBW-H1" style:family="text">
<style:text-properties fo:font-size="18pt" fo:font-weight="bold"/>
</style:style>
<style:style style:name="FBW-H2" style:family="text">
<style:text-properties fo:font-size="14pt" fo:font-weight="bold"/>
</style:style>
<style:style style:name="FBW-Description" style:family="paragraph">
<style:text-properties fo:font-style="italic"/>
</style:style>
<style:style style:name="FBW-FieldLabel" style:family="paragraph">
<style:paragraph-properties fo:margin-top="0.2cm"/>
<style:text-properties fo:font-weight="bold"/>
</style:style>
<style:style style:name="FBW-FillLine" style:family="paragraph">
<style:paragraph-properties fo:margin-bottom="0.2cm"/>
</style:style>
<style:style style:name="FBW-Option" style:family="paragraph">
<style:paragraph-properties fo:margin-left="0.4cm"/>
</style:style>
<style:style style:name="FBW-Separator" style:family="paragraph">
<style:paragraph-properties fo:margin-top="0.3cm" fo:margin-bottom="0.3cm"/>
</style:style>`.trim();

/** Builds a printable Flat ODF text document (.fodt) as a single, valid XML
 *  string. Dependency-free: no library reads or writes this file format here. */
export function buildFlatOdt({ title, elements }) {
  const body = elements.flatMap((element) => renderElement(element)).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.2" office:mimetype="application/vnd.oasis.opendocument.text">
<office:meta><dc:title>${escapeXmlText(title)}</dc:title><dc:creator>FormBuilder Web</dc:creator></office:meta>
<office:automatic-styles>
${AUTOMATIC_STYLES}
</office:automatic-styles>
<office:body>
<office:text>
${paragraph("FBW-Title", title)}
${body}
</office:text>
</office:body>
</office:document>
`;
}
