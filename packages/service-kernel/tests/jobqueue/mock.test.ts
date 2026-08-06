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

  it("trigger() invokes a handler registered via work() with the given payload (Story 2.9)", async () => {
    const adapter = createMockJobQueueAdapter();
    const received: unknown[] = [];
    await adapter.work("ingest-document", async (payload) => {
      received.push(payload);
    });

    await adapter.trigger("ingest-document", { uploadedDocumentId: "doc-1" });

    expect(received).toEqual([{ uploadedDocumentId: "doc-1" }]);
  });

  it("trigger() throws for a job name with no registered handler", async () => {
    const adapter = createMockJobQueueAdapter();

    await expect(adapter.trigger("never-registered", {})).rejects.toThrow();
  });
});
