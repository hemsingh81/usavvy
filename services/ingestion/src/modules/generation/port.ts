// Story 2.12 (FR-C-9), AD-1/AD-2. This story's first, and today only, consumer of
// GenerationPort — lives here in `ingestion`, not in `packages/service-kernel` or a
// scaffolded `services/generation`, since neither exists yet for a first real caller to
// justify (see this story's Dev Notes for the full placement rationale, mirroring
// NotificationPort's own "lives inside its first consumer" precedent).

export interface ProposeOutlineChunk {
  chunkId: string;
  text: string;
  heading: string | null;
  pageRangeStart: number | null;
  pageRangeEnd: number | null;
  safetyStatus: "clear" | "flagged";
}

export interface ProposeOutlineInput {
  chunks: ProposeOutlineChunk[];
}

export interface ProposedConcept {
  title: string;
  sourcePageRangeStart: number | null;
  sourcePageRangeEnd: number | null;
  safetyFlagged: boolean;
  chunkIds: string[];
}

export interface ProposedTopic {
  title: string;
  concepts: ProposedConcept[];
}

export type ProposedOutline = ProposedTopic[];

export interface GenerationPort {
  embed(text: string): Promise<number[]>;
  proposeOutline(input: ProposeOutlineInput): Promise<ProposedOutline>;
}
