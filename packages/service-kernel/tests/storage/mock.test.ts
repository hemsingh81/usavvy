import { describe, expect, it } from "vitest";
import { createMockStorageAdapter } from "../../src/storage/mock.js";

describe("createMockStorageAdapter", () => {
  it("round-trips a put object through get", async () => {
    const adapter = createMockStorageAdapter();
    const data = Buffer.from("hello");

    await adapter.putObject("key-1", data, "text/plain");

    await expect(adapter.getObject("key-1")).resolves.toEqual(data);
  });

  it("throws for a key that was never stored", async () => {
    const adapter = createMockStorageAdapter();

    await expect(adapter.getObject("missing")).rejects.toThrow();
  });

  it("deleteObject removes the stored object", async () => {
    const adapter = createMockStorageAdapter();
    await adapter.putObject("key-1", Buffer.from("hello"), "text/plain");

    await adapter.deleteObject("key-1");

    await expect(adapter.getObject("key-1")).rejects.toThrow();
  });
});
