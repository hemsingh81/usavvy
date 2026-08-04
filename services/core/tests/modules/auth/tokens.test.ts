import { describe, expect, it } from "vitest";
import { generateRawToken, hashToken } from "../../../src/modules/auth/tokens.js";

describe("tokens", () => {
  it("generates a high-entropy, url-safe raw token", () => {
    const token = generateRawToken();
    expect(token.length).toBeGreaterThan(30);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(generateRawToken()).not.toBe(generateRawToken());
  });

  it("hashes deterministically so a lookup by hash works", () => {
    const raw = generateRawToken();
    expect(hashToken(raw)).toBe(hashToken(raw));
  });

  it("never stores the raw token itself as its own hash", () => {
    const raw = generateRawToken();
    expect(hashToken(raw)).not.toBe(raw);
  });
});
