import mammoth from "mammoth";
import { CorruptDocumentError, type ParsedDocument, type ParsedSection } from "./types.js";

/**
 * Story 2.9 (FR-C-9), AC #1. Unlike PDF's font-size heuristic, DOCX headings are a
 * REAL signal — `convertToHtml` (not `extractRawText`) preserves the source
 * document's own paragraph styles as `<h1>`-`<h6>` tags, so splitting on them is exact,
 * not approximated. DOCX has no page concept reachable from Mammoth's own API, so
 * `pageRangeStart`/`pageRangeEnd` stay null for every section — section identity is
 * carried by `heading` alone.
 *
 * DOCX has no password-protection concept reachable via Mammoth's own API — a real
 * encrypted `.docx` (rare; Office wraps the zip in a CFB/OLE container) surfaces as a
 * corrupt-zip error to Mammoth, which this codebase does not attempt to distinguish
 * from a genuinely corrupt file (an accepted, documented limitation — see Dev Notes).
 */
export async function parseDocx(buffer: Buffer): Promise<ParsedDocument> {
  let html: string;
  try {
    const result = await mammoth.convertToHtml({ buffer });
    html = result.value;
  } catch (error) {
    throw new CorruptDocumentError(error instanceof Error ? error.message : "invalid DOCX structure");
  }

  const sections: ParsedSection[] = [];
  const headingSplit = html.split(/(<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>)/gi);
  let currentHeading: string | null = null;
  let currentText = "";

  function flush(): void {
    const text = stripTags(currentText).trim();
    if (currentHeading !== null || text.length > 0) {
      sections.push({ heading: currentHeading, text, pageRangeStart: null, pageRangeEnd: null });
    }
  }

  for (const part of headingSplit) {
    const headingMatch = part.match(/^<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>$/i);
    if (headingMatch) {
      flush();
      currentHeading = stripTags(headingMatch[1] ?? "").trim();
      currentText = "";
    } else {
      currentText += part;
    }
  }
  flush();

  return { sections };
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
