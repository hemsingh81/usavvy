import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginPage } from "../../../src/modules/auth/LoginPage.js";
import { withProviders } from "./testHelpers.js";

// Story 1.2: a successful login also calls GET /me to decide where to navigate.
function mockLoginThenMe(meOverrides: Record<string, unknown> = {}) {
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

describe("LoginPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders the EMAIL_NOT_VERIFIED server error inline", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: { code: "EMAIL_NOT_VERIFIED", message: "please verify your email before logging in" } }),
      } as unknown as Response),
    );
    const user = userEvent.setup();

    render(withProviders(<LoginPage />));
    await user.type(screen.getByLabelText("Email"), "learner@example.com");
    await user.type(screen.getByLabelText("Password"), "a-long-enough-password");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/verify your email/i));
  });

  it("calls /me with the just-issued access token after a successful login (review finding: must not read a stale context session)", async () => {
    const fetchMock = mockLoginThenMe();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(withProviders(<LoginPage />));
    await user.type(screen.getByLabelText("Email"), "learner@example.com");
    await user.type(screen.getByLabelText("Password"), "a-long-enough-password");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/me"),
        expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer a-token" }) }),
      ),
    );
  });

  it("disables the submit button while the request is in flight", async () => {
    let resolveFetch: (value: unknown) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
      ),
    );
    const user = userEvent.setup();

    render(withProviders(<LoginPage />));
    await user.type(screen.getByLabelText("Email"), "learner@example.com");
    await user.type(screen.getByLabelText("Password"), "a-long-enough-password");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(screen.getByRole("button", { name: "Logging in…" })).toBeDisabled();

    // Review finding: resolving without awaiting the resulting state-update chain left a
    // dangling promise whose effects landed after the test returned (act()
    // warnings/flakiness depending on timing relative to cleanup()).
    resolveFetch({ ok: true, json: () => Promise.resolve({ accessToken: "a", refreshToken: "b", user: { id: "u1", email: "e", role: "student" } }) });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Logging in…" })).not.toBeInTheDocument());
  });
});
