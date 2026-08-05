import { describe, expect, it } from "vitest";
import {
  ageDeclarationResponseSchema,
  authSessionResponseSchema,
  meResponseSchema,
  parentalConsentResponseSchema,
  signupResponseSchema,
} from "../src/auth.js";

describe("meResponseSchema", () => {
  it("accepts a valid shape with age-declaration fields null (not yet declared)", () => {
    expect(() =>
      meResponseSchema.parse({
        id: "u1",
        email: "a@example.com",
        emailVerified: true,
        role: "student",
        birthdate: null,
        isMinor: null,
        parentalConsentStatus: null,
      }),
    ).not.toThrow();
  });

  it("accepts a valid shape with age-declaration fields populated", () => {
    expect(() =>
      meResponseSchema.parse({
        id: "u1",
        email: "a@example.com",
        emailVerified: true,
        role: "student",
        birthdate: "2008-01-01",
        isMinor: true,
        parentalConsentStatus: "pending",
      }),
    ).not.toThrow();
  });

  it("rejects a missing field", () => {
    expect(() => meResponseSchema.parse({ id: "u1", email: "a@example.com" })).toThrow();
  });

  it("rejects an invalid parentalConsentStatus value", () => {
    expect(() =>
      meResponseSchema.parse({
        id: "u1",
        email: "a@example.com",
        emailVerified: true,
        role: "student",
        birthdate: null,
        isMinor: null,
        parentalConsentStatus: "not-a-real-status",
      }),
    ).toThrow();
  });
});

describe("ageDeclarationResponseSchema", () => {
  it("accepts a valid adult shape", () => {
    expect(() => ageDeclarationResponseSchema.parse({ isMinor: false, parentalConsentStatus: "not_required" })).not.toThrow();
  });

  it("accepts a valid minor shape", () => {
    expect(() => ageDeclarationResponseSchema.parse({ isMinor: true, parentalConsentStatus: "pending" })).not.toThrow();
  });
});

describe("parentalConsentResponseSchema", () => {
  it("accepts the success shape", () => {
    expect(() => parentalConsentResponseSchema.parse({ success: true })).not.toThrow();
  });

  it("rejects success: false", () => {
    expect(() => parentalConsentResponseSchema.parse({ success: false })).toThrow();
  });
});

describe("authSessionResponseSchema", () => {
  it("accepts a valid shape", () => {
    expect(() =>
      authSessionResponseSchema.parse({ accessToken: "a", refreshToken: "b", user: { id: "u1", email: "a@example.com", role: "student" } }),
    ).not.toThrow();
  });

  it("rejects a missing user", () => {
    expect(() => authSessionResponseSchema.parse({ accessToken: "a", refreshToken: "b" })).toThrow();
  });
});

describe("signupResponseSchema", () => {
  it("accepts a valid shape", () => {
    expect(() => signupResponseSchema.parse({ userId: "u1" })).not.toThrow();
  });

  it("rejects a missing userId", () => {
    expect(() => signupResponseSchema.parse({})).toThrow();
  });
});
