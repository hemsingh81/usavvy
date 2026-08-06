import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createLogger } from "@usavvy/service-kernel";
import { loadIngestionConfig } from "../config.js";

// Drizzle's postgres-js migrator requires a single-connection client (max: 1) — a
// pooled connection breaks migrate(). Separate, short-lived client from main.ts's own.
const config = loadIngestionConfig(process.env);
const logger = createLogger("ingestion-migrate");
const migrationClient = postgres(config.databaseUrl, { max: 1 });
const db = drizzle(migrationClient);

await migrate(db, { migrationsFolder: "./drizzle" });
await migrationClient.end();
logger.info("migrations applied");
