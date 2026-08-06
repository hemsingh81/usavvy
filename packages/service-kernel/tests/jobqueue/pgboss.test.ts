import { describe, expect, it, vi } from "vitest";
import { createLogger } from "../../src/logger.js";

const startMock = vi.fn().mockResolvedValue(undefined);
const sendMock = vi.fn().mockResolvedValue("real-job-id");
const createQueueMock = vi.fn().mockResolvedValue(undefined);
const workMock = vi.fn().mockResolvedValue("work-id");
const onMock = vi.fn();

vi.mock("pg-boss", () => ({
  PgBoss: vi.fn().mockImplementation(function MockPgBoss() {
    return { start: startMock, send: sendMock, createQueue: createQueueMock, work: workMock, on: onMock };
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

  it("work() ensures the queue exists and registers a perJobResults handler that calls the given callback per job in pg-boss's batch (Story 2.9)", async () => {
    const { createPgBossJobQueueAdapter } = await import("../../src/jobqueue/pgboss.js");
    const adapter = await createPgBossJobQueueAdapter("postgres://test", createLogger("test"));
    createQueueMock.mockClear();
    const handler = vi.fn().mockResolvedValue(undefined);

    await adapter.work("ingest-document", handler);

    expect(createQueueMock).toHaveBeenCalledWith("ingest-document");
    expect(workMock).toHaveBeenCalledWith("ingest-document", { perJobResults: true }, expect.any(Function));

    const pgBossBatchHandler = workMock.mock.calls[0]?.[2] as (jobs: unknown[]) => Promise<unknown>;
    await pgBossBatchHandler([{ id: "j1", data: { uploadedDocumentId: "doc-1" } }]);
    expect(handler).toHaveBeenCalledWith({ uploadedDocumentId: "doc-1" });
  });

  it(
    "review finding: reports each job's real outcome back to pg-boss via perJobResults, instead of always resolving the whole batch as if every job succeeded",
    async () => {
      const { createPgBossJobQueueAdapter } = await import("../../src/jobqueue/pgboss.js");
      const logger = createLogger("test");
      const errorSpy = vi.spyOn(logger, "error");
      const adapter = await createPgBossJobQueueAdapter("postgres://test", logger);
      const handler = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(undefined);

      await adapter.work("ingest-document", handler);
      const pgBossBatchHandler = workMock.mock.calls.at(-1)?.[2] as (jobs: unknown[]) => Promise<unknown>;

      const results = await pgBossBatchHandler([
        { id: "j1", data: { a: 1 } },
        { id: "j2", data: { a: 2 } },
      ]);

      expect(handler).toHaveBeenCalledTimes(2);
      expect(errorSpy).toHaveBeenCalled();
      // A thrown handler error must surface as a "failed" result for THAT job (so
      // pg-boss's own retry/dead-letter policy can act on it) — not silently resolve
      // the whole batch as if both jobs succeeded.
      expect(results).toEqual([
        { id: "j1", status: "failed", output: { reason: "boom" } },
        { id: "j2", status: "completed" },
      ]);
    },
  );
});
