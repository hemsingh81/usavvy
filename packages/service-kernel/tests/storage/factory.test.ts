import { describe, expect, it } from "vitest";
import { createStorageAdapter } from "../../src/storage/factory.js";
import { createLogger } from "../../src/logger.js";

describe("createStorageAdapter", () => {
  it("returns a working mock adapter for 'mock'", async () => {
    const adapter = createStorageAdapter("mock", "http://localhost:8333", "uploads", createLogger("test"));

    await adapter.putObject("k", Buffer.from("v"), "text/plain");

    await expect(adapter.getObject("k")).resolves.toEqual(Buffer.from("v"));
  });

  it("returns a seaweedfs adapter for 'seaweedfs' that targets the given endpoint/bucket", async () => {
    const adapter = createStorageAdapter("seaweedfs", "http://localhost:8333", "uploads", createLogger("test"));

    expect(adapter).toEqual(
      expect.objectContaining({ putObject: expect.any(Function), getObject: expect.any(Function), deleteObject: expect.any(Function) }),
    );
  });
});
