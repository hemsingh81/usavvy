import { describe, expect, it } from "vitest";
import { createJobQueueAdapter } from "../../src/jobqueue/factory.js";
import { createLogger } from "../../src/logger.js";

describe("createJobQueueAdapter", () => {
  it("returns a working mock adapter for 'mock'", async () => {
    const adapter = await createJobQueueAdapter("mock", "postgres://test", createLogger("test"));

    const jobId = await adapter.enqueue("ingest-document", { uploadedDocumentId: "a" });

    expect(jobId).toEqual(expect.any(String));
  });
});
