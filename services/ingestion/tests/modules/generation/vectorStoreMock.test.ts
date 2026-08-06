import { describe, expect, it } from "vitest";
import { createMockVectorStoreAdapter } from "../../../src/modules/generation/vectorStoreMock.js";

describe("createMockVectorStoreAdapter", () => {
  it("round-trips upserted entries", async () => {
    const adapter = createMockVectorStoreAdapter();
    const entry = { chunkId: "c1", documentId: "d1", customCourseId: "cc1", conceptId: null, embedding: [0.1, 0.2] };

    await adapter.upsert([entry]);

    expect(adapter.entries.get("c1")).toEqual(entry);
  });

  it("overwrites an existing entry for the same chunkId rather than duplicating", async () => {
    const adapter = createMockVectorStoreAdapter();
    await adapter.upsert([{ chunkId: "c1", documentId: "d1", customCourseId: "cc1", conceptId: null, embedding: [0.1] }]);
    await adapter.upsert([{ chunkId: "c1", documentId: "d1", customCourseId: "cc1", conceptId: null, embedding: [0.9] }]);

    expect(adapter.entries.size).toBe(1);
    expect(adapter.entries.get("c1")?.embedding).toEqual([0.9]);
  });
});
