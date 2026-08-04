import postgres from "postgres";
import { createLogger, pingDb, pingStorage } from "@usavvy/service-kernel";
import { loadCoreConfig } from "./config.js";
import { buildApp } from "./app.js";
import { createNotificationAdapter } from "./modules/notification/index.js";

const config = loadCoreConfig(process.env);
const logger = createLogger("core");
const sql = postgres(config.databaseUrl);

// Bound here, at boot, from config (AD-12) — Story 1.1 imports this instance rather
// than constructing its own adapter.
export const notificationPort = createNotificationAdapter(config.notificationAdapter, createLogger("notification"));

const app = buildApp({
  checkDb: () => pingDb(() => sql`select 1`, logger),
  checkStorage: () => pingStorage(config.storageEndpoint, logger),
});

app.listen({ port: config.port, host: "0.0.0.0" }, (err, address) => {
  if (err) {
    logger.error("core failed to start", { reason: err.message });
    process.exit(1);
  }
  logger.info("core listening", { address });
});
