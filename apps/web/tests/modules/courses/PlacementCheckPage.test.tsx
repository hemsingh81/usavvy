import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PlacementCheckPage } from "../../../src/modules/courses/PlacementCheckPage.js";

const useAuthMock = vi.fn();

vi.mock("../../../src/modules/auth/index.js", () => ({
  useAuth: () => useAuthMock(),
}));

function renderWithSession(session: { accessToken: string } | null, courseId = "c1") {
  useAuthMock.mockReturnValue({ session });
  return render(
    <MemoryRouter initialEntries={[`/courses/${courseId}/placement-check`]}>
      <Routes>
        <Route path="/courses/:id/placement-check" element={<PlacementCheckPage />} />
        <Route path="/courses/:id/customize" element={<div>customize page</div>} />
        <Route path="/login" element={<div>login page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function jsonResponse(body: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as unknown as Response);
}

const QUESTIONS = [
  { topicId: "t1", topicTitle: "Basics", conceptId: "c1", question: "What is a variable?" },
  { topicId: "t2", topicTitle: "Advanced", conceptId: "c2", question: "What is a closure?" },
];

function mockFetch(questions: unknown, scoreResult?: unknown) {
  return vi.fn().mockImplementation((url: string) => {
    if (url.endsWith("/placement-check/score")) {
      return jsonResponse(scoreResult ?? { proposedDeselectedTopicIds: [], proposedStartingDifficultyTier: "beginner" });
    }
    if (url.endsWith("/placement-check")) {
      return jsonResponse(questions);
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

describe("PlacementCheckPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useAuthMock.mockReset();
  });

  it("redirects to /login when there is no session", () => {
    renderWithSession(null);

    expect(screen.getByText("login page")).toBeInTheDocument();
  });

  it("renders each fetched question with both response controls (AC #1)", async () => {
    vi.stubGlobal("fetch", mockFetch(QUESTIONS));
    renderWithSession({ accessToken: "a-token" });

    await waitFor(() => expect(screen.getByText("What is a variable?")).toBeInTheDocument());
    expect(screen.getByText("What is a closure?")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "I know this" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "I'm not sure yet" })).toHaveLength(2);
  });

  it("shows 'No placement check available for this course yet' rather than a broken quiz when there are no questions", async () => {
    vi.stubGlobal("fetch", mockFetch([]));
    renderWithSession({ accessToken: "a-token" });

    await waitFor(() => expect(screen.getByText("No placement check available for this course yet.")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /back to customise/i })).toHaveAttribute("href", "/courses/c1/customize");
  });

  it("disables Submit until every question has been answered, to avoid skewing the score toward a partial subset (review finding)", async () => {
    vi.stubGlobal("fetch", mockFetch(QUESTIONS));
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText("What is a variable?")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();

    await user.click(screen.getAllByRole("button", { name: "I know this" })[0]!);

    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
    expect(screen.getByText("Answer all questions to submit (1/2)")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "I'm not sure yet" })[1]!);

    expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled();
  });

  it("submitting navigates to the customize screen carrying the scored proposal", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(QUESTIONS, { proposedDeselectedTopicIds: ["t1"], proposedStartingDifficultyTier: "intermediate" }),
    );
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText("What is a variable?")).toBeInTheDocument());

    const knowButtons = screen.getAllByRole("button", { name: "I know this" });
    await user.click(knowButtons[0]!);
    const notSureButtons = screen.getAllByRole("button", { name: "I'm not sure yet" });
    await user.click(notSureButtons[1]!);
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(screen.getByText("customize page")).toBeInTheDocument());
  });
});
