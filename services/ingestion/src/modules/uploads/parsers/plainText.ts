import type { ParsedDocument, ParsedSection } from "./types.js";

/**
 * Story 2.9 (FR-C-9), AC #1. TXT/MD have no encrypted/corrupt failure mode to detect
 * (there's no container format to be corrupt) — this function never throws.
 *
 * Markdown's `#`-prefixed lines are a REAL, reliable heading signal (the format's own
 * explicit syntax, same reliability tier as DOCX's) — not a heuristic. Plain TXT has NO
 * structural signal available at all, and this deliberately does not invent a fake one
 * (e.g. "ALL CAPS lines are headings"): the whole file becomes one sectionless block.
 * Documented honestly as "there is no structure to detect," not "poor quality
 * detection" — matching this story's own discipline of never quietly claiming more
 * sophistication than a given format's approach actually has.
 */
export function parsePlainText(buffer: Buffer, format: "txt" | "md"): ParsedDocument {
  const content = buffer.toString("utf-8");

  if (format === "txt") {
    return { sections: [{ heading: null, text: content.trim(), pageRangeStart: null, pageRangeEnd: null }] };
  }

  const lines = content.split(/\r?\n/);
  const sections: ParsedSection[] = [];
  let currentHeading: string | null = null;
  let currentLines: string[] = [];

  function flush(): void {
    const text = currentLines.join("\n").trim();
    if (currentHeading !== null || text.length > 0) {
      sections.push({ heading: currentHeading, text, pageRangeStart: null, pageRangeEnd: null });
    }
  }

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
    if (headingMatch) {
      flush();
      currentHeading = (headingMatch[1] ?? "").trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  flush();

  return { sections };
}
