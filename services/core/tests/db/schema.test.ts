import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "../../src/db/client.js";
import { emailVerificationTokens, users } from "../../src/db/schema.js";
import { loadCoreConfig } from "../../src/config.js";

// Integration test against the real docker-compose Postgres (AD-11) — constraints like
// unique/FK are enforced by the database itself, not meaningfully testable against a mock.
const config = loadCoreConfig(process.env);
const sql = postgres(config.databaseUrl);
let db: Db;

beforeAll(() => {
  db = createDb(sql);
});

afterAll(async () => {
  await sql.end();
});

describe("users/email_verification_tokens schema", () => {
  it("generates a UUIDv7 id and applies defaults", async () => {
    const email = `schema-test-${Date.now()}@example.com`;
    const [row] = await db.insert(users).values({ email }).returning();
    try {
      expect(row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
      expect(row.role).toBe("student");
      expect(row.emailVerifiedAt).toBeNull();
      expect(row.version).toBe(1);
    } finally {
      await db.delete(users).where(eq(users.id, row.id));
    }
  });

  it("rejects a duplicate email", async () => {
    const email = `schema-test-dup-${Date.now()}@example.com`;
    const [row] = await db.insert(users).values({ email }).returning();
    try {
      await expect(db.insert(users).values({ email })).rejects.toThrow();
    } finally {
      await db.delete(users).where(eq(users.id, row.id));
    }
  });

  it("rejects an email_verification_tokens row referencing a nonexistent user", async () => {
    await expect(
      db.insert(emailVerificationTokens).values({
        userId: "00000000-0000-0000-0000-000000000000",
        tokenHash: `nonexistent-fk-${Date.now()}`,
        expiresAt: new Date(Date.now() + 86_400_000),
      }),
    ).rejects.toThrow();
  });

  it("cascades no orphaned reads — a token row for a real user is retrievable by user id", async () => {
    const email = `schema-test-token-${Date.now()}@example.com`;
    const [user] = await db.insert(users).values({ email }).returning();
    try {
      const [token] = await db
        .insert(emailVerificationTokens)
        .values({ userId: user.id, tokenHash: `hash-${Date.now()}`, expiresAt: new Date(Date.now() + 86_400_000) })
        .returning();
      const found = await db.select().from(emailVerificationTokens).where(eq(emailVerificationTokens.userId, user.id));
      expect(found).toHaveLength(1);
      expect(found[0].id).toBe(token.id);
    } finally {
      await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, user.id));
      await db.delete(users).where(eq(users.id, user.id));
    }
  });
});
