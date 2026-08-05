import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../src/shared/apiClient.js";
import { createUsersApi } from "../../../src/modules/users/api.js";

describe("createUsersApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("declareAge sends the access token and body, returns the parsed response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ isMinor: false, parentalConsentStatus: "not_required" }) } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const api = createUsersApi("http://localhost:3000");
    const result = await api.declareAge("a-token", { birthdate: "1990-01-01" });

    expect(result).toEqual({ isMinor: false, parentalConsentStatus: "not_required" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/users/age-declaration",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer a-token" }),
        body: JSON.stringify({ birthdate: "1990-01-01" }),
      }),
    );
  });

  it("declareAge maps a non-ok response's error envelope to an ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: { code: "AGE_ALREADY_DECLARED", message: "already declared" } }),
      } as unknown as Response),
    );

    const api = createUsersApi("http://localhost:3000");

    await expect(api.declareAge("a-token", { birthdate: "1990-01-01" })).rejects.toMatchObject({
      code: "AGE_ALREADY_DECLARED",
      message: "already declared",
    });
  });

  it("parentalConsent sends no access token (the parent has no account)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const api = createUsersApi("http://localhost:3000");
    const result = await api.parentalConsent({ token: "a-token" });

    expect(result).toEqual({ success: true });
    const [, callOptions] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(callOptions.headers).not.toHaveProperty("authorization");
  });

  it("maps a network failure to an ApiError rather than throwing raw", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const api = createUsersApi("http://localhost:3000");

    await expect(api.parentalConsent({ token: "a-token" })).rejects.toBeInstanceOf(ApiError);
  });

  it("getOnboarding sends the access token and no body, returns the parsed profile", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          goal: null,
          interests: null,
          availability: null,
          sessionLengthMinutes: null,
          targetCompletionDate: null,
          level: null,
          currentStep: 0,
          completedAt: null,
        }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const api = createUsersApi("http://localhost:3000");
    const result = await api.getOnboarding("a-token");

    expect(result.currentStep).toBe(0);
    const [, callOptions] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(callOptions.method).toBe("GET");
    expect(callOptions.body).toBeUndefined();
    expect(callOptions.headers).toEqual(expect.objectContaining({ authorization: "Bearer a-token" }));
  });

  it("saveOnboardingStep sends the step body and access token, returns the updated profile", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          goal: "learn calculus",
          interests: null,
          availability: null,
          sessionLengthMinutes: null,
          targetCompletionDate: null,
          level: null,
          currentStep: 1,
          completedAt: null,
        }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const api = createUsersApi("http://localhost:3000");
    const result = await api.saveOnboardingStep("a-token", { step: "goal", value: "learn calculus" });

    expect(result.currentStep).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/users/onboarding/step",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ step: "goal", value: "learn calculus" }) }),
    );
  });

  it("getPreferences sends the access token and no body, returns the parsed preferences", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          voiceEnabled: true,
          speechRate: 1,
          boardTheme: "dark",
          explanationStyle: "concise",
          captionsEnabled: false,
          reducedMotion: false,
        }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const api = createUsersApi("http://localhost:3000");
    const result = await api.getPreferences("a-token");

    expect(result.boardTheme).toBe("dark");
    const [, callOptions] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(callOptions.method).toBe("GET");
    expect(callOptions.headers).toEqual(expect.objectContaining({ authorization: "Bearer a-token" }));
  });

  it("savePreferences sends the partial body and access token, returns the full preferences shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          voiceEnabled: false,
          speechRate: 1,
          boardTheme: "dark",
          explanationStyle: "concise",
          captionsEnabled: false,
          reducedMotion: false,
        }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const api = createUsersApi("http://localhost:3000");
    const result = await api.savePreferences("a-token", { voiceEnabled: false });

    expect(result.voiceEnabled).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/users/preferences",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ voiceEnabled: false }) }),
    );
  });
});
