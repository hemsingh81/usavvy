import postgres from "postgres";
import { createJobQueueAdapter, createLogger, createStorageAdapter, pingDb } from "@usavvy/service-kernel";
import { loadIngestionConfig } from "./config.js";
import { buildApp } from "./app.js";
import { createDb } from "./db/client.js";

const config = loadIngestionConfig(process.env);
const logger = createLogger("ingestion");
const sql = postgres(config.databaseUrl);

export const db = createDb(sql);

const storagePort = createStorageAdapter(config.storageAdapter, config.storageEndpoint, config.storageBucket, logger);
const jobQueuePort = await createJobQueueAdapter(config.jobQueueAdapter, config.databaseUrl, logger);

const app = buildApp({
  checkDb: () => pingDb(() => sql`select 1`, logger),
  db,
  storagePort,
  jobQueuePort,
  internalServiceSecret: config.internalServiceSecret,
  logger,
});

app.listen({ port: config.port, host: "0.0.0.0" }, (err, address) => {
  if (err) {
    logger.error("ingestion failed to start", { reason: err.message });
    process.exit(1);
  }
  logger.info("ingestion listening", { address });
});

async function shutdown(signal: string): Promise<void> {
  logger.info("ingestion shutting down", { signal });
  await app.close();
  await sql.end();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
