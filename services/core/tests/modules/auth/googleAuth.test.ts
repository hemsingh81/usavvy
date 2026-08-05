import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import argon2 from "argon2";
import { createDb, type Db } from "../../../src/db/client.js";
import { users } from "../../../src/db/schema.js";
import { loadCoreConfig } from "../../../src/config.js";

// Review finding (Acceptance Auditor): googleAuth's new-user and existing-email-linking
// paths had zero test coverage — the module-level `oauthClient` singleton meant there
// was no way to stub `verifyIdToken`'s success path without hitting live Google
// infrastructure with a real token. Mocking the module (rather than refactoring to
// inject the client) is the minimal fix that doesn't touch production code shape.
// vi.mock's factory is hoisted above module-scope declarations, so the mock fn it
// references must be created via vi.hoisted() rather than a plain `const`. OAuth2Client
// is invoked with `new` in production code, so the mock must be a real constructible
// class, not an arrow-function mockImplementation.
const { verifyIdToken } = vi.hoisted(() => ({ verifyIdToken: vi.fn() }));
vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    verifyIdToken = verifyIdToken;
  },
}));

const { googleAuth } = await import("../../../src/modules/auth/service.js");

const config = loadCoreConfig(process.env);
const sql = postgres(config.databaseUrl);
let db: Db;
const createdEmails: string[] = [];

beforeAll(() => {
  db = createDb(sql);
});

afterEach(async () => {
  vi.clearAllMocks();
  while (createdEmails.length > 0) {
    const email = createdEmails.pop();
    if (email) await db.delete(users).where(eq(users.email, email));
  }
});

afterAll(async () => {
  await sql.end();
});

function uniqueEmail(label: string): string {
  const email = `google-auth-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  createdEmails.push(email);
  return email;
}

function mockPayload(payload: { sub: string; email?: string; email_verified?: boolean } | undefined): void {
  verifyIdToken.mockResolvedValue({ getPayload: () => payload });
}

describe("googleAuth", () => {
  it("rejects an unparseable/invalid ID token", async () => {
    verifyIdToken.mockRejectedValue(new Error("invalid token"));

    await expect(googleAuth(db, "some-client-id.apps.googleusercontent.com", { idToken: "not-a-real-jwt" })).rejects.toMatchObject({
      code: "INVALID_GOOGLE_TOKEN",
      statusCode: 401,
    });
  });

  it("rejects a token whose email_verified claim is not true (review finding: account-takeover vector)", async () => {
    const email = uniqueEmail("unverified");
    mockPayload({ sub: "google-sub-unverified", email, email_verified: false });

    await expect(googleAuth(db, "client-id", { idToken: "a-token" })).rejects.toMatchObject({
      code: "INVALID_GOOGLE_TOKEN",
      statusCode: 401,
    });
  });

  it("creates a new pre-verified user for a first-time Google sign-in", async () => {
    const email = uniqueEmail("new");
    mockPayload({ sub: "google-sub-new", email, email_verified: true });

    const summary = await googleAuth(db, "client-id", { idToken: "a-token" });

    expect(summary.email).toBe(email);
    const [user] = await db.select().from(users).where(eq(users.email, email));
    expect(user?.googleId).toBe("google-sub-new");
    expect(user?.emailVerifiedAt).not.toBeNull();
    expect(user?.role).toBe("student");
  });

  it("returns the existing user on a repeat sign-in matched by googleId", async () => {
    const email = uniqueEmail("repeat");
    mockPayload({ sub: "google-sub-repeat", email, email_verified: true });
    const first = await googleAuth(db, "client-id", { idToken: "a-token" });

    const second = await googleAuth(db, "client-id", { idToken: "a-token" });

    expect(second.id).toBe(first.id);
  });

  it("links the Google account to an existing email+password account rather than creating a duplicate", async () => {
    const email = uniqueEmail("link");
    const [existing] = await db.insert(users).values({ email, passwordHash: await argon2.hash("x") }).returning();
    mockPayload({ sub: "google-sub-link", email, email_verified: true });

    const summary = await googleAuth(db, "client-id", { idToken: "a-token" });

    expect(summary.id).toBe(existing!.id);
    const [linked] = await db.select().from(users).where(eq(users.id, existing!.id));
    expect(linked?.googleId).toBe("google-sub-link");
    expect(linked?.emailVerifiedAt).not.toBeNull();
  });
});
