import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "../src/logger.js";

describe("createLogger", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("logs structured JSON with level, module, message, and context on info()", () => {
    const logger = createLogger("gateway");
    logger.info("boot complete", { port: 3000 });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(logSpy.mock.calls[0]?.[0] as string);
    expect(payload).toMatchObject({ level: "info", module: "gateway", message: "boot complete", port: 3000 });
    expect(typeof payload.timestamp).toBe("string");
  });

  it("logs structured JSON to stderr on error(), never swallowing the message (AD-17: no silent failures)", () => {
    const logger = createLogger("core");
    logger.error("db ping failed", { reason: "ECONNREFUSED" });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(errorSpy.mock.calls[0]?.[0] as string);
    expect(payload).toMatchObject({ level: "error", module: "core", message: "db ping failed", reason: "ECONNREFUSED" });
  });

  it("never throws when the context is not JSON-serializable, falling back to a safe payload (Review finding)", () => {
    const logger = createLogger("core");
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => logger.error("boom", { circular })).not.toThrow();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(errorSpy.mock.calls[0]?.[0] as string);
    expect(payload).toMatchObject({ level: "error", module: "core", message: "boom", contextSerializationFailed: true });
  });
});
