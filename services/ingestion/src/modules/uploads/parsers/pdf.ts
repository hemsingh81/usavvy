import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
// The Node-compatible entrypoint — the default (browser) build assumes DOM globals
// (DOMMatrix, Path2D, etc.) that don't exist in this runtime.
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { CorruptDocumentError, EncryptedDocumentError, type ParsedDocument, type ParsedSection } from "./types.js";

// Suppresses pdfjs-dist's own "Ensure that the standardFontDataUrl API parameter is
// provided" warning and lets it correctly resolve glyph metrics for the standard 14
// fonts — the data ships inside the package itself, no network fetch involved.
// `require.resolve` (not a relative path from this file) correctly finds the package
// root regardless of how deep pnpm's own node_modules nesting puts it.
const pdfjsPackageJsonPath = createRequire(import.meta.url).resolve("pdfjs-dist/package.json");
const STANDARD_FONT_DATA_URL = `${pathToFileURL(join(dirname(pdfjsPackageJsonPath), "standard_fonts")).href}/`;

interface TextItemLike {
  str: string;
  transform: number[];
}

/**
 * Story 2.9 (FR-C-9), AC #1/#2/#3/#4. A documented heuristic, not real layout
 * analysis: an item's font size (its transform matrix's horizontal-scale component,
 * `transform[0]`) noticeably larger than the page's own median text-item font size is
 * treated as a heading. Good enough for AC #1's stated bar ("headings and sections are
 * detected to form a structure map"), matching this codebase's established
 * cheap-approximation discipline (Story 2.7's page-count regex, Story 2.8's HTML
 * stripper) — not a claim of real document-layout understanding.
 */
const HEADING_FONT_SIZE_RATIO = 1.4;

function detectHeading(items: TextItemLike[]): string | null {
  const nonEmpty = items.filter((item) => item.str.trim().length > 0);
  if (nonEmpty.length === 0) return null;
  const sizes = nonEmpty.map((item) => item.transform[0] ?? 0).sort((a, b) => a - b);
  const median = sizes[Math.floor(sizes.length / 2)] ?? 0;
  const heading = nonEmpty.find((item) => (item.transform[0] ?? 0) >= median * HEADING_FONT_SIZE_RATIO);
  return heading ? heading.str.trim() : null;
}

export async function parsePdf(buffer: Buffer): Promise<ParsedDocument> {
  let doc;
  try {
    doc = await getDocument({ data: new Uint8Array(buffer), standardFontDataUrl: STANDARD_FONT_DATA_URL }).promise;
  } catch (error) {
    const name = error instanceof Error ? error.name : undefined;
    if (name === "PasswordException") {
      throw new EncryptedDocumentError(error instanceof Error ? error.message : "password required");
    }
    throw new CorruptDocumentError(error instanceof Error ? error.message : "invalid PDF structure");
  }

  const sections: ParsedSection[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    // pdfjs-dist's own item type is `TextItem | TextMarkedContent` — only TextItem
    // carries `str`/`transform`; TextMarkedContent (marked-content markers, not actual
    // text) has neither, so filtering on those keys' presence is a safe narrowing.
    const items = (content.items as unknown as TextItemLike[]).filter(
      (item) => typeof item.str === "string" && Array.isArray(item.transform),
    );
    const text = items
      .map((item) => item.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    sections.push({
      heading: text.length > 0 ? detectHeading(items) : null,
      text,
      pageRangeStart: pageNumber,
      pageRangeEnd: pageNumber,
      needsOcr: text.length === 0,
      pageNumber,
    });
  }

  return { sections };
}
