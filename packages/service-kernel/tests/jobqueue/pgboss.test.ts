import { describe, expect, it, vi } from "vitest";
import { createLogger } from "../../src/logger.js";

const startMock = vi.fn().mockResolvedValue(undefined);
const sendMock = vi.fn().mockResolvedValue("real-job-id");
const onMock = vi.fn();

vi.mock("pg-boss", () => ({
  PgBoss: vi.fn().mockImplementation(function MockPgBoss() {
    return { start: startMock, send: sendMock, on: onMock };
  }),
}));

describe("createPgBossJobQueueAdapter", () => {
  it("starts pg-boss once and enqueues via send(), returning the job id", async () => {
    const { createPgBossJobQueueAdapter } = await import("../../src/jobqueue/pgboss.js");
    const adapter = await createPgBossJobQueueAdapter("postgres://test", createLogger("test"));

    expect(startMock).toHaveBeenCalledTimes(1);

    const jobId = await adapter.enqueue("ingest-document", { uploadedDocumentId: "doc-1" });

    expect(sendMock).toHaveBeenCalledWith("ingest-document", { uploadedDocumentId: "doc-1" });
    expect(jobId).toBe("real-job-id");
  });

  it("throws if send() resolves with no job id", async () => {
    sendMock.mockResolvedValueOnce(null);
    const { createPgBossJobQueueAdapter } = await import("../../src/jobqueue/pgboss.js");
    const adapter = await createPgBossJobQueueAdapter("postgres://test", createLogger("test"));

    await expect(adapter.enqueue("ingest-document", {})).rejects.toThrow();
  });
});
