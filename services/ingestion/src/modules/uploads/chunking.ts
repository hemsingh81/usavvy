import type { ParsedSection } from "./parsers/types.js";

// Story 2.9 (FR-C-9), AC #1. "The system has the raw material it needs to propose a
// course outline" is this story's own stated bar — a bounded, readable, source-linked
// chunk. Semantic/embedding-based chunking is Story 2.12's actual job; building it
// here would mean doing that story's work early and worse (without the embeddings
// Story 2.12 introduces, "semantic" chunking here would just be another heuristic
// pretending to be smarter than it is). This is a simple, documented,
// paragraph-boundary-respecting fixed-size chunker, honest about being exactly that.
export const MAX_CHUNK_CHARS = 1500;

export interface Chunk {
  heading: string | null;
  text: string;
  pageRangeStart: number | null;
  pageRangeEnd: number | null;
}

export function chunkSections(sections: ParsedSection[]): Chunk[] {
  const chunks: Chunk[] = [];

  for (const section of sections) {
    if (!section.text.trim()) {
      // Review finding: a section can legitimately have a heading with NO body text
      // (e.g. two consecutive DOCX/MD headings with nothing between them) — the
      // parser layer deliberately preserves this (see parsers/docx.ts, plainText.ts's
      // own `flush()` guards). Unconditionally skipping every empty-text section here
      // silently discarded that detected structure, undercutting AC #1's "headings and
      // sections are detected to form a structure map." A heading-only section still
      // produces one chunk (using the heading itself as the chunk's text, since
      // there's no body to chunk) rather than vanishing with no trace.
      if (section.heading) {
        chunks.push(makeChunk(section, section.heading, false));
      }
      continue;
    }

    const paragraphs = section.text
      .split(/\n\n+/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);
    const pieces = paragraphs.length > 0 ? paragraphs : [section.text];

    let current = "";
    for (const piece of pieces) {
      if (piece.length > MAX_CHUNK_CHARS) {
        if (current) {
          chunks.push(makeChunk(section, current, true));
          current = "";
        }
        // Review finding: hard-cutting at a fixed offset can land mid-whitespace or
        // mid-word — trimming each slice (as every other chunk already is) would then
        // silently drop that boundary character with nothing reinserted on the other
        // side, merging two words when the chunks are later concatenated/read in
        // order. Hard-cut slices are therefore NOT trimmed — exact byte-for-byte
        // reconstruction is preserved (`chunks.map(c => c.text).join("")` equals the
        // original piece), at the cost of a chunk occasionally starting/ending with a
        // single stray space, an acceptable trade for never silently corrupting content.
        for (let i = 0; i < piece.length; i += MAX_CHUNK_CHARS) {
          chunks.push(makeChunk(section, piece.slice(i, i + MAX_CHUNK_CHARS), false));
        }
        continue;
      }

      const candidate = current ? `${current}\n\n${piece}` : piece;
      if (candidate.length > MAX_CHUNK_CHARS) {
        chunks.push(makeChunk(section, current, true));
        current = piece;
      } else {
        current = candidate;
      }
    }
    if (current) chunks.push(makeChunk(section, current, true));
  }

  return chunks;
}

function makeChunk(section: ParsedSection, text: string, trim: boolean): Chunk {
  return {
    heading: section.heading,
    text: trim ? text.trim() : text,
    pageRangeStart: section.pageRangeStart,
    pageRangeEnd: section.pageRangeEnd,
  };
}
