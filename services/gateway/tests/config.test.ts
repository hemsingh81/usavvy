import { describe, expect, it } from "vitest";
import { loadGatewayConfig } from "../src/config.js";

describe("loadGatewayConfig", () => {
  it("applies defaults when no env vars are set", () => {
    const cfg = loadGatewayConfig({});
    expect(cfg.port).toBe(3000);
    expect(cfg.coreServiceUrl).toBe("http://localhost:3001");
    expect(cfg.webOrigin).toBe("http://localhost:5173");
  });

  it("reads CORE_SERVICE_URL and WEB_ORIGIN from the given env object", () => {
    const cfg = loadGatewayConfig({
      CORE_SERVICE_URL: "http://core:3001",
      WEB_ORIGIN: "http://web:5173",
    });
    expect(cfg.coreServiceUrl).toBe("http://core:3001");
    expect(cfg.webOrigin).toBe("http://web:5173");
  });

  it("throws a descriptive error when PORT is not a number", () => {
    expect(() => loadGatewayConfig({ PORT: "not-a-number" })).toThrow();
  });
});
