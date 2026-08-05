import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "../../../src/db/client.js";
import { notifications, users } from "../../../src/db/schema.js";
import { loadCoreConfig } from "../../../src/config.js";
import { clearNotification, createNotification, listNotifications, markNotificationRead } from "../../../src/modules/users/service.js";
import { createMockNotificationPort } from "../../testHelpers.js";
import { createLogger } from "@usavvy/service-kernel";

const config = loadCoreConfig(process.env);
const sql = postgres(config.databaseUrl);
let db: Db;
const testLogger = createLogger("test");
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
      await db.delete(notifications).where(eq(notifications.userId, user.id));
      await db.delete(users).where(eq(users.id, user.id));
    }
  }
});

afterAll(async () => {
  await sql.end();
});

function uniqueEmail(label: string): string {
  const email = `users-notifications-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  createdEmails.push(email);
  return email;
}

describe("createNotification", () => {
  it("inserts a row and best-effort calls sendInApp", async () => {
    const email = uniqueEmail("create");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();
    const notificationPort = createMockNotificationPort();

    const result = await createNotification(db, notificationPort, testLogger, user!.id, {
      type: "account_deletion_requested",
      message: "Your account deletion is scheduled",
      sourceProcessType: "account_deletion",
      sourceProcessStatus: "in_progress",
    });

    expect(result).toMatchObject({
      type: "account_deletion_requested",
      message: "Your account deletion is scheduled",
      sourceProcessType: "account_deletion",
      sourceProcessStatus: "in_progress",
      readAt: null,
    });
    expect(notificationPort.sendInApp).toHaveBeenCalledWith(expect.objectContaining({ userId: user!.id, message: "Your account deletion is scheduled" }));
  });

  it("creates a notification with no source process (always clearable)", async () => {
    const email = uniqueEmail("no-process");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    const result = await createNotification(db, createMockNotificationPort(), testLogger, user!.id, {
      type: "info",
      message: "Just an FYI",
    });

    expect(result.sourceProcessType).toBeNull();
    expect(result.sourceProcessStatus).toBeNull();
  });

  it("does not throw when sendInApp fails (best-effort, logged not swallowed)", async () => {
    const email = uniqueEmail("sendinapp-fails");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();
    const notificationPort = createMockNotificationPort();
    notificationPort.sendInApp = async () => {
      throw new Error("in-app channel down");
    };

    await expect(
      createNotification(db, notificationPort, testLogger, user!.id, { type: "info", message: "still persisted" }),
    ).resolves.toMatchObject({ message: "still persisted" });
  });
});

describe("listNotifications", () => {
  it("returns notifications newest-first, scoped to the calling user only", async () => {
    const email = uniqueEmail("list");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();
    const otherEmail = uniqueEmail("list-other");
    const [otherUser] = await db.insert(users).values({ email: otherEmail, emailVerifiedAt: new Date() }).returning();
    const notificationPort = createMockNotificationPort();

    await createNotification(db, notificationPort, testLogger, user!.id, { type: "first", message: "first" });
    await createNotification(db, notificationPort, testLogger, user!.id, { type: "second", message: "second" });
    await createNotification(db, notificationPort, testLogger, otherUser!.id, { type: "not-mine", message: "not mine" });

    const result = await listNotifications(db, user!.id);

    expect(result).toHaveLength(2);
    expect(result[0]?.type).toBe("second");
    expect(result[1]?.type).toBe("first");
    expect(result.some((n) => n.type === "not-mine")).toBe(false);
  });
});

describe("markNotificationRead", () => {
  it("sets readAt and is idempotent on a second call", async () => {
    const email = uniqueEmail("mark-read");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();
    const created = await createNotification(db, createMockNotificationPort(), testLogger, user!.id, { type: "info", message: "read me" });

    const first = await markNotificationRead(db, user!.id, created.id);
    expect(first.readAt).not.toBeNull();

    const second = await markNotificationRead(db, user!.id, created.id);
    expect(second.readAt).not.toBeNull();
  });

  it("returns NOT_FOUND for another user's notification id (ownership check)", async () => {
    const email = uniqueEmail("mark-read-owner");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();
    const otherEmail = uniqueEmail("mark-read-other");
    const [otherUser] = await db.insert(users).values({ email: otherEmail, emailVerifiedAt: new Date() }).returning();
    const created = await createNotification(db, createMockNotificationPort(), testLogger, otherUser!.id, { type: "info", message: "not yours" });

    await expect(markNotificationRead(db, user!.id, created.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("clearNotification", () => {
  it("succeeds for a notification with no source process", async () => {
    const email = uniqueEmail("clear-no-process");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();
    const created = await createNotification(db, createMockNotificationPort(), testLogger, user!.id, { type: "info", message: "clear me" });

    await clearNotification(db, user!.id, created.id);

    const result = await listNotifications(db, user!.id);
    expect(result).toHaveLength(0);
  });

  it("succeeds for a resolved source process", async () => {
    const email = uniqueEmail("clear-resolved");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();
    const [created] = await db
      .insert(notifications)
      .values({ userId: user!.id, type: "info", message: "done", sourceProcessType: "account_deletion", sourceProcessStatus: "resolved" })
      .returning();

    await clearNotification(db, user!.id, created!.id);

    const result = await listNotifications(db, user!.id);
    expect(result).toHaveLength(0);
  });

  it("rejects (409) a notification whose source process is still in progress", async () => {
    const email = uniqueEmail("clear-in-progress");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();
    const created = await createNotification(db, createMockNotificationPort(), testLogger, user!.id, {
      type: "account_deletion_requested",
      message: "still going",
      sourceProcessType: "account_deletion",
      sourceProcessStatus: "in_progress",
    });

    await expect(clearNotification(db, user!.id, created.id)).rejects.toMatchObject({ code: "NOTIFICATION_STILL_IN_PROGRESS", statusCode: 409 });

    const result = await listNotifications(db, user!.id);
    expect(result).toHaveLength(1);
  });

  it("returns NOT_FOUND for another user's notification id (ownership check)", async () => {
    const email = uniqueEmail("clear-owner");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();
    const otherEmail = uniqueEmail("clear-other");
    const [otherUser] = await db.insert(users).values({ email: otherEmail, emailVerifiedAt: new Date() }).returning();
    const created = await createNotification(db, createMockNotificationPort(), testLogger, otherUser!.id, { type: "info", message: "not yours" });

    await expect(clearNotification(db, user!.id, created.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
