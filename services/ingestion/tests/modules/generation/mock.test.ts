import { describe, expect, it } from "vitest";
import { createMockGenerationAdapter } from "../../../src/modules/generation/mock.js";
import { EMBEDDING_DIMENSIONS } from "../../../src/db/schema.js";
import type { ProposeOutlineChunk } from "../../../src/modules/generation/port.js";

function chunk(overrides: Partial<ProposeOutlineChunk>): ProposeOutlineChunk {
  return {
    chunkId: "c1",
    text: "some text",
    heading: null,
    pageRangeStart: null,
    pageRangeEnd: null,
    safetyStatus: "clear",
    ...overrides,
  };
}

describe("createMockGenerationAdapter", () => {
  describe("embed", () => {
    it("produces a vector of the exact configured dimension", async () => {
      const adapter = createMockGenerationAdapter();
      const vector = await adapter.embed("hello world");
      expect(vector).toHaveLength(EMBEDDING_DIMENSIONS);
      expect(vector.every((value) => typeof value === "number" && Number.isFinite(value))).toBe(true);
    });

    it("is deterministic — the same text always produces the same vector (AC #1)", async () => {
      const adapter = createMockGenerationAdapter();
      const first = await adapter.embed("the quick brown fox");
      const second = await adapter.embed("the quick brown fox");
      expect(first).toEqual(second);
    });

    it("produces different vectors for different text", async () => {
      const adapter = createMockGenerationAdapter();
      const a = await adapter.embed("alpha");
      const b = await adapter.embed("beta");
      expect(a).not.toEqual(b);
    });
  });

  describe("proposeOutline", () => {
    it("groups chunks by heading into one Topic per heading, in first-seen order", async () => {
      const adapter = createMockGenerationAdapter();
      const outline = await adapter.proposeOutline({
        chunks: [
          chunk({ chunkId: "c1", heading: "Intro" }),
          chunk({ chunkId: "c2", heading: "Basics" }),
          chunk({ chunkId: "c3", heading: "Intro" }),
        ],
      });

      expect(outline.map((topic) => topic.title)).toEqual(["Intro", "Basics"]);
      expect(outline[0]?.concepts[0]?.chunkIds).toEqual(["c1", "c3"]);
      expect(outline[1]?.concepts[0]?.chunkIds).toEqual(["c2"]);
    });

    it("falls back to a single 'Untitled section' group for heading-less chunks", async () => {
      const adapter = createMockGenerationAdapter();
      const outline = await adapter.proposeOutline({
        chunks: [chunk({ chunkId: "c1", heading: null }), chunk({ chunkId: "c2", heading: null })],
      });

      expect(outline).toHaveLength(1);
      expect(outline[0]?.title).toBe("Untitled section");
      expect(outline[0]?.concepts[0]?.chunkIds).toEqual(["c1", "c2"]);
    });

    it("merges a blank/whitespace-only heading into the same 'Untitled section' group as a null heading (review finding)", async () => {
      const adapter = createMockGenerationAdapter();
      const outline = await adapter.proposeOutline({
        chunks: [chunk({ chunkId: "c1", heading: null }), chunk({ chunkId: "c2", heading: "   " })],
      });

      expect(outline).toHaveLength(1);
      expect(outline[0]?.title).toBe("Untitled section");
      expect(outline[0]?.concepts[0]?.chunkIds).toEqual(["c1", "c2"]);
    });

    it("produces exactly one Topic and one Concept for a single-chunk document (AC #3)", async () => {
      const adapter = createMockGenerationAdapter();
      const outline = await adapter.proposeOutline({ chunks: [chunk({ chunkId: "only" })] });

      expect(outline).toHaveLength(1);
      expect(outline[0]?.concepts).toHaveLength(1);
      expect(outline[0]?.concepts[0]?.chunkIds).toEqual(["only"]);
    });

    it("marks a Concept safetyFlagged when any contributing chunk is flagged (AC #4)", async () => {
      const adapter = createMockGenerationAdapter();
      const flagged = await adapter.proposeOutline({
        chunks: [chunk({ chunkId: "c1", heading: "A", safetyStatus: "flagged" }), chunk({ chunkId: "c2", heading: "A", safetyStatus: "clear" })],
      });
      expect(flagged[0]?.concepts[0]?.safetyFlagged).toBe(true);

      const clear = await adapter.proposeOutline({
        chunks: [chunk({ chunkId: "c1", heading: "A", safetyStatus: "clear" })],
      });
      expect(clear[0]?.concepts[0]?.safetyFlagged).toBe(false);
    });

    it("derives the source page range as the min/max across a group's chunks (AC #2)", async () => {
      const adapter = createMockGenerationAdapter();
      const outline = await adapter.proposeOutline({
        chunks: [
          chunk({ chunkId: "c1", heading: "A", pageRangeStart: 3, pageRangeEnd: 3 }),
          chunk({ chunkId: "c2", heading: "A", pageRangeStart: 5, pageRangeEnd: 6 }),
        ],
      });
      expect(outline[0]?.concepts[0]).toMatchObject({ sourcePageRangeStart: 3, sourcePageRangeEnd: 6 });
    });

    it("leaves the page range null when every contributing chunk has a null page range (DOCX-shaped input)", async () => {
      const adapter = createMockGenerationAdapter();
      const outline = await adapter.proposeOutline({
        chunks: [chunk({ chunkId: "c1", heading: "A", pageRangeStart: null, pageRangeEnd: null })],
      });
      expect(outline[0]?.concepts[0]).toMatchObject({ sourcePageRangeStart: null, sourcePageRangeEnd: null });
    });
  });
});
