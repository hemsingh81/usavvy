import { defineConfig } from "drizzle-kit";

// drizzle-kit's CLI runs outside the app's own boot path — falls back to the same dev
// default services/courses/src/config.ts uses rather than sharing its zod loader.
const databaseUrl = process.env.DATABASE_URL ?? "postgres://usavvy:usavvy@localhost:5433/usavvy_courses";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: databaseUrl },
});
