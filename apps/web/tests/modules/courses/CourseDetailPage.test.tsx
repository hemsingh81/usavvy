import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CourseDetailPage } from "../../../src/modules/courses/CourseDetailPage.js";

const useAuthMock = vi.fn();

vi.mock("../../../src/modules/auth/index.js", () => ({
  useAuth: () => useAuthMock(),
}));

function renderWithSession(session: { accessToken: string } | null, courseId = "c1") {
  useAuthMock.mockReturnValue({ session });
  return render(
    <MemoryRouter initialEntries={[`/courses/${courseId}`]}>
      <Routes>
        <Route path="/courses/:id" element={<CourseDetailPage />} />
        <Route path="/login" element={<div>login page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function jsonResponse(body: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as unknown as Response);
}

const FULL_COURSE = {
  id: "c1",
  title: "Intro to Algebra",
  description: "Learn the basics of algebra",
  subject: "Math",
  level: "beginner",
  estimatedDurationHours: 10,
  status: "published",
  prerequisites: ["Basic arithmetic"],
  outcomes: ["Solve linear equations"],
  sampleBoardAssetRef: "https://example.com/sample.mp4",
  modules: [
    {
      id: "m1",
      courseId: "c1",
      title: "Module 1",
      position: 0,
      archivedAt: null,
      topics: [
        { id: "t1", moduleId: "m1", title: "Topic 1", position: 0, archivedAt: null, concepts: [] },
        { id: "t2", moduleId: "m1", title: "Topic 2", position: 1, archivedAt: null, concepts: [] },
      ],
    },
  ],
  createdAt: "2026-01-15T00:00:00.000Z",
  updatedAt: "2026-01-15T00:00:00.000Z",
};

describe("CourseDetailPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useAuthMock.mockReset();
  });

  it("redirects to /login when there is no session", () => {
    renderWithSession(null);

    expect(screen.getByText("login page")).toBeInTheDocument();
  });

  it("renders the syllabus (Modules/Topics in order), estimated hours, prerequisites, and outcomes (AC #1)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(await jsonResponse(FULL_COURSE)));
    renderWithSession({ accessToken: "a-token" });

    await waitFor(() => expect(screen.getByText("Intro to Algebra")).toBeInTheDocument());
    expect(screen.getByText("Module 1")).toBeInTheDocument();
    const topics = screen.getAllByText(/^Topic \d$/);
    expect(topics.map((el) => el.textContent)).toEqual(["Topic 1", "Topic 2"]);
    expect(screen.getByText(/Estimated hours: 10h/)).toBeInTheDocument();
    expect(screen.getByText("Basic arithmetic")).toBeInTheDocument();
    expect(screen.getByText("Solve linear equations")).toBeInTheDocument();
  });

  it("plays the sample board asset when available (AC #2)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(await jsonResponse(FULL_COURSE)));
    renderWithSession({ accessToken: "a-token" });

    await waitFor(() => expect(screen.getByTestId("sample-board-video")).toBeInTheDocument());
    expect(screen.getByTestId("sample-board-video")).toHaveAttribute("src", "https://example.com/sample.mp4");
  });

  it("shows 'Sample not yet available' (not an error) when no sample asset is configured, rest of page renders normally (AC #3)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(await jsonResponse({ ...FULL_COURSE, sampleBoardAssetRef: null })));
    renderWithSession({ accessToken: "a-token" });

    await waitFor(() => expect(screen.getByText("Sample not yet available.")).toBeInTheDocument());
    expect(screen.queryByTestId("sample-board-video")).not.toBeInTheDocument();
    expect(screen.getByText("Intro to Algebra")).toBeInTheDocument();
    expect(screen.getByText("Module 1")).toBeInTheDocument();
  });

  it("shows both 'Start course' and 'Customise before starting' CTAs, both disabled (AC #4)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(await jsonResponse(FULL_COURSE)));
    renderWithSession({ accessToken: "a-token" });

    await waitFor(() => expect(screen.getByText("Intro to Algebra")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Start course" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Customise before starting" })).toBeDisabled();
  });

  it("shows a distinguishable error rather than a blank page when the fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: { code: "NOT_FOUND", message: "course not found" } }),
      } as unknown as Response),
    );
    renderWithSession({ accessToken: "a-token" });

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("course not found"));
  });
});
