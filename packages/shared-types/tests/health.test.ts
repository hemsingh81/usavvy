import { describe, expect, it } from "vitest";
import { healthStatusSchema, gatewayHealthSchema } from "../src/health.js";

describe("healthStatusSchema", () => {
  it("accepts a valid ok status", () => {
    const parsed = healthStatusSchema.parse({ status: "ok", db: true, storage: true });
    expect(parsed).toEqual({ status: "ok", db: true, storage: true });
  });

  it("accepts a valid degraded status", () => {
    const parsed = healthStatusSchema.parse({ status: "degraded", db: false, storage: true });
    expect(parsed.status).toBe("degraded");
  });

  it("rejects an invalid status value", () => {
    expect(() => healthStatusSchema.parse({ status: "unknown", db: true, storage: true })).toThrow();
  });

  it("rejects a payload missing required fields", () => {
    expect(() => healthStatusSchema.parse({ status: "ok" })).toThrow();
  });
});

describe("gatewayHealthSchema", () => {
  it("accepts core reporting a full HealthStatus", () => {
    const parsed = gatewayHealthSchema.parse({
      gateway: { status: "ok" },
      core: { status: "ok", db: true, storage: true },
    });
    expect(parsed.core).toEqual({ status: "ok", db: true, storage: true });
  });

  it("accepts core reporting unreachable", () => {
    const parsed = gatewayHealthSchema.parse({ gateway: { status: "ok" }, core: { status: "unreachable" } });
    expect(parsed.core).toEqual({ status: "unreachable" });
  });

  it("rejects an unknown core status literal", () => {
    expect(() => gatewayHealthSchema.parse({ gateway: { status: "ok" }, core: { status: "offline" } })).toThrow();
  });
});
