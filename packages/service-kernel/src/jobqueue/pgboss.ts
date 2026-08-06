import { PgBoss } from "pg-boss";
import type { Logger } from "../logger.js";
import type { JobQueuePort } from "./port.js";

/**
 * AD-15's dev/default adapter — pg-boss, Postgres-native, no extra infra beyond the
 * database already running (Stack table). `start()` must resolve before `enqueue` is
 * ever called; `createPgBossJobQueueAdapter` does that once at boot, matching the
 * async-factory shape `createJobQueueAdapter` exposes.
 */
export async function createPgBossJobQueueAdapter(databaseUrl: string, logger: Logger): Promise<JobQueuePort> {
  const boss = new PgBoss(databaseUrl);
  boss.on("error", (error: Error) => logger.error("job queue error", { reason: error.message }));
  await boss.start();

  // pg-boss v12 requires a queue to exist before send() — unlike older versions, it no
  // longer creates one implicitly. createQueue is idempotent; tracked per-name so a
  // hot path doesn't re-issue the (safe but pointless) call on every single enqueue.
  const ensuredQueues = new Set<string>();
  async function ensureQueue(jobName: string): Promise<void> {
    if (ensuredQueues.has(jobName)) return;
    await boss.createQueue(jobName);
    ensuredQueues.add(jobName);
  }

  return {
    async enqueue(jobName, payload) {
      await ensureQueue(jobName);
      const jobId = await boss.send(jobName, payload);
      if (!jobId) {
        throw new Error(`job queue failed to enqueue job "${jobName}"`);
      }
      return jobId;
    },
  };
}
