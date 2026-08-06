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
const POLICY_CATEGORIES: PolicyCategory[] = [
  {
    name: "self-harm-instructions",
    severity: "blocked",
    patterns: [/\bhow to (?:kill|harm) (?:yourself|myself)\b/i, /\bsuicide method\b/i],
  },
  {
    name: "credible-violent-threat",
    severity: "blocked",
    patterns: [/\bi will (?:kill|murder) (?:you|him|her|them)\b/i, /\bplan(?:ning)? to (?:bomb|shoot up)\b/i],
  },
  {
    name: "profanity",
    severity: "flagged",
    patterns: [/\b(?:damn|hell|crap)\b/i],
  },
  {
    name: "harassment",
    severity: "flagged",
    patterns: [/\byou'?re (?:an? )?(?:idiot|stupid|worthless)\b/i],
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
    const { status, category } = scanChunkText(chunk.text);
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
