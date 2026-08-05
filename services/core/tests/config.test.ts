import { describe, expect, it } from "vitest";
import { loadCoreConfig } from "../src/config.js";

describe("loadCoreConfig", () => {
  it("applies defaults when no env vars are set", () => {
    const cfg = loadCoreConfig({});
    expect(cfg.port).toBe(3001);
    expect(cfg.notificationAdapter).toBe("mock");
    expect(cfg.databaseUrl).toBe("postgres://usavvy:usavvy@localhost:5433/usavvy_core");
    expect(cfg.storageEndpoint).toBe("http://localhost:8333");
    expect(cfg.jwtSecret).toBe("usavvy-dev-only-jwt-secret-do-not-use-in-production");
    expect(cfg.internalServiceSecret).toBe("usavvy-dev-only-internal-secret-do-not-use-in-production");
    expect(cfg.googleClientId).toBeUndefined();
  });

  it("reads JWT_SECRET, INTERNAL_SERVICE_SECRET, and GOOGLE_CLIENT_ID from the given env object", () => {
    const cfg = loadCoreConfig({
      JWT_SECRET: "a-real-secret",
      INTERNAL_SERVICE_SECRET: "a-real-internal-secret",
      GOOGLE_CLIENT_ID: "abc.apps.googleusercontent.com",
    });
    expect(cfg.jwtSecret).toBe("a-real-secret");
    expect(cfg.internalServiceSecret).toBe("a-real-internal-secret");
    expect(cfg.googleClientId).toBe("abc.apps.googleusercontent.com");
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
