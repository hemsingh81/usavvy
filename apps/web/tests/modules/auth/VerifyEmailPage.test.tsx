import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { VerifyEmailPage } from "../../../src/modules/auth/VerifyEmailPage.js";
import { withProviders, withProvidersStrict } from "./testHelpers.js";

describe("VerifyEmailPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows a success state once verification succeeds (AC #3: also logs in)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ accessToken: "a", refreshToken: "b", user: { id: "u1", email: "e@example.com", role: "student" } }),
      } as unknown as Response),
    );

    render(withProviders(<VerifyEmailPage />, ["/verify-email?token=a-real-token"]));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Email verified" })).toBeInTheDocument());
  });

  it("shows a distinguishable error state for an invalid/expired token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: { code: "INVALID_VERIFICATION_TOKEN", message: "verification link is invalid, expired, or already used" } }),
      } as unknown as Response),
    );

    render(withProviders(<VerifyEmailPage />, ["/verify-email?token=a-bad-token"]));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/invalid, expired, or already used/i));
  });

  it("shows an error state immediately when no token is present in the URL, without calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(withProviders(<VerifyEmailPage />, ["/verify-email"]));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/no verification token/i));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls verify-email exactly once even under StrictMode's dev double-invoked effects (regression: a naive cancelled-flag guard let the second, already-used call clobber the first success)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ accessToken: "a", refreshToken: "b", user: { id: "u1", email: "e@example.com", role: "student" } }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    render(withProvidersStrict(<VerifyEmailPage />, ["/verify-email?token=a-real-token"]));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Email verified" })).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
