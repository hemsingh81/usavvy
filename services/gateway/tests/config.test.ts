import { describe, expect, it } from "vitest";
import { loadGatewayConfig } from "../src/config.js";

describe("loadGatewayConfig", () => {
  it("applies defaults when no env vars are set", () => {
    const cfg = loadGatewayConfig({});
    expect(cfg.port).toBe(3000);
    expect(cfg.coreServiceUrl).toBe("http://localhost:3001");
    expect(cfg.webOrigin).toBe("http://localhost:5173");
    expect(cfg.jwtSecret).toBe("usavvy-dev-only-jwt-secret-do-not-use-in-production");
    expect(cfg.internalServiceSecret).toBe("usavvy-dev-only-internal-secret-do-not-use-in-production");
  });

  it("reads CORE_SERVICE_URL, WEB_ORIGIN, JWT_SECRET, and INTERNAL_SERVICE_SECRET from the given env object", () => {
    const cfg = loadGatewayConfig({
      CORE_SERVICE_URL: "http://core:3001",
      WEB_ORIGIN: "http://web:5173",
      JWT_SECRET: "a-real-secret",
      INTERNAL_SERVICE_SECRET: "a-real-internal-secret",
    });
    expect(cfg.coreServiceUrl).toBe("http://core:3001");
    expect(cfg.webOrigin).toBe("http://web:5173");
    expect(cfg.jwtSecret).toBe("a-real-secret");
    expect(cfg.internalServiceSecret).toBe("a-real-internal-secret");
  });

  it("throws a descriptive error when PORT is not a number", () => {
    expect(() => loadGatewayConfig({ PORT: "not-a-number" })).toThrow();
  });

  it("throws when JWT_SECRET is set but empty", () => {
    expect(() => loadGatewayConfig({ JWT_SECRET: "" })).toThrow();
  });
});
