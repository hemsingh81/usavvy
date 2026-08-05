import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CatalogPage } from "../../../src/modules/courses/CatalogPage.js";

const useAuthMock = vi.fn();

vi.mock("../../../src/modules/auth/index.js", () => ({
  useAuth: () => useAuthMock(),
}));

function renderWithSession(session: { accessToken: string } | null) {
  useAuthMock.mockReturnValue({ session });
  return render(
    <MemoryRouter initialEntries={["/catalog"]}>
      <Routes>
        <Route path="/catalog" element={<CatalogPage />} />
        <Route path="/login" element={<div>login page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function jsonResponse(body: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as unknown as Response);
}

const COURSES = [
  { id: "c1", title: "Intro to Algebra", description: null, subject: "Math", level: "beginner", estimatedDurationHours: 10, status: "published" },
  { id: "c2", title: "Physics 101", description: null, subject: "Science", level: "intermediate", estimatedDurationHours: 20, status: "published" },
];

describe("CatalogPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useAuthMock.mockReset();
  });

  it("redirects to /login when there is no session", () => {
    renderWithSession(null);

    expect(screen.getByText("login page")).toBeInTheDocument();
  });

  it("renders all courses with subject/level/duration visible when no filters are applied (AC #1)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(await jsonResponse(COURSES)));
    renderWithSession({ accessToken: "a-token" });

    await waitFor(() => expect(screen.getByText("Intro to Algebra")).toBeInTheDocument());
    expect(screen.getByText("Physics 101")).toBeInTheDocument();
    expect(screen.getByText("Math")).toBeInTheDocument();
    expect(screen.getByText("beginner")).toBeInTheDocument();
    expect(screen.getByText("10h")).toBeInTheDocument();
  });

  it("applying a filter re-fetches with the right query params and shows it as a removable chip (AC #2)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(await jsonResponse(COURSES));
    vi.stubGlobal("fetch", fetchMock);
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText("Intro to Algebra")).toBeInTheDocument());

    await user.selectOptions(screen.getByLabelText("Level"), "beginner");

    await waitFor(() => {
      const lastCall = fetchMock.mock.calls.at(-1) as [string];
      expect(lastCall[0]).toContain("level=beginner");
    });
    expect(screen.getByText("Level: beginner")).toBeInTheDocument();
  });

  it("removing a chip re-fetches without that filter", async () => {
    const fetchMock = vi.fn().mockResolvedValue(await jsonResponse(COURSES));
    vi.stubGlobal("fetch", fetchMock);
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText("Intro to Algebra")).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText("Level"), "beginner");
    await waitFor(() => expect(screen.getByText("Level: beginner")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Remove filter: Level: beginner" }));

    await waitFor(() => expect(screen.queryByText("Level: beginner")).not.toBeInTheDocument());
    const lastCall = fetchMock.mock.calls.at(-1) as [string];
    expect(lastCall[0]).not.toContain("level=");
  });

  it("submitting a search term re-fetches with q set (debounced)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(await jsonResponse(COURSES));
    vi.stubGlobal("fetch", fetchMock);
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText("Intro to Algebra")).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText("Search courses…"), "algebra");

    await waitFor(
      () => {
        const lastCall = fetchMock.mock.calls.at(-1) as [string];
        expect(lastCall[0]).toContain("q=algebra");
      },
      { timeout: 2000 },
    );
  });

  it("removing the search chip clears the applied search immediately, without waiting for the debounce (review finding)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(await jsonResponse(COURSES));
    vi.stubGlobal("fetch", fetchMock);
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText("Intro to Algebra")).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText("Search courses…"), "algebra");
    await waitFor(() => expect(screen.getByText('Search: "algebra"')).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: 'Remove filter: Search: "algebra"' }));

    // Asserted synchronously (no waitFor): a correct fix clears the chip and re-fetches in
    // the same tick as the click. Clearing only the debounced input (the review-flagged bug)
    // would leave the chip and the "q=" fetch param in place until the 300ms debounce timer
    // fires — which hasn't happened yet at this point since real timers aren't advanced here.
    expect(screen.queryByText('Search: "algebra"')).not.toBeInTheDocument();
    const lastCall = fetchMock.mock.calls.at(-1) as [string];
    expect(lastCall[0]).not.toContain("q=");
  });

  it("shows the empty-state message and 'Clear filters' resets and re-fetches unfiltered (AC #5)", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("subject=Nonexistent")) return jsonResponse([]);
      return jsonResponse(COURSES);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText("Intro to Algebra")).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText("e.g. Math"), "Nonexistent");

    await waitFor(() => expect(screen.getByText("No courses match your search or filters.")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    await waitFor(() => expect(screen.getByText("Intro to Algebra")).toBeInTheDocument());
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
