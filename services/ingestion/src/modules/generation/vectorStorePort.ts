// Story 2.12 (FR-C-9), AD-1; AC #1. Write-only — no query/search method, since no AC in
// this story requires retrieval (a future epic's job, once `generation`'s real read side
// exists). Lives alongside GenerationPort in this same module folder — see this story's
// Dev Notes for why both are local to `ingestion` rather than `packages/service-kernel`
// (this port's real adapter needs direct access to ingestion's own Drizzle schema).

export interface VectorStoreEntry {
  chunkId: string;
  documentId: string;
  customCourseId: string;
  // AC #1's "conceptId placeholder" — always null until a future story creates real
  // Concepts (Story 2.13 or later; see this story's Scope Note).
  conceptId: string | null;
  embedding: number[];
}

export interface VectorStorePort {
  upsert(entries: VectorStoreEntry[]): Promise<void>;
}
