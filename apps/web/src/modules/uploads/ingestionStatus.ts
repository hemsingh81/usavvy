/**
 * Story 2.11 (FR-C-11). A pure client-rendering concern — the server (services/ingestion)
 * only ever returns the raw `status`/`failureReason` strings truthfully; formatting them
 * for display has always been the client's job in this codebase (Story 2.7 never
 * formatted `status` server-side either).
 *
 * Stories 2.12 (embedding/outline proposal) and 2.13 (outline review screen) do not
 * exist yet — no document can currently reach `"embedding"`/`"outline ready"`. Their
 * mappings below exist so this display logic needs no changes once those stories start
 * producing those values; they're verified by unit tests using literal hypothetical
 * status strings, not by any real job today.
 */
export interface IngestionStatusDisplay {
  stageLabel: string;
  progressPercent: number;
  /** True once no further automatic transition is expected TODAY — stops polling. */
  isTerminal: boolean;
  isFailure: boolean;
  failureReason: string | null;
  nextStepSuggestion: string | null;
}

function nextStepForFailure(failureReason: string | null): string | null {
  switch (failureReason) {
    case "encrypted file":
      return "Remove the password protection from this file and upload it again, or upload a different file.";
    case "corrupt file":
      return "This file appears to be corrupted. Try re-exporting or uploading a different file.";
    default:
      // AD-17: even an unrecognized reason still gets an actionable suggestion, never nothing.
      return "Remove this file and try uploading a different one.";
  }
}

export function describeIngestionStatus(status: string, failureReason: string | null): IngestionStatusDisplay {
  switch (status) {
    case "queued":
      return { stageLabel: "Queued", progressPercent: 0, isTerminal: false, isFailure: false, failureReason: null, nextStepSuggestion: null };
    case "parsing":
      return { stageLabel: "Parsing", progressPercent: 25, isTerminal: false, isFailure: false, failureReason: null, nextStepSuggestion: null };
    case "safety scan":
      return {
        stageLabel: "Safety scan",
        progressPercent: 50,
        isTerminal: false,
        isFailure: false,
        failureReason: null,
        nextStepSuggestion: null,
      };
    case "parsed":
      // Deliberate: nothing in this codebase can advance a "parsed" document further
      // today (no embedding code exists) — isTerminal: true means "as far as this can
      // currently go," not "the document's journey is conceptually complete."
      return {
        stageLabel: "Processed — outline generation coming soon",
        progressPercent: 60,
        isTerminal: true,
        isFailure: false,
        failureReason: null,
        nextStepSuggestion: null,
      };
    case "embedding":
      return { stageLabel: "Embedding", progressPercent: 75, isTerminal: false, isFailure: false, failureReason: null, nextStepSuggestion: null };
    case "outline ready":
      return {
        stageLabel: "Outline ready",
        progressPercent: 100,
        isTerminal: true,
        isFailure: false,
        failureReason: null,
        nextStepSuggestion: null,
      };
    // Story 2.14 (FR-C-14): a personal note attached to an existing catalog course skips
    // outline proposal entirely (that course already has its own official Topic/Concept
    // structure) — this is its terminal success state, distinct from "outline ready"
    // (which implies an outline-review screen this flow never has).
    case "embedded":
      return {
        stageLabel: "Added to course notes",
        progressPercent: 100,
        isTerminal: true,
        isFailure: false,
        failureReason: null,
        nextStepSuggestion: null,
      };
    case "blocked":
      return {
        stageLabel: "Blocked",
        progressPercent: 50,
        isTerminal: true,
        isFailure: true,
        failureReason,
        nextStepSuggestion: "This content violates our content policy and can't be used. Remove this file and upload different material.",
      };
    case "failed":
      return {
        stageLabel: "Failed",
        progressPercent: 0,
        isTerminal: true,
        isFailure: true,
        failureReason,
        nextStepSuggestion: nextStepForFailure(failureReason),
      };
    default:
      // Review finding (AD-17): an unrecognized status must never be treated as a
      // quiet, terminal success — that would silently stop polling on what could be a
      // real bug (a typo, a future status this client doesn't know about yet) with no
      // signal to the learner. Keep polling rather than falsely declaring done.
      return { stageLabel: status, progressPercent: 0, isTerminal: false, isFailure: false, failureReason: null, nextStepSuggestion: null };
  }
}
