import { describe, expect, it } from "vitest";
import { loadCoreConfig } from "../src/config.js";

describe("loadCoreConfig", () => {
  it("applies defaults when no env vars are set", () => {
    const cfg = loadCoreConfig({});
    expect(cfg.port).toBe(3001);
    expect(cfg.notificationAdapter).toBe("mock");
    expect(cfg.databaseUrl).toBe("postgres://usavvy:usavvy@localhost:5432/usavvy_core");
    expect(cfg.storageEndpoint).toBe("http://localhost:8333");
  });

  it("reads DATABASE_URL and STORAGE_ENDPOINT from the given env object", () => {
    const cfg = loadCoreConfig({
      DATABASE_URL: "postgres://x:y@db:5432/usavvy_core",
      STORAGE_ENDPOINT: "http://storage:8333",
    });
    expect(cfg.databaseUrl).toBe("postgres://x:y@db:5432/usavvy_core");
    expect(cfg.storageEndpoint).toBe("http://storage:8333");
  });

  it("throws when NOTIFICATION_ADAPTER is not a known adapter name", () => {
    expect(() => loadCoreConfig({ NOTIFICATION_ADAPTER: "smtp-prod" })).toThrow();
  });

  it("throws a descriptive error when PORT is not a number", () => {
    expect(() => loadCoreConfig({ PORT: "not-a-number" })).toThrow();
  });

  it("throws when DATABASE_URL is not a valid URL (Review finding: was under-validated as a bare non-empty string)", () => {
    expect(() => loadCoreConfig({ DATABASE_URL: "not-a-url" })).toThrow();
  });
});
