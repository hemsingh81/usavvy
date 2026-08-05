import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthApiError, createAuthApi } from "../../../src/modules/auth/api.js";

describe("createAuthApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("signup returns the parsed userId on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ userId: "u1" }) } as unknown as Response));

    const api = createAuthApi("http://localhost:3000");
    const result = await api.signup({ email: "a@example.com", password: "a-long-enough-password" });

    expect(result).toEqual({ userId: "u1" });
  });

  it("maps a non-ok response's error envelope to an AuthApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: { code: "EMAIL_ALREADY_REGISTERED", message: "already exists" } }),
      } as unknown as Response),
    );

    const api = createAuthApi("http://localhost:3000");

    await expect(api.signup({ email: "a@example.com", password: "x" })).rejects.toMatchObject({
      code: "EMAIL_ALREADY_REGISTERED",
      message: "already exists",
    });
  });

  it("maps a network failure to a NETWORK_ERROR AuthApiError rather than throwing raw", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const api = createAuthApi("http://localhost:3000");

    await expect(api.login({ email: "a@example.com", password: "x" })).rejects.toBeInstanceOf(AuthApiError);
  });

  it("me sends the access token as a Bearer header", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: "u1",
            email: "a@example.com",
            emailVerified: true,
            role: "student",
            birthdate: null,
            isMinor: null,
            parentalConsentStatus: null,
            onboardingComplete: false,
            displayName: "a",
            memberSince: "2026-01-01T00:00:00.000Z",
          }),
      } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const api = createAuthApi("http://localhost:3000");
    await api.me("a-token");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/me",
      expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer a-token" }) }),
    );
  });
});
