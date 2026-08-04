import { describe, expect, it } from "vitest";
import { loadServerConfig } from "../src/server.js";

describe("loadServerConfig", () => {
  it("applies defaults when no env vars are set", () => {
    const cfg = loadServerConfig({});
    expect(cfg.port).toBe(3001);
    expect(cfg.notificationAdapter).toBe("mock");
  });

  it("reads PORT and NOTIFICATION_ADAPTER from the given env object", () => {
    const cfg = loadServerConfig({ PORT: "4000", NOTIFICATION_ADAPTER: "mock" });
    expect(cfg.port).toBe(4000);
    expect(cfg.notificationAdapter).toBe("mock");
  });

  it("throws a descriptive error when PORT is not a number", () => {
    expect(() => loadServerConfig({ PORT: "not-a-number" })).toThrow();
  });

  it("throws when NOTIFICATION_ADAPTER is not a known adapter name", () => {
    expect(() => loadServerConfig({ NOTIFICATION_ADAPTER: "smtp-prod" })).toThrow();
  });
});
