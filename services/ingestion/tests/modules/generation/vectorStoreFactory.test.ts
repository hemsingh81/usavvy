import { describe, expect, it, vi } from "vitest";
import { createVectorStoreAdapter } from "../../../src/modules/generation/vectorStoreFactory.js";

describe("createVectorStoreAdapter", () => {
  it("dispatches 'mock' to the in-memory adapter", async () => {
    const adapter = createVectorStoreAdapter("mock", {} as never);
    await adapter.upsert([{ chunkId: "c1", documentId: "d1", customCourseId: "cc1", conceptId: null, embedding: [0.1] }]);
    expect(adapter).toHaveProperty("entries");
  });

  it("dispatches 'pgvector' to an adapter backed by the given db", async () => {
    const insertSpy = vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) }) });
    const fakeDb = { insert: insertSpy };

    const adapter = createVectorStoreAdapter("pgvector", fakeDb as never);
    await adapter.upsert([{ chunkId: "c1", documentId: "d1", customCourseId: "cc1", conceptId: null, embedding: [0.1] }]);

    expect(insertSpy).toHaveBeenCalledTimes(1);
  });
});
