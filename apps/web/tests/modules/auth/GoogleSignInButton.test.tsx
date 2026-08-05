import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GoogleSignInButton } from "../../../src/modules/auth/GoogleSignInButton.js";
import { withProviders } from "./testHelpers.js";

// Review finding: only the "not configured" branch was tested — the actual interactive
// path (GoogleOAuthProvider/GoogleLogin, the onSuccess/onError callback wiring) had no
// coverage. Mocking @react-oauth/google lets us drive its callbacks directly without a
// real Google Identity Services script.
vi.mock("@react-oauth/google", () => ({
  GoogleOAuthProvider: ({ children }: { children: React.ReactNode }) => children,
  GoogleLogin: ({ onSuccess, onError }: { onSuccess: (r: { credential?: string }) => void; onError: () => void }) => (
    <div>
      <button onClick={() => onSuccess({ credential: "a-fake-id-token" })}>fake-google-success</button>
      <button onClick={() => onSuccess({})}>fake-google-success-no-credential</button>
      <button onClick={onError}>fake-google-error</button>
    </div>
  ),
}));

describe("GoogleSignInButton", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("renders nothing when VITE_GOOGLE_CLIENT_ID is not configured (omitted, not a button that 503s on click)", () => {
    const { container } = render(withProviders(<GoogleSignInButton onError={() => undefined} onSuccess={() => undefined} />));

    expect(container).toBeEmptyDOMElement();
  });

  it("renders and calls onSuccess after a successful Google credential exchanges for a session", async () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "a-client-id.apps.googleusercontent.com");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ accessToken: "a", refreshToken: "b", user: { id: "u1", email: "e@example.com", role: "student" } }),
      } as unknown as Response),
    );
    const onSuccess = vi.fn();
    const user = userEvent.setup();

    render(withProviders(<GoogleSignInButton onError={() => undefined} onSuccess={onSuccess} />));
    await user.click(screen.getByRole("button", { name: "fake-google-success" }));

    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it("calls onError when Google's response has no credential", async () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "a-client-id.apps.googleusercontent.com");
    const onError = vi.fn();
    const user = userEvent.setup();

    render(withProviders(<GoogleSignInButton onError={onError} onSuccess={() => undefined} />));
    await user.click(screen.getByRole("button", { name: "fake-google-success-no-credential" }));

    expect(onError).toHaveBeenCalledWith("Google sign-in did not return a credential");
  });

  it("calls onError when the exchange with the backend fails", async () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "a-client-id.apps.googleusercontent.com");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({ error: { code: "INVALID_GOOGLE_TOKEN", message: "x" } }) } as unknown as Response),
    );
    const onError = vi.fn();
    const user = userEvent.setup();

    render(withProviders(<GoogleSignInButton onError={onError} onSuccess={() => undefined} />));
    await user.click(screen.getByRole("button", { name: "fake-google-success" }));

    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith("Google sign-in failed"));
  });

  it("calls onError when Google's own SDK reports an error", async () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "a-client-id.apps.googleusercontent.com");
    const onError = vi.fn();
    const user = userEvent.setup();

    render(withProviders(<GoogleSignInButton onError={onError} onSuccess={() => undefined} />));
    await user.click(screen.getByRole("button", { name: "fake-google-error" }));

    expect(onError).toHaveBeenCalledWith("Google sign-in failed");
  });
});
