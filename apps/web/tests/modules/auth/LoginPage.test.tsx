import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginPage } from "../../../src/modules/auth/LoginPage.js";
import { withProviders } from "./testHelpers.js";

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
