import { defineConfig } from "drizzle-kit";

// drizzle-kit's CLI runs outside the app's own boot path (no --env-file-if-exists
// wrapper), so this falls back to the same dev default services/core/src/config.ts
// uses rather than sharing its zod loader — set DATABASE_URL in your shell if you need
// to point `db:generate` at something else.
const databaseUrl = process.env.DATABASE_URL ?? "postgres://usavvy:usavvy@localhost:5433/usavvy_core";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: databaseUrl },
});
