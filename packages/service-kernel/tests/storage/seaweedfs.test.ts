import { afterEach, describe, expect, it, vi } from "vitest";
import { createSeaweedFsStorageAdapter } from "../../src/storage/seaweedfs.js";
import { createLogger } from "../../src/logger.js";

describe("createSeaweedFsStorageAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("putObject issues an unsigned PUT to endpoint/bucket/key with the given content-type and body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
    vi.stubGlobal("fetch", fetchMock);
    const adapter = createSeaweedFsStorageAdapter("http://localhost:8333", "uploads", createLogger("test"));
    const data = Buffer.from("hello");

    await adapter.putObject("doc-1.pdf", data, "application/pdf");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8333/uploads/doc-1.pdf",
      expect.objectContaining({ method: "PUT", body: data, headers: { "content-type": "application/pdf" } }),
    );
  });

  it("getObject issues a GET and returns the response body as a Buffer", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(new TextEncoder().encode("hello").buffer),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);
    const adapter = createSeaweedFsStorageAdapter("http://localhost:8333", "uploads", createLogger("test"));

    const result = await adapter.getObject("doc-1.pdf");

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8333/uploads/doc-1.pdf", expect.objectContaining({ method: "GET" }));
    expect(result).toEqual(Buffer.from("hello"));
  });

  it("deleteObject issues a DELETE", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 } as Response);
    vi.stubGlobal("fetch", fetchMock);
    const adapter = createSeaweedFsStorageAdapter("http://localhost:8333", "uploads", createLogger("test"));

    await adapter.deleteObject("doc-1.pdf");

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8333/uploads/doc-1.pdf", expect.objectContaining({ method: "DELETE" }));
  });

  it("throws and logs when the upstream response is not ok (AD-17: no silent failures)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response);
    vi.stubGlobal("fetch", fetchMock);
    const logger = createLogger("test");
    const errorSpy = vi.spyOn(logger, "error");
    const adapter = createSeaweedFsStorageAdapter("http://localhost:8333", "uploads", logger);

    await expect(adapter.putObject("doc-1.pdf", Buffer.from("x"), "text/plain")).rejects.toThrow();
    expect(errorSpy).toHaveBeenCalled();
  });
});
