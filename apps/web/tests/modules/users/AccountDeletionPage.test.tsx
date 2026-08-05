import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AccountDeletionPage } from "../../../src/modules/users/AccountDeletionPage.js";

const useAuthMock = vi.fn();

vi.mock("../../../src/modules/auth/index.js", () => ({
  useAuth: () => useAuthMock(),
}));

function renderWithSession(session: { accessToken: string } | null) {
  useAuthMock.mockReturnValue({ session });
  return render(
    <MemoryRouter initialEntries={["/account-deletion"]}>
      <Routes>
        <Route path="/account-deletion" element={<AccountDeletionPage />} />
        <Route path="/login" element={<div>login page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) } as unknown as Response);
}

describe("AccountDeletionPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useAuthMock.mockReset();
  });

  it("redirects to /login when there is no session", () => {
    renderWithSession(null);

    expect(screen.getByText("login page")).toBeInTheDocument();
  });

  it("renders the confirm action and explanation before any confirmation", () => {
    renderWithSession({ accessToken: "a-token" });

    expect(screen.getByRole("button", { name: /delete my account/i })).toBeInTheDocument();
    expect(screen.getByText(/30 days/)).toBeInTheDocument();
  });

  it("confirming fires POST /users/account-deletion and shows the returned scheduled date on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ scheduledDeletionAt: "2026-09-04T00:00:00.000Z" }));
    vi.stubGlobal("fetch", fetchMock);
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /delete my account/i }));

    await waitFor(() => expect(screen.getByText(/2026/)).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/users/account-deletion"), expect.objectContaining({ method: "POST" }));
    expect(screen.queryByRole("button", { name: /delete my account/i })).not.toBeInTheDocument();
  });

  it("shows a specific message, not a generic error, on a 409 ACCOUNT_DELETION_ALREADY_REQUESTED response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: "ACCOUNT_DELETION_ALREADY_REQUESTED", message: "account deletion has already been requested" } }, false),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /delete my account/i }));

    await waitFor(() => expect(screen.getByText("account deletion has already been requested")).toBeInTheDocument());
  });

  it("shows a generic error message on an unexpected failure", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /delete my account/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });
});
