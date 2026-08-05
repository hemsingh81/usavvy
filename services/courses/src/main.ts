import postgres from "postgres";
import { createLogger, pingDb } from "@usavvy/service-kernel";
import { loadCoursesConfig } from "./config.js";
import { buildApp } from "./app.js";
import { createDb } from "./db/client.js";

const config = loadCoursesConfig(process.env);
const logger = createLogger("courses");
const sql = postgres(config.databaseUrl);

export const db = createDb(sql);

const app = buildApp({
  checkDb: () => pingDb(() => sql`select 1`, logger),
  db,
  internalServiceSecret: config.internalServiceSecret,
  logger,
});

app.listen({ port: config.port, host: "0.0.0.0" }, (err, address) => {
  if (err) {
    logger.error("courses failed to start", { reason: err.message });
    process.exit(1);
  }
  logger.info("courses listening", { address });
});

async function shutdown(signal: string): Promise<void> {
  logger.info("courses shutting down", { signal });
  await app.close();
  await sql.end();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
