import postgres from "postgres";
import { createLogger, pingDb } from "@usavvy/service-kernel";
import { loadBoardOrchestrationConfig } from "./config.js";
import { buildApp } from "./app.js";
import { createDb } from "./db/client.js";
import { createVoiceAdapter } from "./modules/voice/index.js";
import { createPubSubAdapter } from "./modules/pubsub/index.js";

const config = loadBoardOrchestrationConfig(process.env);
const logger = createLogger("board-orchestration");
const sql = postgres(config.databaseUrl);

export const db = createDb(sql);

const app = buildApp({
  checkDb: () => pingDb(() => sql`select 1`, logger),
  db,
  voicePort: createVoiceAdapter("mock"),
  pubSubPort: createPubSubAdapter("mock", logger),
  internalServiceSecret: config.internalServiceSecret,
  logger,
});

app.listen({ port: config.port, host: "0.0.0.0" }, (err, address) => {
  if (err) {
    logger.error("board-orchestration failed to start", { reason: err.message });
    process.exit(1);
  }
  logger.info("board-orchestration listening", { address });
});

async function shutdown(signal: string): Promise<void> {
  logger.info("board-orchestration shutting down", { signal });
  await app.close();
  await sql.end();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
