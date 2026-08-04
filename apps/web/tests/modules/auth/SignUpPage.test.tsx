import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SignUpPage } from "../../../src/modules/auth/SignUpPage.js";
import { withProviders } from "./testHelpers.js";

describe("SignUpPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
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
});
