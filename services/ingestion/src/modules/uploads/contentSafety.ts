import type { Chunk } from "./chunking.js";

export type SafetyStatus = "clear" | "flagged" | "blocked";

export interface ScanResult {
  status: SafetyStatus;
  category: string | null;
}

export interface ScannedChunk extends Chunk {
  safetyStatus: SafetyStatus;
  safetyCategory: string | null;
}

export interface DocumentSafetyOutcome {
  status: "blocked" | "parsed";
  failureReason: string | null;
}

interface PolicyCategory {
  name: string;
  severity: "blocked" | "flagged";
  patterns: RegExp[];
}

// Story 2.10 (FR-C-13). No policy-category taxonomy or external moderation vendor is
// specified anywhere in the PRD/epics — following the same cheap, documented-heuristic
// discipline as Story 2.7's page-count regex, Story 2.8's HTML-stripping regex, and
// Story 2.9's font-size heading heuristic. Good enough to catch obvious high-harm cases
// and route borderline language to review — not a production-grade classifier.
// Review finding: multi-word phrases must match across ANY run of whitespace (`\s+`),
// not just a single literal " " — real chunk text joins paragraphs with "\n\n" (see
// chunking.ts), and .txt/.md input preserves that verbatim (unlike the PDF/DOCX/PPTX
// parsers, which collapse whitespace to single spaces), so a literal-space pattern
// silently misses the same phrase split across a paragraph break.
//
// Accepted limitations (a cheap per-chunk keyword scan, not a production classifier):
// (1) a phrase can still be split across TWO separate chunks by chunking.ts's own
// hard-cut (a paragraph exceeding MAX_CHUNK_CHARS is sliced at a fixed offset with no
// regard for word/phrase boundaries) — no per-chunk scan can catch a phrase that never
// appears whole in any single chunk's text; fixing this would require cross-chunk
// overlap scanning, well beyond this story's "cheap heuristic" scope. (2) single common
// words used as "flagged" triggers (e.g. "hell") will over-flag entirely benign academic
// content (religion/mythology/literature courses) — an accepted false-positive cost
// specifically because "flagged" only routes a chunk to human review and never blocks
// ingestion; the cost of a missed genuine flag is judged higher than the noise from
// over-flagging on this non-blocking tier.
const POLICY_CATEGORIES: PolicyCategory[] = [
  {
    name: "self-harm-instructions",
    severity: "blocked",
    // "methods?" (not a trailing \b after "method") so the plural isn't excluded by the
    // word-boundary check — the boundary after "method" is not a boundary before "s".
    patterns: [/\bhow to\s+(?:kill|harm)\s+(?:yourself|myself)\b/i, /\bsuicide methods?\b/i],
  },
  {
    name: "credible-violent-threat",
    severity: "blocked",
    patterns: [/\bi will\s+(?:kill|murder)\s+(?:you|him|her|them)\b/i, /\bplan(?:ning)? to\s+(?:bomb|shoot up)\b/i],
  },
  {
    name: "profanity",
    severity: "flagged",
    patterns: [/\b(?:damn|hell|crap)\b/i],
  },
  {
    name: "harassment",
    severity: "flagged",
    // Matches both the contracted form (straight OR curly/smart apostrophe — the
    // character word-processor autocorrect actually produces) and the uncontracted
    // "you are", not just "you're".
    patterns: [/\byou(?:\s*(?:'|’)?re|\s+are)\s+(?:an?\s+)?(?:idiot|stupid|worthless)\b/i],
  },
];

export function scanChunkText(text: string): ScanResult {
  let flaggedMatch: PolicyCategory | undefined;
  for (const category of POLICY_CATEGORIES) {
    if (category.patterns.some((pattern) => pattern.test(text))) {
      if (category.severity === "blocked") {
        return { status: "blocked", category: category.name };
      }
      flaggedMatch ??= category;
    }
  }
  return flaggedMatch ? { status: "flagged", category: flaggedMatch.name } : { status: "clear", category: null };
}

export function scanChunks(chunks: Chunk[]): ScannedChunk[] {
  return chunks.map((chunk) => {
    // Review finding: a chunk's heading is separate from its body text (see
    // chunking.ts) and was never scanned when a body was present — "each chunk is
    // checked" (AC #1) means the whole chunk, not just whichever field happens to hold
    // the matching phrase.
    const combinedText = chunk.heading ? `${chunk.heading}\n${chunk.text}` : chunk.text;
    const { status, category } = scanChunkText(combinedText);
    return { ...chunk, safetyStatus: status, safetyCategory: category };
  });
}

// Story 2.10, AC #2/#3: any "blocked" chunk halts the whole document, regardless of how
// many other chunks are clear/flagged. A "flagged" chunk never halts on its own — see
// this story's Dev Notes on why no majority-flagged threshold is implemented.
export function aggregateDocumentOutcome(scannedChunks: ScannedChunk[]): DocumentSafetyOutcome {
  const blockedChunk = scannedChunks.find((chunk) => chunk.safetyStatus === "blocked");
  if (blockedChunk) {
    return { status: "blocked", failureReason: `blocked: ${blockedChunk.safetyCategory}` };
  }
  return { status: "parsed", failureReason: null };
}
