import { EMBEDDING_DIMENSIONS } from "../../db/schema.js";
import type { GenerationPort, ProposeOutlineChunk, ProposeOutlineInput, ProposedOutline } from "./port.js";

const UNTITLED_SECTION = "Untitled section";

// FNV-1a — cheap, deterministic, no dependency. Only needs to seed a PRNG, not to be
// cryptographically sound.
function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

// mulberry32 — small, deterministic PRNG seeded from the hash above. Same text always
// produces the same vector (AC #1's tests need determinism, not real semantic meaning —
// no real embedding provider exists yet, see this story's Scope Note).
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mockEmbed(text: string): number[] {
  const next = mulberry32(hashString(text));
  return Array.from({ length: EMBEDDING_DIMENSIONS }, () => next() * 2 - 1);
}

function groupKey(chunk: ProposeOutlineChunk): string {
  // Review finding: `?? UNTITLED_SECTION` only catches null/undefined, not a heading
  // that's present but blank/whitespace-only (e.g. a Markdown "#   " line) — that must
  // fall into the same "Untitled section" bucket as a genuinely absent heading, not get
  // its own empty-titled Topic.
  const heading = chunk.heading?.trim();
  return heading ? heading : UNTITLED_SECTION;
}

function pageRange(chunks: ProposeOutlineChunk[]): { start: number | null; end: number | null } {
  const starts = chunks.map((chunk) => chunk.pageRangeStart).filter((value): value is number => value !== null);
  const ends = chunks.map((chunk) => chunk.pageRangeEnd).filter((value): value is number => value !== null);
  return {
    start: starts.length > 0 ? Math.min(...starts) : null,
    end: ends.length > 0 ? Math.max(...ends) : null,
  };
}

/**
 * Story 2.12 (FR-C-9), AC #1-4. Groups chunks by heading (first-seen order) — a
 * heading-less chunk falls into one shared "Untitled section" group. This mock's
 * grouping IS the Topic/Concept boundary (one Concept per Topic group) — a real
 * semantic-clustering adapter would further split a long heading-group into multiple
 * Concepts, deliberately out of scope for a cheap deterministic mock (see Dev Notes).
 */
function mockProposeOutline(input: ProposeOutlineInput): ProposedOutline {
  const order: string[] = [];
  const groups = new Map<string, ProposeOutlineChunk[]>();
  for (const chunk of input.chunks) {
    const key = groupKey(chunk);
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)?.push(chunk);
  }

  return order.map((title) => {
    const chunks = groups.get(title) as ProposeOutlineChunk[];
    const { start, end } = pageRange(chunks);
    return {
      title,
      concepts: [
        {
          title,
          sourcePageRangeStart: start,
          sourcePageRangeEnd: end,
          safetyFlagged: chunks.some((chunk) => chunk.safetyStatus === "flagged"),
          chunkIds: chunks.map((chunk) => chunk.chunkId),
        },
      ],
    };
  });
}

export function createMockGenerationAdapter(): GenerationPort {
  return {
    embed: (text) => Promise.resolve(mockEmbed(text)),
    proposeOutline: (input) => Promise.resolve(mockProposeOutline(input)),
  };
}
