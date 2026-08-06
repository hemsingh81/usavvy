import { describe, expect, it } from "vitest";
import { chunkSections, MAX_CHUNK_CHARS } from "../../../src/modules/uploads/chunking.js";
import type { ParsedSection } from "../../../src/modules/uploads/parsers/types.js";

function section(overrides: Partial<ParsedSection> = {}): ParsedSection {
  return { heading: null, text: "", pageRangeStart: null, pageRangeEnd: null, ...overrides };
}

describe("chunkSections", () => {
  it("keeps a short section as a single chunk, inheriting its heading and page range", () => {
    const chunks = chunkSections([section({ heading: "Intro", text: "A short paragraph.", pageRangeStart: 1, pageRangeEnd: 1 })]);

    expect(chunks).toEqual([{ heading: "Intro", text: "A short paragraph.", pageRangeStart: 1, pageRangeEnd: 1 }]);
  });

  it("skips a section with empty/whitespace-only text", () => {
    const chunks = chunkSections([section({ text: "   " }), section({ heading: "Real", text: "Real content." })]);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.heading).toBe("Real");
  });

  it("splits a long section into multiple chunks at paragraph boundaries where possible", () => {
    const paragraph = "word ".repeat(200).trim(); // ~1000 chars, under the cap on its own
    const text = `${paragraph}\n\n${paragraph}\n\n${paragraph}`; // ~3000 chars total, over the cap

    const chunks = chunkSections([section({ heading: "Long", text })]);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
      expect(chunk.heading).toBe("Long");
    }
  });

  it("hard-cuts a single paragraph that alone exceeds MAX_CHUNK_CHARS", () => {
    const hugeParagraph = "x".repeat(MAX_CHUNK_CHARS * 2 + 100);

    const chunks = chunkSections([section({ text: hugeParagraph })]);

    expect(chunks.length).toBeGreaterThanOrEqual(3);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
    }
    expect(chunks.map((c) => c.text).join("")).toBe(hugeParagraph);
  });

  it("produces chunks across multiple sections, each carrying its own section's heading/page range", () => {
    const chunks = chunkSections([
      section({ heading: "A", text: "Section A text.", pageRangeStart: 1, pageRangeEnd: 1 }),
      section({ heading: "B", text: "Section B text.", pageRangeStart: 2, pageRangeEnd: 2 }),
    ]);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({ heading: "A", pageRangeStart: 1 });
    expect(chunks[1]).toMatchObject({ heading: "B", pageRangeStart: 2 });
  });

  it("still produces a chunk for a heading-only section with no body text, rather than silently discarding the detected structure (review finding)", () => {
    const chunks = chunkSections([
      section({ heading: "Section A", text: "", pageRangeStart: 1, pageRangeEnd: 1 }),
      section({ heading: "Section B", text: "", pageRangeStart: 2, pageRangeEnd: 2 }),
    ]);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({ heading: "Section A", text: "Section A" });
    expect(chunks[1]).toMatchObject({ heading: "Section B", text: "Section B" });
  });

  it("still skips a section with neither a heading nor any body text", () => {
    const chunks = chunkSections([section({ heading: null, text: "   " })]);

    expect(chunks).toHaveLength(0);
  });

  it("preserves whitespace exactly at a hard-cut boundary, never silently merging two words (review finding)", () => {
    // A single "paragraph" (no \n\n) of two long runs joined by one space, landing
    // the cut exactly on that space when sliced at MAX_CHUNK_CHARS.
    const before = "a".repeat(MAX_CHUNK_CHARS);
    const after = "b".repeat(MAX_CHUNK_CHARS);
    const text = `${before} ${after}`;

    const chunks = chunkSections([section({ text })]);

    // Reconstructing the chunks in order must reproduce the original exactly — if the
    // boundary space were trimmed away by a hard-cut chunk, this would come back one
    // character short with "a" and "b" merged directly together.
    expect(chunks.map((c) => c.text).join("")).toBe(text);
    expect(chunks.every((c) => !c.text.includes("ab"))).toBe(true);
  });
});
