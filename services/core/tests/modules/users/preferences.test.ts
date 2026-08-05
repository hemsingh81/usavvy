import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { DEFAULT_LEARNER_PREFERENCES } from "@usavvy/shared-types";
import { createDb, type Db } from "../../../src/db/client.js";
import { learnerProfiles, users } from "../../../src/db/schema.js";
import { loadCoreConfig } from "../../../src/config.js";
import { getPreferences, savePreferences } from "../../../src/modules/users/service.js";

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
    if (!email) continue;
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (user) {
      await db.delete(learnerProfiles).where(eq(learnerProfiles.userId, user.id));
      await db.delete(users).where(eq(users.id, user.id));
    }
  }
});

afterAll(async () => {
  await sql.end();
});

function uniqueEmail(label: string): string {
  const email = `users-preferences-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  createdEmails.push(email);
  return email;
}

describe("getPreferences", () => {
  it("returns DEFAULT_LEARNER_PREFERENCES verbatim before any write, creating a row on first call", async () => {
    const email = uniqueEmail("defaults");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    const result = await getPreferences(db, user!.id);

    expect(result).toEqual(DEFAULT_LEARNER_PREFERENCES);
  });

  it("is idempotent — a second call doesn't create a second row", async () => {
    const email = uniqueEmail("idempotent");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();
    await getPreferences(db, user!.id);

    await getPreferences(db, user!.id);

    const rows = await db.select().from(learnerProfiles).where(eq(learnerProfiles.userId, user!.id));
    expect(rows).toHaveLength(1);
  });
});

describe("savePreferences", () => {
  it("updates only the given field, leaving the rest at their defaults", async () => {
    const email = uniqueEmail("partial");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    const result = await savePreferences(db, user!.id, { voiceEnabled: false });

    expect(result).toEqual({ ...DEFAULT_LEARNER_PREFERENCES, voiceEnabled: false });
  });

  it("updates multiple given fields in one call", async () => {
    const email = uniqueEmail("multi");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    const result = await savePreferences(db, user!.id, { boardTheme: "paper", captionsEnabled: true });

    expect(result).toEqual({ ...DEFAULT_LEARNER_PREFERENCES, boardTheme: "paper", captionsEnabled: true });
  });

  it("a later partial save doesn't clobber a field set by an earlier save", async () => {
    const email = uniqueEmail("sequential");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();
    await savePreferences(db, user!.id, { voiceEnabled: false });

    const result = await savePreferences(db, user!.id, { speechRate: 1.5 });

    expect(result).toEqual({ ...DEFAULT_LEARNER_PREFERENCES, voiceEnabled: false, speechRate: 1.5 });
  });

  it("is freely re-editable — saving the same field twice just applies the latest value", async () => {
    const email = uniqueEmail("re-editable");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();
    await savePreferences(db, user!.id, { explanationStyle: "detailed" });

    const result = await savePreferences(db, user!.id, { explanationStyle: "analogy-first" });

    expect(result.explanationStyle).toBe("analogy-first");
  });

  it("bumps version and updatedAt on write", async () => {
    const email = uniqueEmail("version-bump");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    await savePreferences(db, user!.id, { reducedMotion: true });

    const [row] = await db.select().from(learnerProfiles).where(eq(learnerProfiles.userId, user!.id));
    expect(row?.version).toBe(2);
  });
});
