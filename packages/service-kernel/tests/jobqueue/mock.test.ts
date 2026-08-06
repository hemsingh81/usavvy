import { describe, expect, it } from "vitest";
import { createMockJobQueueAdapter } from "../../src/jobqueue/mock.js";

describe("createMockJobQueueAdapter", () => {
  it("records every enqueued job and returns a unique job id per call", async () => {
    const adapter = createMockJobQueueAdapter();

    const id1 = await adapter.enqueue("ingest-document", { uploadedDocumentId: "a" });
    const id2 = await adapter.enqueue("ingest-document", { uploadedDocumentId: "b" });

    expect(id1).not.toBe(id2);
    expect(adapter.enqueuedJobs).toEqual([
      { jobName: "ingest-document", payload: { uploadedDocumentId: "a" } },
      { jobName: "ingest-document", payload: { uploadedDocumentId: "b" } },
    ]);
  });
});
