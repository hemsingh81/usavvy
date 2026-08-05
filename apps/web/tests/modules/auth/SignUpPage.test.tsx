import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SignUpPage } from "../../../src/modules/auth/SignUpPage.js";
import { withProviders } from "./testHelpers.js";

// Review finding: the Google-branch post-auth redirect (getMe + navigate) had zero
// coverage — mock the SDK the same way GoogleSignInButton.test.tsx does so its
// onSuccess callback can be driven directly.
vi.mock("@react-oauth/google", () => ({
  GoogleOAuthProvider: ({ children }: { children: React.ReactNode }) => children,
  GoogleLogin: ({ onSuccess }: { onSuccess: (r: { credential?: string }) => void }) => (
    <button onClick={() => onSuccess({ credential: "a-fake-id-token" })}>fake-google-success</button>
  ),
}));

function mockGoogleAuthThenMe(meOverrides: Record<string, unknown> = {}) {
  return vi.fn().mockImplementation((url: string) => {
    if (url.endsWith("/me")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            id: "u1",
            email: "e@example.com",
            emailVerified: true,
            role: "student",
            birthdate: null,
            isMinor: null,
            parentalConsentStatus: null,
            onboardingComplete: false,
            ...meOverrides,
          }),
      } as unknown as Response);
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ accessToken: "a-token", refreshToken: "b", user: { id: "u1", email: "e@example.com", role: "student" } }),
    } as unknown as Response);
  });
}

describe("SignUpPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("shows the check-your-email confirmation on successful signup (no auto-login, AC #1)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ userId: "u1" }) } as unknown as Response));
    const user = userEvent.setup();

    render(withProviders(<SignUpPage />));
    await user.type(screen.getByLabelText("Email"), "learner@example.com");
    await user.type(screen.getByLabelText("Password"), "a-long-enough-password");
    await user.click(screen.getByRole("button", { name: "Sign up" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Check your email" })).toBeInTheDocument());
  });

  it("renders the server error inline instead of a silent failure (AD-17)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: { code: "EMAIL_ALREADY_REGISTERED", message: "an account with this email already exists" } }),
      } as unknown as Response),
    );
    const user = userEvent.setup();

    render(withProviders(<SignUpPage />));
    await user.type(screen.getByLabelText("Email"), "learner@example.com");
    await user.type(screen.getByLabelText("Password"), "a-long-enough-password");
    await user.click(screen.getByRole("button", { name: "Sign up" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/already exists/i));
  });

  it("calls /me with the just-issued access token after a successful Google sign-up (review finding: previously zero coverage)", async () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "a-client-id.apps.googleusercontent.com");
    const fetchMock = mockGoogleAuthThenMe();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(withProviders(<SignUpPage />));
    await user.click(screen.getByRole("button", { name: "fake-google-success" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/me"),
        expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer a-token" }) }),
      ),
    );
  });

  it("surfaces an error instead of silently stranding the user when /me fails after Google sign-up (review finding: unhandled rejection)", async () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "a-client-id.apps.googleusercontent.com");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.endsWith("/me")) return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: { code: "INTERNAL_ERROR", message: "x" } }) } as unknown as Response);
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ accessToken: "a-token", refreshToken: "b", user: { id: "u1", email: "e@example.com", role: "student" } }),
        } as unknown as Response);
      }),
    );
    const user = userEvent.setup();

    render(withProviders(<SignUpPage />));
    await user.click(screen.getByRole("button", { name: "fake-google-success" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });
});
