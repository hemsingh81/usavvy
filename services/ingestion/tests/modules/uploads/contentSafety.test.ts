import { describe, expect, it } from "vitest";
import { aggregateDocumentOutcome, scanChunkText, scanChunks } from "../../../src/modules/uploads/contentSafety.js";
import type { Chunk } from "../../../src/modules/uploads/chunking.js";

function chunk(overrides: Partial<Chunk> = {}): Chunk {
  return { heading: null, text: "", pageRangeStart: null, pageRangeEnd: null, ...overrides };
}

describe("scanChunkText", () => {
  it("returns clear/null for ordinary content", () => {
    expect(scanChunkText("This chapter introduces the fundamentals of algebra.")).toEqual({ status: "clear", category: null });
  });

  it("returns the flagged category for borderline text", () => {
    expect(scanChunkText("This is a damn good example.")).toEqual({ status: "flagged", category: "profanity" });
  });

  it("returns the blocked category for clearly-violating text", () => {
    expect(scanChunkText("Here is how to kill yourself using household items.")).toEqual({
      status: "blocked",
      category: "self-harm-instructions",
    });
  });

  it("prioritizes a blocked match over a flagged match in the same chunk", () => {
    const text = "This is a damn good example. Here is how to kill yourself using household items.";
    expect(scanChunkText(text)).toEqual({ status: "blocked", category: "self-harm-instructions" });
  });

  it("matches a blocked phrase spanning a paragraph break, not just a single literal space (review finding)", () => {
    // Real .txt/.md input preserves \n\n paragraph breaks verbatim (unlike the PDF/DOCX/
    // PPTX parsers, which collapse whitespace to single spaces) — a pattern requiring a
    // literal " " between phrase halves silently misses the exact same phrase here.
    const text = "How to kill\n\nyourself: a step-by-step guide.";
    expect(scanChunkText(text)).toEqual({ status: "blocked", category: "self-harm-instructions" });
  });

  it("matches the plural 'suicide methods', not just the singular (review finding)", () => {
    const text = "A comparison of common suicide methods is presented below.";
    expect(scanChunkText(text)).toEqual({ status: "blocked", category: "self-harm-instructions" });
  });

  it("matches the uncontracted 'you are' harassment phrasing, not just 'you're' (review finding)", () => {
    expect(scanChunkText("You are an idiot.")).toEqual({ status: "flagged", category: "harassment" });
  });

  it("matches 'you're' with a real curly/smart apostrophe, as autocorrect actually produces (review finding)", () => {
    expect(scanChunkText("You’re an idiot.")).toEqual({ status: "flagged", category: "harassment" });
  });
});

describe("scanChunks", () => {
  it("attaches per-chunk safety fields without altering the chunk's other fields", () => {
    const chunks = [
      chunk({ heading: "Intro", text: "Ordinary content.", pageRangeStart: 1, pageRangeEnd: 1 }),
      chunk({ heading: "Rant", text: "This is a damn good example." }),
    ];

    const scanned = scanChunks(chunks);

    expect(scanned).toEqual([
      { heading: "Intro", text: "Ordinary content.", pageRangeStart: 1, pageRangeEnd: 1, safetyStatus: "clear", safetyCategory: null },
      { heading: "Rant", text: "This is a damn good example.", pageRangeStart: null, pageRangeEnd: null, safetyStatus: "flagged", safetyCategory: "profanity" },
    ]);
  });

  it("scans a chunk's heading as well as its body text, not just the body (review finding, AC #1)", () => {
    // A section can have a clean body but a policy-violating heading (or vice versa) —
    // "each chunk is checked against policy categories" (AC #1) means the whole chunk,
    // not just whichever field happens to hold the matching phrase.
    const scanned = scanChunks([chunk({ heading: "How to kill yourself: a warning", text: "This chapter discusses coping resources." })]);

    expect(scanned[0]).toMatchObject({ safetyStatus: "blocked", safetyCategory: "self-harm-instructions" });
  });
});

describe("aggregateDocumentOutcome", () => {
  it("returns parsed/null when every chunk is clear", () => {
    const scanned = scanChunks([chunk({ text: "Ordinary content." }), chunk({ text: "More ordinary content." })]);

    expect(aggregateDocumentOutcome(scanned)).toEqual({ status: "parsed", failureReason: null });
  });

  it("returns parsed/null when chunks are a mix of clear and flagged, with none blocked (AC #3)", () => {
    const scanned = scanChunks([chunk({ text: "Ordinary content." }), chunk({ text: "This is a damn good example." })]);

    expect(aggregateDocumentOutcome(scanned)).toEqual({ status: "parsed", failureReason: null });
  });

  it("returns blocked with the matching category when any chunk is blocked, regardless of other chunks (AC #2)", () => {
    const scanned = scanChunks([
      chunk({ text: "Ordinary content." }),
      chunk({ text: "Here is how to kill yourself using household items." }),
      chunk({ text: "This is a damn good example." }),
    ]);

    expect(aggregateDocumentOutcome(scanned)).toEqual({ status: "blocked", failureReason: "blocked: self-harm-instructions" });
  });
});
