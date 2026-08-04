import { describe, expect, it } from "vitest";
import { loadWebConfig } from "../src/web.js";

describe("loadWebConfig", () => {
  it("applies the default API URL when VITE_API_URL is unset", () => {
    const cfg = loadWebConfig({});
    expect(cfg.apiUrl).toBe("http://localhost:3001");
  });

  it("reads VITE_API_URL from the given env object", () => {
    const cfg = loadWebConfig({ VITE_API_URL: "https://api.usavvy.example" });
    expect(cfg.apiUrl).toBe("https://api.usavvy.example");
  });

  it("throws a descriptive error when VITE_API_URL is not a valid URL", () => {
    expect(() => loadWebConfig({ VITE_API_URL: "not-a-url" })).toThrow();
  });
});
