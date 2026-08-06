import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { OutlineReviewPage } from "../../../src/modules/uploads/OutlineReviewPage.js";

const useAuthMock = vi.fn();

vi.mock("../../../src/modules/auth/index.js", () => ({
  useAuth: () => useAuthMock(),
}));

const CUSTOM_COURSE_ID = "019fd450-b7cb-7a32-b021-42788045c71f";

function renderPage(session: { accessToken: string } | null) {
  useAuthMock.mockReturnValue({ session });
  return render(
    <MemoryRouter initialEntries={[`/upload-content/${CUSTOM_COURSE_ID}/outline`]}>
      <Routes>
        <Route path="/upload-content/:customCourseId/outline" element={<OutlineReviewPage />} />
        <Route path="/login" element={<div>login page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as unknown as Response);
}

const TOPIC = {
  id: "t1",
  title: "Chapter One",
  position: 0,
  priority: false,
  concepts: [
    { id: "c1", title: "Intro", position: 0, priority: false, sourcePageRangeStart: 1, sourcePageRangeEnd: 2, safetyFlagged: false },
    { id: "c2", title: "Details", position: 1, priority: false, sourcePageRangeStart: 3, sourcePageRangeEnd: 4, safetyFlagged: false },
  ],
};

describe("OutlineReviewPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useAuthMock.mockReset();
  });

  it("renders the fetched outline's topics and concepts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, [TOPIC]));
    vi.stubGlobal("fetch", fetchMock);
    renderPage({ accessToken: "a-token" });

    await waitFor(() => expect(screen.getByDisplayValue("Chapter One")).toBeInTheDocument());
    expect(screen.getByDisplayValue("Intro")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Details")).toBeInTheDocument();
  });

  it("renaming a topic (blur) calls the rename endpoint then refetches", async () => {
    const fetchMock = vi.fn((url: unknown, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const urlStr = String(url);
      if (method === "GET") return jsonResponse(200, [TOPIC]);
      if (method === "PATCH" && urlStr.includes("/topics/t1")) return jsonResponse(204, undefined);
      throw new Error(`unexpected fetch: ${method} ${urlStr}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage({ accessToken: "a-token" });
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByDisplayValue("Chapter One")).toBeInTheDocument());

    const input = screen.getByDisplayValue("Chapter One");
    await user.clear(input);
    await user.type(input, "Renamed Chapter");
    await user.tab();

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/uploads/outline/topics/t1"),
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ title: "Renamed Chapter" }) }),
      ),
    );
  });

  it("toggling topic priority calls the priority endpoint", async () => {
    const fetchMock = vi.fn((url: unknown, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "GET") return jsonResponse(200, [TOPIC]);
      if (method === "PATCH") return jsonResponse(204, undefined);
      throw new Error(`unexpected fetch`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage({ accessToken: "a-token" });
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByDisplayValue("Chapter One")).toBeInTheDocument());

    const checkboxes = screen.getAllByRole("checkbox", { name: "Priority" });
    await user.click(checkboxes[0] as HTMLElement);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/uploads/outline/topics/t1"),
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ priority: true }) }),
      ),
    );
  });

  it("deleting a topic calls the delete endpoint", async () => {
    const fetchMock = vi.fn((url: unknown, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const urlStr = String(url);
      if (method === "GET") return jsonResponse(200, [TOPIC]);
      if (method === "DELETE" && urlStr.includes("/topics/t1")) return jsonResponse(204, undefined);
      throw new Error(`unexpected fetch: ${method} ${urlStr}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage({ accessToken: "a-token" });
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByDisplayValue("Chapter One")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Delete topic" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/uploads/outline/topics/t1"), expect.objectContaining({ method: "DELETE" })));
  });

  it("renders each concept's source page range (AC #1)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, [TOPIC]));
    vi.stubGlobal("fetch", fetchMock);
    renderPage({ accessToken: "a-token" });

    await waitFor(() => expect(screen.getByDisplayValue("Intro")).toBeInTheDocument());
    expect(screen.getByText(/Source: p\.1–2/)).toBeInTheDocument();
    expect(screen.getByText(/Source: p\.3–4/)).toBeInTheDocument();
  });

  it("a 404 deleting a topic (already gone) is treated as success, not an error alert (review finding)", async () => {
    const fetchMock = vi.fn((url: unknown, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const urlStr = String(url);
      if (method === "GET") return jsonResponse(200, [TOPIC]);
      if (method === "DELETE" && urlStr.includes("/topics/t1")) {
        return jsonResponse(404, { error: { code: "NOT_FOUND", message: "not found" } });
      }
      throw new Error(`unexpected fetch: ${method} ${urlStr}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage({ accessToken: "a-token" });
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByDisplayValue("Chapter One")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Delete topic" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/uploads/outline/topics/t1"), expect.objectContaining({ method: "DELETE" })));
    await waitFor(() => expect(fetchMock.mock.calls.filter((call) => (call[1]?.method ?? "GET") === "GET")).toHaveLength(2));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("a non-404 error deleting a topic still surfaces an alert", async () => {
    const fetchMock = vi.fn((url: unknown, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const urlStr = String(url);
      if (method === "GET") return jsonResponse(200, [TOPIC]);
      if (method === "DELETE" && urlStr.includes("/topics/t1")) {
        return jsonResponse(500, { error: { code: "INTERNAL_ERROR", message: "boom" } });
      }
      throw new Error(`unexpected fetch: ${method} ${urlStr}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage({ accessToken: "a-token" });
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByDisplayValue("Chapter One")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Delete topic" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("boom"));
  });

  it("moving a topic down calls reorder with the swapped order (single-topic case has both buttons disabled)", async () => {
    const secondTopic = { ...TOPIC, id: "t2", title: "Chapter Two", concepts: [] };
    const fetchMock = vi.fn((url: unknown, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const urlStr = String(url);
      if (method === "GET") return jsonResponse(200, [TOPIC, secondTopic]);
      if (method === "PUT" && urlStr.includes("/topics/reorder")) return jsonResponse(204, undefined);
      throw new Error(`unexpected fetch: ${method} ${urlStr}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage({ accessToken: "a-token" });
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByDisplayValue("Chapter One")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Move Chapter One down" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/uploads/outline/topics/reorder"),
        expect.objectContaining({ method: "PUT", body: JSON.stringify({ customCourseId: CUSTOM_COURSE_ID, orderedTopicIds: ["t2", "t1"] }) }),
      ),
    );
  });

  it("merging a concept into a sibling calls the merge endpoint (AC #4)", async () => {
    const fetchMock = vi.fn((url: unknown, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const urlStr = String(url);
      if (method === "GET") return jsonResponse(200, [TOPIC]);
      if (method === "POST" && urlStr.includes("/concepts/merge")) return jsonResponse(200, { keepConceptId: "c1" });
      throw new Error(`unexpected fetch: ${method} ${urlStr}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage({ accessToken: "a-token" });
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByDisplayValue("Intro")).toBeInTheDocument());

    await user.selectOptions(screen.getByLabelText("Merge Details into"), "c1");

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/uploads/outline/concepts/merge"),
        expect.objectContaining({ method: "POST", body: JSON.stringify({ keepConceptId: "c1", mergeConceptId: "c2" }) }),
      ),
    );
  });

  it("confirming with at least one topic shows a link to the resulting course (AC #2)", async () => {
    const fetchMock = vi.fn((url: unknown, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const urlStr = String(url);
      if (method === "GET") return jsonResponse(200, [TOPIC]);
      if (method === "POST" && urlStr.includes("/confirm")) return jsonResponse(200, { courseId: "new-course-1" });
      throw new Error(`unexpected fetch: ${method} ${urlStr}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage({ accessToken: "a-token" });
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByDisplayValue("Chapter One")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Confirm outline" }));

    await waitFor(() => expect(screen.getByRole("link", { name: "Go to your course" })).toHaveAttribute("href", "/courses/new-course-1"));
  });

  it("disables Confirm outline and shows the blocking message with zero topics (AC #3)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, []));
    vi.stubGlobal("fetch", fetchMock);
    renderPage({ accessToken: "a-token" });

    await waitFor(() => expect(screen.getByText("No proposed outline yet.")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Confirm outline" })).toBeDisabled();
    expect(screen.getByText("At least one Topic must remain to confirm this outline.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("redirects to /login with no session", () => {
    renderPage(null);
    expect(screen.getByText("login page")).toBeInTheDocument();
  });
});
