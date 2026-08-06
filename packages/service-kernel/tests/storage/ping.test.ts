import { afterEach, describe, expect, it, vi } from "vitest";
import { pingStorage } from "../../src/storage/ping.js";
import { createLogger } from "../../src/logger.js";

describe("pingStorage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns true when the storage endpoint responds at all (even a non-2xx response proves reachability)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 403 } as Response);
    vi.stubGlobal("fetch", fetchMock);
    const logger = createLogger("test");

    const result = await pingStorage("http://localhost:8333", logger);

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8333", expect.any(Object));
  });

  it("passes an AbortSignal so a hung request cannot wait forever (Review finding: no timeout)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200 } as Response);
    vi.stubGlobal("fetch", fetchMock);
    const logger = createLogger("test");

    await pingStorage("http://localhost:8333", logger);

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns false and logs, never throws, when the fetch itself fails (AD-17: no silent failures)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    vi.stubGlobal("fetch", fetchMock);
    const logger = createLogger("test");
    const errorSpy = vi.spyOn(logger, "error");

    const result = await pingStorage("http://localhost:8333", logger);

    expect(result).toBe(false);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]?.[0]).toBe("storage ping failed");
  });
});
