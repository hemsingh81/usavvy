import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { createMockJobQueueAdapter, createMockStorageAdapter } from "@usavvy/service-kernel";
import { createDb, type Db } from "../../../src/db/client.js";
import { uploadedDocuments } from "../../../src/db/schema.js";
import { loadIngestionConfig } from "../../../src/config.js";
import {
  getPdfPageCount,
  importFromUrl,
  importPastedText,
  listUploadedDocuments,
  MAX_FILES_PER_CUSTOM_COURSE,
  stripHtmlToReadableText,
  uploadDocument,
} from "../../../src/modules/uploads/service.js";

const config = loadIngestionConfig(process.env);
const sql = postgres(config.databaseUrl);
let db: Db;

const OWNER_ID = "test-owner-service";

beforeAll(() => {
  db = createDb(sql);
});

afterEach(async () => {
  await db.delete(uploadedDocuments).where(eq(uploadedDocuments.ownerId, OWNER_ID));
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await sql.end();
});

function deps() {
  return { db, storagePort: createMockStorageAdapter(), jobQueuePort: createMockJobQueueAdapter() };
}

describe("uploadDocument", () => {
  it("accepts a valid PDF, stores it, and queues it for ingestion (AC #1)", async () => {
    const d = deps();

    const result = await uploadDocument(d, OWNER_ID, {
      customCourseId: undefined,
      fileName: "notes.pdf",
      buffer: Buffer.from("%PDF-1.4 fake"),
      copyrightAttested: true,
    });

    expect(result.fileName).toBe("notes.pdf");
    expect(result.fileType).toBe("pdf");
    expect(result.status).toBe("queued");
    expect(result.customCourseId).toEqual(expect.any(String));
    expect(d.jobQueuePort.enqueuedJobs).toEqual([
      { jobName: "ingest-document", payload: { uploadedDocumentId: result.id } },
    ]);
  });

  it("mints a fresh customCourseId when none is supplied, and reuses one when supplied", async () => {
    const d = deps();

    const first = await uploadDocument(d, OWNER_ID, {
      customCourseId: undefined,
      fileName: "a.txt",
      buffer: Buffer.from("hello"),
      copyrightAttested: true,
    });
    const second = await uploadDocument(d, OWNER_ID, {
      customCourseId: first.customCourseId,
      fileName: "b.txt",
      buffer: Buffer.from("world"),
      copyrightAttested: true,
    });

    expect(second.customCourseId).toBe(first.customCourseId);
  });

  it("blocks the upload before any storage/DB write when attestation is unchecked (AC #4)", async () => {
    const d = deps();
    // Review finding: the original version of this test only queried an unrelated,
    // hardcoded customCourseId (a failed attestation check never mints or receives
    // one) — it proved nothing about THIS call's own side effects. Spying directly on
    // the storage/queue adapters is the only way to prove they were genuinely never
    // invoked, not just that some other row doesn't exist.
    const putObjectSpy = vi.spyOn(d.storagePort, "putObject");
    const enqueueSpy = vi.spyOn(d.jobQueuePort, "enqueue");
    const countBefore = (await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.ownerId, OWNER_ID))).length;

    await expect(
      uploadDocument(d, OWNER_ID, { customCourseId: undefined, fileName: "a.txt", buffer: Buffer.from("hello"), copyrightAttested: false }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(putObjectSpy).not.toHaveBeenCalled();
    expect(enqueueSpy).not.toHaveBeenCalled();
    const countAfter = (await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.ownerId, OWNER_ID))).length;
    expect(countAfter).toBe(countBefore);
  });

  it("rejects an unsupported file type, naming the violated limit (AC #2)", async () => {
    const d = deps();

    await expect(
      uploadDocument(d, OWNER_ID, { customCourseId: undefined, fileName: "a.exe", buffer: Buffer.from("x"), copyrightAttested: true }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", message: expect.stringContaining("unsupported file type") });
  });

  it("rejects a file exceeding the 50 MB limit, naming the violated limit (AC #2)", async () => {
    const d = deps();
    const oversized = Buffer.alloc(50 * 1024 * 1024 + 1);

    await expect(
      uploadDocument(d, OWNER_ID, { customCourseId: undefined, fileName: "big.txt", buffer: oversized, copyrightAttested: true }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", message: expect.stringContaining("50 MB") });
  });

  it("rejects a PDF exceeding the 300 page limit, naming the violated limit (AC #2)", async () => {
    const d = deps();
    const manyPagesPdf = Buffer.from("%PDF-1.4 " + "/Type /Page ".repeat(301));

    await expect(
      uploadDocument(d, OWNER_ID, { customCourseId: undefined, fileName: "huge.pdf", buffer: manyPagesPdf, copyrightAttested: true }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", message: expect.stringContaining("300 page") });
  });

  it("does not apply the page limit to non-PDF formats", async () => {
    const d = deps();
    const longText = Buffer.from("word ".repeat(100000));

    await expect(
      uploadDocument(d, OWNER_ID, { customCourseId: undefined, fileName: "long.txt", buffer: longText, copyrightAttested: true }),
    ).resolves.toMatchObject({ status: "queued" });
  });

  it("blocks an 11th file with the 10-file-per-course limit message, while other valid files in the batch still succeeded (AC #2, #3)", async () => {
    const d = deps();
    let customCourseId: string | undefined;
    for (let i = 0; i < MAX_FILES_PER_CUSTOM_COURSE; i++) {
      const result = await uploadDocument(d, OWNER_ID, {
        customCourseId,
        fileName: `file-${i}.txt`,
        buffer: Buffer.from(`content ${i}`),
        copyrightAttested: true,
      });
      customCourseId = result.customCourseId;
    }

    await expect(
      uploadDocument(d, OWNER_ID, { customCourseId, fileName: "file-11.txt", buffer: Buffer.from("x"), copyrightAttested: true }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", message: expect.stringContaining("10-file-per-course limit") });

    const rows = await listUploadedDocuments(db, OWNER_ID, customCourseId as string);
    expect(rows).toHaveLength(MAX_FILES_PER_CUSTOM_COURSE);
  });

  it("never lets concurrent uploads exceed the 10-file-per-course limit (review finding: TOCTOU race)", async () => {
    const d = deps();
    const customCourseId = randomUUID();

    const results = await Promise.allSettled(
      Array.from({ length: 15 }, (_, i) =>
        uploadDocument(d, OWNER_ID, { customCourseId, fileName: `race-${i}.txt`, buffer: Buffer.from(`content ${i}`), copyrightAttested: true }),
      ),
    );

    const succeeded = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(succeeded).toHaveLength(MAX_FILES_PER_CUSTOM_COURSE);
    expect(rejected).toHaveLength(15 - MAX_FILES_PER_CUSTOM_COURSE);

    const rows = await listUploadedDocuments(db, OWNER_ID, customCourseId);
    expect(rows).toHaveLength(MAX_FILES_PER_CUSTOM_COURSE);
  });

  it("a rejected file in a batch does not block a subsequent valid file for the same customCourseId (AC #2)", async () => {
    const d = deps();
    const first = await uploadDocument(d, OWNER_ID, {
      customCourseId: undefined,
      fileName: "good.txt",
      buffer: Buffer.from("hello"),
      copyrightAttested: true,
    });

    await expect(
      uploadDocument(d, OWNER_ID, {
        customCourseId: first.customCourseId,
        fileName: "bad.exe",
        buffer: Buffer.from("x"),
        copyrightAttested: true,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const second = await uploadDocument(d, OWNER_ID, {
      customCourseId: first.customCourseId,
      fileName: "good2.txt",
      buffer: Buffer.from("world"),
      copyrightAttested: true,
    });
    expect(second.customCourseId).toBe(first.customCourseId);

    const rows = await listUploadedDocuments(db, OWNER_ID, first.customCourseId);
    expect(rows.map((r) => r.fileName).sort()).toEqual(["good.txt", "good2.txt"]);
  });
});

describe("getPdfPageCount", () => {
  it("counts /Type /Page markers but not /Type /Pages", () => {
    const buffer = Buffer.from("/Type /Page /Type /Page /Type /Pages");
    expect(getPdfPageCount(buffer)).toBe(2);
  });
});

describe("listUploadedDocuments", () => {
  it("never returns another learner's documents", async () => {
    const d = deps();
    const mine = await uploadDocument(d, OWNER_ID, {
      customCourseId: undefined,
      fileName: "mine.txt",
      buffer: Buffer.from("x"),
      copyrightAttested: true,
    });
    await uploadDocument(d, "someone-else", {
      customCourseId: mine.customCourseId,
      fileName: "theirs.txt",
      buffer: Buffer.from("y"),
      copyrightAttested: true,
    });

    const rows = await listUploadedDocuments(db, OWNER_ID, mine.customCourseId);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.fileName).toBe("mine.txt");

    await db.delete(uploadedDocuments).where(eq(uploadedDocuments.ownerId, "someone-else"));
  });

  it("returns an empty list for a customCourseId the caller doesn't own, never a 403", async () => {
    const rows = await listUploadedDocuments(db, OWNER_ID, "019fd450-b7cb-7a32-b021-42788045c71f");
    expect(rows).toEqual([]);
  });
});

const LONG_ENOUGH_TEXT = "This is a paragraph with clearly more than ten words in it for testing purposes.";

describe("importPastedText", () => {
  it("stores pasted text as a queued UploadedDocument (AC #1)", async () => {
    const d = deps();

    const result = await importPastedText(d, OWNER_ID, { customCourseId: undefined, text: LONG_ENOUGH_TEXT, copyrightAttested: true });

    expect(result.fileName).toBe("pasted-text.txt");
    expect(result.fileType).toBe("txt");
    expect(result.status).toBe("queued");
    expect(d.jobQueuePort.enqueuedJobs).toEqual([{ jobName: "ingest-document", payload: { uploadedDocumentId: result.id } }]);
  });

  it("rejects text below the minimum word count, naming the reason (AC #4)", async () => {
    const d = deps();

    await expect(importPastedText(d, OWNER_ID, { customCourseId: undefined, text: "too short", copyrightAttested: true })).rejects.toMatchObject(
      { code: "VALIDATION_ERROR", message: expect.stringContaining("not enough content") },
    );
  });

  it("blocks before any storage/DB write when attestation is unchecked (AC #1's shared attestation requirement)", async () => {
    const d = deps();
    const putObjectSpy = vi.spyOn(d.storagePort, "putObject");
    const enqueueSpy = vi.spyOn(d.jobQueuePort, "enqueue");

    await expect(
      importPastedText(d, OWNER_ID, { customCourseId: undefined, text: LONG_ENOUGH_TEXT, copyrightAttested: false }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(putObjectSpy).not.toHaveBeenCalled();
    expect(enqueueSpy).not.toHaveBeenCalled();
  });

  it("counts toward the same customCourseId's 10-file limit alongside file uploads", async () => {
    const d = deps();
    const fileResult = await uploadDocument(d, OWNER_ID, {
      customCourseId: undefined,
      fileName: "a.txt",
      buffer: Buffer.from("hello"),
      copyrightAttested: true,
    });

    const pasteResult = await importPastedText(d, OWNER_ID, {
      customCourseId: fileResult.customCourseId,
      text: LONG_ENOUGH_TEXT,
      copyrightAttested: true,
    });

    expect(pasteResult.customCourseId).toBe(fileResult.customCourseId);
    const rows = await listUploadedDocuments(db, OWNER_ID, fileResult.customCourseId);
    expect(rows).toHaveLength(2);
  });
});

function htmlResponse(status: number, body: string): Response {
  return { ok: status >= 200 && status < 300, status, text: () => Promise.resolve(body) } as unknown as Response;
}

describe("importFromUrl", () => {
  it("fetches and stores a page's extracted text as a queued UploadedDocument (AC #2)", async () => {
    const d = deps();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(htmlResponse(200, `<html><body><script>ignored()</script><p>${LONG_ENOUGH_TEXT}</p></body></html>`)),
    );

    const result = await importFromUrl(d, OWNER_ID, { customCourseId: undefined, url: "https://example.com/article", copyrightAttested: true });

    expect(result.fileType).toBe("txt");
    expect(result.status).toBe("queued");
    expect(result.fileName).toContain("example.com");
  });

  it("rejects an invalid URL before ever calling fetch", async () => {
    const d = deps();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      importFromUrl(d, OWNER_ID, { customCourseId: undefined, url: "not-a-url", copyrightAttested: true }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", message: expect.stringContaining("invalid URL") });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an unreachable URL (network error/timeout) with a specific reason (AC #3)", async () => {
    const d = deps();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    await expect(
      importFromUrl(d, OWNER_ID, { customCourseId: undefined, url: "https://example.com/down", copyrightAttested: true }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", message: expect.stringContaining("unreachable") });
  });

  it("rejects a 403 response with 'access denied', distinct from other failures (AC #3)", async () => {
    const d = deps();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlResponse(403, "")));

    await expect(
      importFromUrl(d, OWNER_ID, { customCourseId: undefined, url: "https://example.com/forbidden", copyrightAttested: true }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", message: expect.stringContaining("access denied") });
  });

  it("rejects a 404/500 response with 'content could not be retrieved', distinct from access-denied (AC #3)", async () => {
    const d = deps();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlResponse(404, "")));

    await expect(
      importFromUrl(d, OWNER_ID, { customCourseId: undefined, url: "https://example.com/missing", copyrightAttested: true }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", message: expect.stringContaining("could not be retrieved") });
  });

  it("rejects a page whose extracted text is below the minimum, with the same message pasted-text uses (AC #3)", async () => {
    const d = deps();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlResponse(200, "<html><body><p>hi</p></body></html>")));

    await expect(
      importFromUrl(d, OWNER_ID, { customCourseId: undefined, url: "https://example.com/thin", copyrightAttested: true }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", message: expect.stringContaining("not enough content") });
  });

  it("never stores anything and never calls StoragePort/JobQueuePort on any rejection (AC #3: no partial document)", async () => {
    const d = deps();
    const putObjectSpy = vi.spyOn(d.storagePort, "putObject");
    const enqueueSpy = vi.spyOn(d.jobQueuePort, "enqueue");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlResponse(500, "")));

    await expect(
      importFromUrl(d, OWNER_ID, { customCourseId: undefined, url: "https://example.com/error", copyrightAttested: true }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(putObjectSpy).not.toHaveBeenCalled();
    expect(enqueueSpy).not.toHaveBeenCalled();
  });

  it("counts toward the same customCourseId's 10-file limit alongside file uploads and pasted text", async () => {
    const d = deps();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlResponse(200, `<p>${LONG_ENOUGH_TEXT}</p>`)));
    const fileResult = await uploadDocument(d, OWNER_ID, {
      customCourseId: undefined,
      fileName: "a.txt",
      buffer: Buffer.from("hello"),
      copyrightAttested: true,
    });

    const urlResult = await importFromUrl(d, OWNER_ID, {
      customCourseId: fileResult.customCourseId,
      url: "https://example.com/x",
      copyrightAttested: true,
    });

    expect(urlResult.customCourseId).toBe(fileResult.customCourseId);
    const rows = await listUploadedDocuments(db, OWNER_ID, fileResult.customCourseId);
    expect(rows).toHaveLength(2);
  });
});

describe("stripHtmlToReadableText", () => {
  it("strips script/style blocks and tags, collapsing whitespace", () => {
    const html = "<html><head><style>.a{color:red}</style></head><body><script>alert(1)</script><p>Hello   world</p></body></html>";
    expect(stripHtmlToReadableText(html)).toBe("Hello world");
  });
});
