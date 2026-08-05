import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CustomizePage } from "../../../src/modules/courses/CustomizePage.js";

const useAuthMock = vi.fn();

vi.mock("../../../src/modules/auth/index.js", () => ({
  useAuth: () => useAuthMock(),
}));

function renderWithSession(session: { accessToken: string } | null, courseId = "c1") {
  useAuthMock.mockReturnValue({ session });
  return render(
    <MemoryRouter initialEntries={[`/courses/${courseId}/customize`]}>
      <Routes>
        <Route path="/courses/:id/customize" element={<CustomizePage />} />
        <Route path="/login" element={<div>login page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function jsonResponse(body: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as unknown as Response);
}

function errorResponse(code: string, message: string, details?: unknown) {
  return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: { code, message, details } }) } as unknown as Response);
}

const COURSE = {
  id: "c1",
  title: "Intro to Algebra",
  description: null,
  subject: "Math",
  level: "beginner",
  estimatedDurationHours: 12,
  status: "published",
  prerequisites: [],
  outcomes: [],
  sampleBoardAssetRef: null,
  modules: [
    {
      id: "m1",
      courseId: "c1",
      title: "Module 1",
      position: 0,
      archivedAt: null,
      topics: [
        { id: "t1", moduleId: "m1", title: "Basics", position: 0, archivedAt: null, concepts: [] },
        { id: "t2", moduleId: "m1", title: "Advanced", position: 1, archivedAt: null, concepts: [] },
      ],
    },
  ],
  createdAt: "2026-01-15T00:00:00.000Z",
  updatedAt: "2026-01-15T00:00:00.000Z",
};

const PREFERENCES = {
  voiceEnabled: true,
  speechRate: 1,
  boardTheme: "dark",
  explanationStyle: "analogy-first",
  captionsEnabled: false,
  reducedMotion: false,
  colorTheme: "indigo-focus",
};

function mockFetch(overrides: { customization?: Response | Promise<Response>; save?: (body: unknown) => Promise<Response> } = {}) {
  return vi.fn().mockImplementation((url: string, init?: { method?: string; body?: string }) => {
    if (url.endsWith("/courses/c1/customization") && init?.method === "PUT") {
      const body: unknown = init.body ? JSON.parse(init.body) : {};
      return overrides.save ? overrides.save(body) : jsonResponse({ courseId: "c1", deselectedTopicIds: [], priorityTopicIds: [], depth: "standard", explanationStyle: "concise", estimatedHours: 12, updatedAt: "2026-01-15T00:00:00.000Z" });
    }
    if (url.endsWith("/courses/c1/customization")) {
      return overrides.customization ?? errorResponse("NOT_FOUND", "no customization saved yet");
    }
    if (url.endsWith("/courses/c1")) {
      return jsonResponse(COURSE);
    }
    if (url.endsWith("/users/preferences")) {
      return jsonResponse(PREFERENCES);
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

describe("CustomizePage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useAuthMock.mockReset();
  });

  it("redirects to /login when there is no session", () => {
    renderWithSession(null);

    expect(screen.getByText("login page")).toBeInTheDocument();
  });

  it("renders every Topic with a deselect and priority control, and the course's full estimated hours before any customization exists (AC #4 first-time case)", async () => {
    vi.stubGlobal("fetch", mockFetch());
    renderWithSession({ accessToken: "a-token" });

    await waitFor(() => expect(screen.getByText("Basics")).toBeInTheDocument());
    expect(screen.getByText("Advanced")).toBeInTheDocument();
    expect(screen.getByText(/Estimated hours: 12h/)).toBeInTheDocument();
  });

  it("defaults explanationStyle to the learner's account-wide preference when no customization exists yet", async () => {
    vi.stubGlobal("fetch", mockFetch());
    renderWithSession({ accessToken: "a-token" });

    await waitFor(() => expect(screen.getByText("Basics")).toBeInTheDocument());
    expect(screen.getByLabelText("Explanation style")).toHaveValue("analogy-first");
  });

  it("pre-loads a previously-saved customization's exact selections for further editing (AC #4)", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        customization: jsonResponse({
          courseId: "c1",
          deselectedTopicIds: ["t1"],
          priorityTopicIds: ["t2"],
          depth: "deep-dive",
          explanationStyle: "detailed",
          estimatedHours: 9,
          updatedAt: "2026-01-15T00:00:00.000Z",
        }),
      }),
    );
    renderWithSession({ accessToken: "a-token" });

    await waitFor(() => expect(screen.getByText("Basics")).toBeInTheDocument());
    expect(screen.getByLabelText("I already know this: Basics")).toBeChecked();
    expect(screen.getByLabelText("Priority: Advanced")).toBeChecked();
    expect(screen.getByLabelText("Depth")).toHaveValue("deep-dive");
    expect(screen.getByLabelText("Explanation style")).toHaveValue("detailed");
    expect(screen.getByText(/Estimated hours: 9h/)).toBeInTheDocument();
  });

  it("deselecting a Topic recalculates and displays the new estimated hours (AC #1)", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        save: () =>
          jsonResponse({
            courseId: "c1",
            deselectedTopicIds: ["t1"],
            priorityTopicIds: [],
            depth: "standard",
            explanationStyle: "analogy-first",
            estimatedHours: 6,
            updatedAt: "2026-01-15T00:00:00.000Z",
          }),
      }),
    );
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText("Basics")).toBeInTheDocument());

    await user.click(screen.getByLabelText("I already know this: Basics"));

    await waitFor(() => expect(screen.getByText(/Estimated hours: 6h/)).toBeInTheDocument());
    expect(screen.getByLabelText("I already know this: Basics")).toBeChecked();
  });

  it("changing depth recalculates hours (AC #2)", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        save: () =>
          jsonResponse({
            courseId: "c1",
            deselectedTopicIds: [],
            priorityTopicIds: [],
            depth: "deep-dive",
            explanationStyle: "analogy-first",
            estimatedHours: 18,
            updatedAt: "2026-01-15T00:00:00.000Z",
          }),
      }),
    );
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText("Basics")).toBeInTheDocument());

    await user.selectOptions(screen.getByLabelText("Depth"), "deep-dive");

    await waitFor(() => expect(screen.getByText(/Estimated hours: 18h/)).toBeInTheDocument());
  });

  it("shows a dependency-conflict warning naming the specific Topics, with a working 'Save anyway' (AC #3)", async () => {
    const conflicts = [{ topicId: "t1", topicTitle: "Basics", requiredByTopicId: "t2", requiredByTopicTitle: "Advanced" }];
    let saveCallCount = 0;
    vi.stubGlobal(
      "fetch",
      mockFetch({
        save: (body: unknown) => {
          saveCallCount += 1;
          const { force } = body as { force?: boolean };
          if (!force) {
            return errorResponse("DEPENDENCY_CONFLICT", "conflict", conflicts);
          }
          return jsonResponse({
            courseId: "c1",
            deselectedTopicIds: ["t1"],
            priorityTopicIds: [],
            depth: "standard",
            explanationStyle: "analogy-first",
            estimatedHours: 6,
            updatedAt: "2026-01-15T00:00:00.000Z",
          });
        },
      }),
    );
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText("Basics")).toBeInTheDocument());

    await user.click(screen.getByLabelText("I already know this: Basics"));

    await waitFor(() => expect(screen.getByText(/"Advanced" requires "Basics"/)).toBeInTheDocument());
    expect(screen.getByLabelText("I already know this: Basics")).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: "Save anyway" }));

    await waitFor(() => expect(screen.getByLabelText("I already know this: Basics")).toBeChecked());
    expect(saveCallCount).toBe(2);
  });

  it("shows a distinguishable error rather than a blank page when the initial fetch fails", async () => {
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
