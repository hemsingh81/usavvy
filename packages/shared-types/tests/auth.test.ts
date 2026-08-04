import { describe, expect, it } from "vitest";
import { authSessionResponseSchema, meResponseSchema, signupResponseSchema } from "../src/auth.js";

describe("meResponseSchema", () => {
  it("accepts a valid shape", () => {
    expect(() => meResponseSchema.parse({ id: "u1", email: "a@example.com", emailVerified: true, role: "student" })).not.toThrow();
  });

  it("rejects a missing field", () => {
    expect(() => meResponseSchema.parse({ id: "u1", email: "a@example.com" })).toThrow();
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
