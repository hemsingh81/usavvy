import { describe, expect, it } from "vitest";
import { withTimeout } from "../src/timeout.js";

describe("withTimeout", () => {
  it("resolves with the underlying promise's value when it settles before the timeout", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 1000)).resolves.toBe("ok");
  });

  it("rejects with the underlying promise's error when it rejects before the timeout", async () => {
    await expect(withTimeout(Promise.reject(new Error("boom")), 1000)).rejects.toThrow("boom");
  });

  it("rejects with a timeout error when the promise never settles in time", async () => {
    const neverSettles = new Promise(() => undefined);
    await expect(withTimeout(neverSettles, 10)).rejects.toThrow(/timed out after 10ms/);
  });
});
