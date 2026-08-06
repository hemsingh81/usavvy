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
