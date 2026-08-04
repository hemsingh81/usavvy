import { describe, expect, it, vi } from "vitest";
import { pingDb } from "../src/db.js";
import { createLogger } from "../src/logger.js";

describe("pingDb", () => {
  it("returns true when the query executor resolves", async () => {
    const execute = vi.fn().mockResolvedValue([{ ok: 1 }]);
    const logger = createLogger("test");
    const result = await pingDb(execute, logger);
    expect(result).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("returns false and logs, never throws, when the query executor rejects (AD-17: no silent failures)", async () => {
    const execute = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const logger = createLogger("test");
    const errorSpy = vi.spyOn(logger, "error");

    const result = await pingDb(execute, logger);

    expect(result).toBe(false);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]?.[0]).toBe("db ping failed");
  });
});
