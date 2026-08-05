import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createLogger } from "@usavvy/service-kernel";
import { loadCoreConfig } from "../config.js";

// Drizzle's postgres-js migrator requires a single-connection client (max: 1) —
// a pooled connection breaks migrate(). This is a separate, short-lived client from
// the app's own pooled `sql` instance in main.ts.
const config = loadCoreConfig(process.env);
const logger = createLogger("core-migrate");
const migrationClient = postgres(config.databaseUrl, { max: 1 });
const db = drizzle(migrationClient);

await migrate(db, { migrationsFolder: "./drizzle" });
await migrationClient.end();
// Review finding: used raw console.log, inconsistent with every other entry point's
// structured-logging convention.
logger.info("migrations applied");
