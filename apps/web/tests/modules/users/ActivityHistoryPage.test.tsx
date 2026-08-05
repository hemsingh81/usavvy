import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ActivityHistoryPage } from "../../../src/modules/users/ActivityHistoryPage.js";

const useAuthMock = vi.fn();

vi.mock("../../../src/modules/auth/index.js", () => ({
  useAuth: () => useAuthMock(),
}));

function renderWithSession(session: { accessToken: string } | null) {
  useAuthMock.mockReturnValue({ session });
  return render(
    <MemoryRouter initialEntries={["/activity-history"]}>
      <Routes>
        <Route path="/activity-history" element={<ActivityHistoryPage />} />
        <Route path="/login" element={<div>login page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function jsonResponse(body: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as unknown as Response);
}

describe("ActivityHistoryPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useAuthMock.mockReset();
  });

  it("redirects to /login when there is no session", () => {
    renderWithSession(null);

    expect(screen.getByText("login page")).toBeInTheDocument();
  });

  it("shows the empty state when the fetched list is empty (the real case today)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(await jsonResponse([])));
    renderWithSession({ accessToken: "a-token" });

    await waitFor(() => expect(screen.getByText("No activity yet")).toBeInTheDocument());
  });

  it("renders entries in the order the backend returned them, with label/date/link", async () => {
    const entries = [
      { type: "board_session", occurredAt: "2026-01-16T00:00:00.000Z", label: "Studied: Quadratics", sourceUrl: "/sessions/1/transcript" },
      { type: "assignment", occurredAt: "2026-01-15T00:00:00.000Z", label: "Submitted: Essay 1", sourceUrl: "/assignments/1/feedback" },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(await jsonResponse(entries)));
    renderWithSession({ accessToken: "a-token" });

    await waitFor(() => expect(screen.getByText("Studied: Quadratics")).toBeInTheDocument());
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveTextContent("Studied: Quadratics");
    expect(links[0]).toHaveAttribute("href", "/sessions/1/transcript");
    expect(links[1]).toHaveTextContent("Submitted: Essay 1");
    expect(links[1]).toHaveAttribute("href", "/assignments/1/feedback");
  });

  it("shows a distinguishable error rather than a blank page when the fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: { code: "INTERNAL_ERROR", message: "could not load" } }),
      } as unknown as Response),
    );
    renderWithSession({ accessToken: "a-token" });

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("could not load"));
  });
});
