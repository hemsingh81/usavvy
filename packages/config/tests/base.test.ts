import { describe, expect, it } from "vitest";
import { loadBaseServiceConfig } from "../src/base.js";

describe("loadBaseServiceConfig", () => {
  it("applies the default PORT when no env var is set", () => {
    const cfg = loadBaseServiceConfig({});
    expect(cfg.port).toBe(3000);
  });

  it("reads PORT from the given env object", () => {
    const cfg = loadBaseServiceConfig({ PORT: "4000" });
    expect(cfg.port).toBe(4000);
  });

  it("throws a descriptive error when PORT is not a number", () => {
    expect(() => loadBaseServiceConfig({ PORT: "not-a-number" })).toThrow();
  });
});
