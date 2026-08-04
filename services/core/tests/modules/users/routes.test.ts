import { afterAll, afterEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { buildApp } from "../../../src/app.js";
import { createDb } from "../../../src/db/client.js";
import { users } from "../../../src/db/schema.js";
import { loadCoreConfig } from "../../../src/config.js";
import { createTestAppDeps } from "../../testHelpers.js";

const config = loadCoreConfig(process.env);
const sql = postgres(config.databaseUrl);
const db = createDb(sql);
const createdEmails: string[] = [];

afterEach(async () => {
  while (createdEmails.length > 0) {
    const email = createdEmails.pop();
    if (email) await db.delete(users).where(eq(users.email, email));
  }
});

afterAll(async () => {
  await sql.end();
});

describe("GET /me", () => {
  it("returns the user's shape when trusted headers are present (set only by gateway)", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const email = `users-routes-${Date.now()}@example.com`;
    createdEmails.push(email);
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    const response = await app.inject({ method: "GET", url: "/me", headers: { "x-user-id": user!.id, "x-user-role": "student" } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: user!.id, email, emailVerified: true, role: "student" });
    await app.close();
  });

  it("returns 401 when the trusted headers are missing", async () => {
    const app = buildApp(createTestAppDeps({ db }));

    const response = await app.inject({ method: "GET", url: "/me" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
    await app.close();
  });

  it("returns 401 when x-user-role is not a recognized role", async () => {
    const app = buildApp(createTestAppDeps({ db }));

    const response = await app.inject({
      method: "GET",
      url: "/me",
      headers: { "x-user-id": "00000000-0000-0000-0000-000000000000", "x-user-role": "not-a-real-role" },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });
});
