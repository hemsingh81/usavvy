import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

function mockFetch(course: unknown, overrides: { start?: unknown; updateToLatest?: unknown; courseAfterUpdate?: unknown } = {}) {
  let getCourseCallCount = 0;
  return vi.fn().mockImplementation((url: string) => {
    if (url.endsWith("/start")) return jsonResponse(overrides.start ?? { pinnedCourseId: "c1", startedAt: "2026-01-15T00:00:00.000Z" });
    if (url.endsWith("/update-to-latest")) return jsonResponse(overrides.updateToLatest ?? { pinnedCourseId: "c2", flaggedTopicTitles: [] });
    if (url.endsWith("/courses/c1")) {
      getCourseCallCount += 1;
      const isPostUpdateCall = getCourseCallCount > 1 && overrides.courseAfterUpdate !== undefined;
      return jsonResponse(isPostUpdateCall ? overrides.courseAfterUpdate : course);
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
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
  isPinnedToOlderVersion: false,
  latestVersionId: null,
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

  it("shows 'Start course' and 'Customise before starting' as a real link to the customize screen (AC #4; Story 2.4 wires up the latter)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(await jsonResponse(FULL_COURSE)));
    renderWithSession({ accessToken: "a-token" });

    await waitFor(() => expect(screen.getByText("Intro to Algebra")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Start course" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Customise before starting" })).toHaveAttribute("href", "/courses/c1/customize");
  });

  it("clicking 'Start course' records access and shows a plain confirmation, not a real learning session (Story 2.6, AC #1)", async () => {
    vi.stubGlobal("fetch", mockFetch(FULL_COURSE));
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText("Intro to Algebra")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Start course" }));

    await waitFor(() => expect(screen.getByText(/You started this course/)).toBeInTheDocument());
  });

  it("shows a dismissible update notice only when pinned to an older version (Story 2.6, AC #3)", async () => {
    vi.stubGlobal("fetch", mockFetch({ ...FULL_COURSE, isPinnedToOlderVersion: true, latestVersionId: "c2" }));
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText("Intro to Algebra")).toBeInTheDocument());

    expect(screen.getByText("A newer version of this course is available.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByText("A newer version of this course is available.")).not.toBeInTheDocument();
  });

  it("does not show the update notice when already on the latest version", async () => {
    vi.stubGlobal("fetch", mockFetch(FULL_COURSE));
    renderWithSession({ accessToken: "a-token" });

    await waitFor(() => expect(screen.getByText("Intro to Algebra")).toBeInTheDocument());
    expect(screen.queryByText("A newer version of this course is available.")).not.toBeInTheDocument();
  });

  it("clicking 'Update' surfaces flagged Topics when the response names any (Story 2.6, AC #4)", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(
        { ...FULL_COURSE, isPinnedToOlderVersion: true, latestVersionId: "c2" },
        { updateToLatest: { pinnedCourseId: "c2", flaggedTopicTitles: ["Old Topic"] } },
      ),
    );
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText("A newer version of this course is available.")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() => expect(screen.getByText(/Old Topic/)).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /review your customisation/i })).toHaveAttribute("href", "/courses/c1/customize");
  });

  it("shows nothing extra after 'Update' when the response names no flagged Topics", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ ...FULL_COURSE, isPinnedToOlderVersion: true, latestVersionId: "c2" }, { updateToLatest: { pinnedCourseId: "c2", flaggedTopicTitles: [] } }),
    );
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText("A newer version of this course is available.")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() => expect(screen.queryByText("A newer version of this course is available.")).not.toBeInTheDocument());
    expect(screen.queryByRole("link", { name: /review your customisation/i })).not.toBeInTheDocument();
  });

  it("re-fetches and displays the new version's content after a successful update, rather than leaving the old version's syllabus stale (review finding)", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(
        { ...FULL_COURSE, isPinnedToOlderVersion: true, latestVersionId: "c2" },
        {
          updateToLatest: { pinnedCourseId: "c2", flaggedTopicTitles: [] },
          courseAfterUpdate: { ...FULL_COURSE, title: "Intro to Algebra v2", isPinnedToOlderVersion: false, latestVersionId: null },
        },
      ),
    );
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText("Intro to Algebra")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() => expect(screen.getByText("Intro to Algebra v2")).toBeInTheDocument());
    expect(screen.queryByText("Intro to Algebra", { selector: "h1" })).not.toBeInTheDocument();
  });

  it("links to the attach-personal-notes page for this course (Story 2.14, AC #1)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(await jsonResponse(FULL_COURSE)));
    renderWithSession({ accessToken: "a-token" });

    await waitFor(() => expect(screen.getByText("Intro to Algebra")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Add your personal notes to this course" })).toHaveAttribute("href", "/courses/c1/notes");
  });

  it("links to the mock board preview for this course (Epic 3 mock-first UX pass)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(await jsonResponse(FULL_COURSE)));
    renderWithSession({ accessToken: "a-token" });

    await waitFor(() => expect(screen.getByText("Intro to Algebra")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Preview the interactive board (mock)" })).toHaveAttribute("href", "/courses/c1/board");
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
