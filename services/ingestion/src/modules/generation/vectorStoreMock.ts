import type { VectorStoreEntry, VectorStorePort } from "./vectorStorePort.js";

export interface MockVectorStorePort extends VectorStorePort {
  entries: Map<string, VectorStoreEntry>;
}

/** In-memory VectorStorePort for tests — records upserted entries, never touches Postgres. */
export function createMockVectorStoreAdapter(): MockVectorStorePort {
  const entries = new Map<string, VectorStoreEntry>();
  return {
    entries,
    async upsert(newEntries) {
      for (const entry of newEntries) {
        entries.set(entry.chunkId, entry);
      }
    },
  };
}
