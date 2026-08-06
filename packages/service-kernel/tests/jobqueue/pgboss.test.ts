import { describe, expect, it, vi } from "vitest";
import { createLogger } from "../../src/logger.js";

const startMock = vi.fn().mockResolvedValue(undefined);
const sendMock = vi.fn().mockResolvedValue("real-job-id");
const createQueueMock = vi.fn().mockResolvedValue(undefined);
const onMock = vi.fn();

vi.mock("pg-boss", () => ({
  PgBoss: vi.fn().mockImplementation(function MockPgBoss() {
    return { start: startMock, send: sendMock, createQueue: createQueueMock, on: onMock };
  }),
}));

describe("createPgBossJobQueueAdapter", () => {
  it("starts pg-boss once, ensures the queue exists, and enqueues via send(), returning the job id", async () => {
    const { createPgBossJobQueueAdapter } = await import("../../src/jobqueue/pgboss.js");
    const adapter = await createPgBossJobQueueAdapter("postgres://test", createLogger("test"));

    expect(startMock).toHaveBeenCalledTimes(1);

    const jobId = await adapter.enqueue("ingest-document", { uploadedDocumentId: "doc-1" });

    expect(createQueueMock).toHaveBeenCalledWith("ingest-document");
    expect(sendMock).toHaveBeenCalledWith("ingest-document", { uploadedDocumentId: "doc-1" });
    expect(jobId).toBe("real-job-id");
  });

  it("only creates a given queue once across repeated enqueues (pg-boss v12 requires the queue to exist before send)", async () => {
    const { createPgBossJobQueueAdapter } = await import("../../src/jobqueue/pgboss.js");
    const adapter = await createPgBossJobQueueAdapter("postgres://test", createLogger("test"));
    createQueueMock.mockClear();

    await adapter.enqueue("ingest-document", { a: 1 });
    await adapter.enqueue("ingest-document", { a: 2 });

    expect(createQueueMock).toHaveBeenCalledTimes(1);
  });

  it("throws if send() resolves with no job id", async () => {
    sendMock.mockResolvedValueOnce(null);
    const { createPgBossJobQueueAdapter } = await import("../../src/jobqueue/pgboss.js");
    const adapter = await createPgBossJobQueueAdapter("postgres://test", createLogger("test"));

    await expect(adapter.enqueue("ingest-document", {})).rejects.toThrow();
  });
});
