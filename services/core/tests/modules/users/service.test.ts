import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "../../../src/db/client.js";
import { users } from "../../../src/db/schema.js";
import { loadCoreConfig } from "../../../src/config.js";
import { getMe } from "../../../src/modules/users/service.js";

const config = loadCoreConfig(process.env);
const sql = postgres(config.databaseUrl);
let db: Db;
const createdEmails: string[] = [];

beforeAll(() => {
  db = createDb(sql);
});

afterEach(async () => {
  while (createdEmails.length > 0) {
    const email = createdEmails.pop();
    if (email) await db.delete(users).where(eq(users.email, email));
  }
});

afterAll(async () => {
  await sql.end();
});

describe("getMe", () => {
  it("returns the resolved user's shape for an allowed role", async () => {
    const email = `users-service-${Date.now()}@example.com`;
    createdEmails.push(email);
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    const me = await getMe(db, user!.id, "student");

    expect(me).toEqual({ id: user!.id, email, emailVerified: true, role: "student" });
  });

  it("reports emailVerified: false for an unverified user", async () => {
    const email = `users-service-unverified-${Date.now()}@example.com`;
    createdEmails.push(email);
    const [user] = await db.insert(users).values({ email }).returning();

    const me = await getMe(db, user!.id, "student");

    expect(me.emailVerified).toBe(false);
  });

  it("throws NOT_FOUND for a user id that doesn't exist", async () => {
    await expect(getMe(db, "00000000-0000-0000-0000-000000000000", "student")).rejects.toMatchObject({
      code: "NOT_FOUND",
      statusCode: 404,
    });
  });
});
