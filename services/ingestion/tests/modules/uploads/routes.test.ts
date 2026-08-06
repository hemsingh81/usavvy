import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { buildApp } from "../../../src/app.js";
import { createDb, type Db } from "../../../src/db/client.js";
import { uploadedDocuments } from "../../../src/db/schema.js";
import { loadIngestionConfig } from "../../../src/config.js";
import { buildMultipartBody, createTestAppDeps, TEST_INTERNAL_SECRET } from "../../testHelpers.js";

const config = loadIngestionConfig(process.env);
const sql = postgres(config.databaseUrl);
let db: Db;

const OWNER_ID = "test-owner-routes";
const internalHeaders = { "x-internal-secret": TEST_INTERNAL_SECRET };
const learnerHeaders = { ...internalHeaders, "x-user-id": OWNER_ID, "x-user-role": "student" };

beforeAll(() => {
  db = createDb(sql);
});

afterEach(async () => {
  await db.delete(uploadedDocuments).where(eq(uploadedDocuments.ownerId, OWNER_ID));
});

afterAll(async () => {
  await sql.end();
});

describe("POST /uploads", () => {
  it("rejects without the internal service secret", async () => {
    const app = buildApp(createTestAppDeps({ db }));

    const response = await app.inject({ method: "POST", url: "/uploads", headers: { "x-user-id": OWNER_ID, "x-user-role": "student" } });

    expect(response.statusCode).toBe(401);
  });

  it("rejects without a trusted user (no x-user-id)", async () => {
    const app = buildApp(createTestAppDeps({ db }));

    const response = await app.inject({ method: "POST", url: "/uploads", headers: internalHeaders });

    expect(response.statusCode).toBe(401);
  });

  it("accepts a valid attested PDF upload and returns the stored document (AC #1)", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const { body, contentType } = buildMultipartBody(
      [{ name: "copyrightAttested", value: "true" }],
      { fieldName: "file", filename: "notes.pdf", contentType: "application/pdf", content: Buffer.from("%PDF-1.4 fake") },
    );

    const response = await app.inject({
      method: "POST",
      url: "/uploads",
      headers: { ...learnerHeaders, "content-type": contentType },
      payload: body,
    });

    expect(response.statusCode).toBe(201);
    const parsed = response.json();
    expect(parsed.fileName).toBe("notes.pdf");
    expect(parsed.status).toBe("queued");
  });

  it("blocks the upload when the attestation field is missing (AC #4)", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const { body, contentType } = buildMultipartBody([], {
      fieldName: "file",
      filename: "notes.txt",
      contentType: "text/plain",
      content: Buffer.from("hello"),
    });

    const response = await app.inject({
      method: "POST",
      url: "/uploads",
      headers: { ...learnerHeaders, "content-type": contentType },
      payload: body,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an unsupported file type through the real route (AC #2)", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const { body, contentType } = buildMultipartBody(
      [{ name: "copyrightAttested", value: "true" }],
      { fieldName: "file", filename: "virus.exe", contentType: "application/octet-stream", content: Buffer.from("x") },
    );

    const response = await app.inject({
      method: "POST",
      url: "/uploads",
      headers: { ...learnerHeaders, "content-type": contentType },
      payload: body,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toContain("unsupported file type");
  });

  it("rejects a genuinely oversized file with a clean 400, not a raw 500 (review finding)", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const oversized = Buffer.alloc(50 * 1024 * 1024 + 1024);
    const { body, contentType } = buildMultipartBody(
      [{ name: "copyrightAttested", value: "true" }],
      { fieldName: "file", filename: "huge.txt", contentType: "text/plain", content: oversized },
    );

    const response = await app.inject({
      method: "POST",
      url: "/uploads",
      headers: { ...learnerHeaders, "content-type": contentType },
      payload: body,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR", message: expect.stringContaining("50 MB") } });
  });

  it("rejects a malformed customCourseId field with a clean 400, not a raw 500 (review finding)", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const { body, contentType } = buildMultipartBody(
      [{ name: "customCourseId", value: "not-a-uuid" }, { name: "copyrightAttested", value: "true" }],
      { fieldName: "file", filename: "notes.txt", contentType: "text/plain", content: Buffer.from("hello") },
    );

    const response = await app.inject({
      method: "POST",
      url: "/uploads",
      headers: { ...learnerHeaders, "content-type": contentType },
      payload: body,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /uploads", () => {
  it("rejects without the internal service secret", async () => {
    const app = buildApp(createTestAppDeps({ db }));

    const response = await app.inject({
      method: "GET",
      url: "/uploads?customCourseId=019fd450-b7cb-7a32-b021-42788045c71f",
      headers: { "x-user-id": OWNER_ID, "x-user-role": "student" },
    });

    expect(response.statusCode).toBe(401);
  });

  it("rejects a malformed customCourseId", async () => {
    const app = buildApp(createTestAppDeps({ db }));

    const response = await app.inject({ method: "GET", url: "/uploads?customCourseId=not-a-uuid", headers: learnerHeaders });

    expect(response.statusCode).toBe(400);
  });

  it("returns the caller's uploaded documents for the given customCourseId", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const { body, contentType } = buildMultipartBody(
      [{ name: "copyrightAttested", value: "true" }],
      { fieldName: "file", filename: "a.txt", contentType: "text/plain", content: Buffer.from("hi") },
    );
    const uploadResponse = await app.inject({
      method: "POST",
      url: "/uploads",
      headers: { ...learnerHeaders, "content-type": contentType },
      payload: body,
    });
    const uploaded = uploadResponse.json();

    const response = await app.inject({
      method: "GET",
      url: `/uploads?customCourseId=${uploaded.customCourseId}`,
      headers: learnerHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
  });
});
