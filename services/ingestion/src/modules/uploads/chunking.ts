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
    if (!section.text.trim()) continue;

    const paragraphs = section.text
      .split(/\n\n+/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);
    const pieces = paragraphs.length > 0 ? paragraphs : [section.text];

    let current = "";
    for (const piece of pieces) {
      if (piece.length > MAX_CHUNK_CHARS) {
        if (current) {
          chunks.push(makeChunk(section, current));
          current = "";
        }
        for (let i = 0; i < piece.length; i += MAX_CHUNK_CHARS) {
          chunks.push(makeChunk(section, piece.slice(i, i + MAX_CHUNK_CHARS)));
        }
        continue;
      }

      const candidate = current ? `${current}\n\n${piece}` : piece;
      if (candidate.length > MAX_CHUNK_CHARS) {
        chunks.push(makeChunk(section, current));
        current = piece;
      } else {
        current = candidate;
      }
    }
    if (current) chunks.push(makeChunk(section, current));
  }

  return chunks;
}

function makeChunk(section: ParsedSection, text: string): Chunk {
  return { heading: section.heading, text: text.trim(), pageRangeStart: section.pageRangeStart, pageRangeEnd: section.pageRangeEnd };
}
