import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { POLL_INTERVAL_MS, UploadPage } from "../../../src/modules/uploads/UploadPage.js";

const useAuthMock = vi.fn();

vi.mock("../../../src/modules/auth/index.js", () => ({
  useAuth: () => useAuthMock(),
}));

function renderPage(session: { accessToken: string } | null) {
  useAuthMock.mockReturnValue({ session });
  return render(
    <MemoryRouter initialEntries={["/upload-content"]}>
      <Routes>
        <Route path="/upload-content" element={<UploadPage />} />
        <Route path="/login" element={<div>login page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as unknown as Response);
}

function file(name: string, content = "hello"): File {
  return new File([content], name, { type: "text/plain" });
}

describe("UploadPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
    useAuthMock.mockReset();
  });

  it("redirects to /login when there is no session", () => {
    renderPage(null);

    expect(screen.getByText("login page")).toBeInTheDocument();
  });

  it("blocks submission with no fetch call when the attestation checkbox is unchecked (AC #4)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderPage({ accessToken: "a-token" });
    const user = userEvent.setup();

    const realFileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(realFileInput, file("notes.txt"));

    expect(fetchMock).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText(/copyright attestation is required/i)).toBeInTheDocument());
  });

  it("uploads a valid file once attested and shows it as accepted", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(201, { id: "d1", customCourseId: "cc1", fileName: "notes.txt", fileType: "txt", fileSizeBytes: 5, status: "queued", failureReason: null, createdAt: "2026-01-15T00:00:00.000Z" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderPage({ accessToken: "a-token" });
    const user = userEvent.setup();

    await user.click(screen.getByLabelText(/right to use this material/i));
    const realFileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(realFileInput, file("notes.txt"));

    await waitFor(() => expect(screen.getByText(/notes\.txt: accepted/)).toBeInTheDocument());
    expect(screen.getByText("1 of 10 files added")).toBeInTheDocument();
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.body).toBeInstanceOf(FormData);
  });

  it("shows a per-file error for a rejected file while a subsequent valid file in the same selection still succeeds (AC #2)", async () => {
    // Both files use a .txt extension (matching the input's `accept` list) since
    // @testing-library/user-event silently drops files that fail the browser's own
    // `accept` filtering before they ever reach the component — the rejection this test
    // exercises is a server-side one (whatever the mocked response says), not a
    // client-side extension filter.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(400, { error: { code: "VALIDATION_ERROR", message: "file exceeds 50 MB limit" } }))
      .mockResolvedValueOnce(
        jsonResponse(201, { id: "d2", customCourseId: "cc1", fileName: "good.txt", fileType: "txt", fileSizeBytes: 5, status: "queued", failureReason: null, createdAt: "2026-01-15T00:00:00.000Z" }),
      );
    vi.stubGlobal("fetch", fetchMock);
    renderPage({ accessToken: "a-token" });
    const user = userEvent.setup();

    await user.click(screen.getByLabelText(/right to use this material/i));
    const realFileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(realFileInput, [file("bad.txt"), file("good.txt")]);

    await waitFor(() => expect(screen.getByText(/bad\.txt: file exceeds 50 MB limit/)).toBeInTheDocument());
    expect(screen.getByText(/good\.txt: accepted/)).toBeInTheDocument();
    expect(screen.getByText("1 of 10 files added")).toBeInTheDocument();
  });

  it("disables the file input once 10 files have been accepted (AC #3)", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      jsonResponse(201, { id: "d", customCourseId: "cc1", fileName: "x.txt", fileType: "txt", fileSizeBytes: 5, status: "queued", failureReason: null, createdAt: "2026-01-15T00:00:00.000Z" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderPage({ accessToken: "a-token" });
    const user = userEvent.setup();

    await user.click(screen.getByLabelText(/right to use this material/i));
    const realFileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const tenFiles = Array.from({ length: 10 }, (_, i) => file(`file-${i}.txt`));
    await user.upload(realFileInput, tenFiles);

    await waitFor(() => expect(screen.getByText("10 of 10 files added")).toBeInTheDocument());
    expect(screen.getByText(/reached the 10-file-per-course limit/i)).toBeInTheDocument();
    expect(realFileInput).toBeDisabled();
  });

  it("shows a per-file limit message for every file beyond 10 selected in a single batch, rather than silently dropping them (review finding)", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      jsonResponse(201, { id: "d", customCourseId: "cc1", fileName: "x.txt", fileType: "txt", fileSizeBytes: 5, status: "queued", failureReason: null, createdAt: "2026-01-15T00:00:00.000Z" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderPage({ accessToken: "a-token" });
    const user = userEvent.setup();

    await user.click(screen.getByLabelText(/right to use this material/i));
    const realFileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const twelveFiles = Array.from({ length: 12 }, (_, i) => file(`file-${i}.txt`));
    await user.upload(realFileInput, twelveFiles);

    await waitFor(() => expect(screen.getByText("10 of 10 files added")).toBeInTheDocument());
    // Only 10 network calls — files 11/12 are rejected client-side, never sent.
    expect(fetchMock).toHaveBeenCalledTimes(10);
    expect(screen.getByText(/file-10\.txt: 10-file-per-course limit reached/)).toBeInTheDocument();
    expect(screen.getByText(/file-11\.txt: 10-file-per-course limit reached/)).toBeInTheDocument();
  });

  it("pasting valid text and submitting shows it accepted (Story 2.8, AC #1)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(201, { id: "d1", customCourseId: "cc1", fileName: "pasted-text.txt", fileType: "txt", fileSizeBytes: 20, status: "queued", failureReason: null, createdAt: "2026-01-15T00:00:00.000Z" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderPage({ accessToken: "a-token" });
    const user = userEvent.setup();

    await user.click(screen.getByLabelText(/right to use this material/i));
    await user.type(screen.getByLabelText("Paste text"), "This is clearly more than ten words of pasted content for testing.");
    await user.click(screen.getByRole("button", { name: "Add pasted text" }));

    await waitFor(() => expect(screen.getByText(/pasted-text\.txt: accepted/)).toBeInTheDocument());
    expect(screen.getByText("1 of 10 files added")).toBeInTheDocument();
  });

  it("shows the specific rejection message when pasted text is too short (Story 2.8, AC #4)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(400, { error: { code: "VALIDATION_ERROR", message: "not enough content to build a course from" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderPage({ accessToken: "a-token" });
    const user = userEvent.setup();

    await user.click(screen.getByLabelText(/right to use this material/i));
    await user.type(screen.getByLabelText("Paste text"), "too short");
    await user.click(screen.getByRole("button", { name: "Add pasted text" }));

    await waitFor(() => expect(screen.getByText(/pasted-text\.txt: not enough content to build a course from/)).toBeInTheDocument());
  });

  it("submitting an unreachable URL shows the specific reason from the response (Story 2.8, AC #3)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(400, { error: { code: "VALIDATION_ERROR", message: "URL is unreachable" } }));
    vi.stubGlobal("fetch", fetchMock);
    renderPage({ accessToken: "a-token" });
    const user = userEvent.setup();

    await user.click(screen.getByLabelText(/right to use this material/i));
    await user.type(screen.getByLabelText("Import from URL"), "https://example.com/down");
    await user.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => expect(screen.getByText(/example\.com\/down: URL is unreachable/)).toBeInTheDocument());
  });

  it("a successful URL import increments the same running count file uploads use (Story 2.8, AC #2)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(201, { id: "d2", customCourseId: "cc1", fileName: "example.com.txt", fileType: "txt", fileSizeBytes: 40, status: "queued", failureReason: null, createdAt: "2026-01-15T00:00:00.000Z" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderPage({ accessToken: "a-token" });
    const user = userEvent.setup();

    await user.click(screen.getByLabelText(/right to use this material/i));
    await user.type(screen.getByLabelText("Import from URL"), "https://example.com/article");
    await user.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => expect(screen.getByText("1 of 10 files added")).toBeInTheDocument());
  });

  it("shows the stage label and a progress indicator for a document from the polled list (Story 2.11, AC #1)", async () => {
    const fetchMock = vi.fn((url: unknown, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const urlStr = String(url);
      if (method === "POST" && urlStr.endsWith("/uploads")) {
        return jsonResponse(201, {
          id: "d1",
          customCourseId: "019fd450-b7cb-7a32-b021-42788045c71f",
          fileName: "notes.txt",
          fileType: "txt",
          fileSizeBytes: 5,
          status: "queued",
          failureReason: null,
          createdAt: "2026-01-15T00:00:00.000Z",
        });
      }
      if (method === "GET" && urlStr.includes("/uploads?")) {
        return jsonResponse(200, [
          {
            id: "d1",
            customCourseId: "019fd450-b7cb-7a32-b021-42788045c71f",
            fileName: "notes.txt",
            fileType: "txt",
            fileSizeBytes: 5,
            status: "parsing",
            failureReason: null,
            createdAt: "2026-01-15T00:00:00.000Z",
          },
        ]);
      }
      throw new Error(`unexpected fetch: ${method} ${urlStr}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage({ accessToken: "a-token" });
    const user = userEvent.setup({ delay: null });

    await user.click(screen.getByLabelText(/right to use this material/i));
    const realFileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(realFileInput, file("notes.txt"));

    await waitFor(() => expect(screen.getByText("Parsing")).toBeInTheDocument());
  });

  it("polls while a document is non-terminal and stops once it reaches a terminal status (Story 2.11, AC #1)", async () => {
    let listCallCount = 0;
    const fetchMock = vi.fn((url: unknown, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const urlStr = String(url);
      if (method === "POST" && urlStr.endsWith("/uploads")) {
        return jsonResponse(201, {
          id: "d1",
          customCourseId: "019fd450-b7cb-7a32-b021-42788045c71f",
          fileName: "notes.txt",
          fileType: "txt",
          fileSizeBytes: 5,
          status: "queued",
          failureReason: null,
          createdAt: "2026-01-15T00:00:00.000Z",
        });
      }
      if (method === "GET" && urlStr.includes("/uploads?")) {
        listCallCount += 1;
        const status = listCallCount === 1 ? "parsing" : "parsed";
        return jsonResponse(200, [
          {
            id: "d1",
            customCourseId: "019fd450-b7cb-7a32-b021-42788045c71f",
            fileName: "notes.txt",
            fileType: "txt",
            fileSizeBytes: 5,
            status,
            failureReason: null,
            createdAt: "2026-01-15T00:00:00.000Z",
          },
        ]);
      }
      throw new Error(`unexpected fetch: ${method} ${urlStr}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    renderPage({ accessToken: "a-token" });
    const user = userEvent.setup({ delay: null });

    await user.click(screen.getByLabelText(/right to use this material/i));
    const realFileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(realFileInput, file("notes.txt"));

    await waitFor(() => expect(screen.getByText("Parsing")).toBeInTheDocument());
    expect(listCallCount).toBe(1);
    // A non-terminal first fetch schedules exactly one interval, at the real interval.
    // (setInterval may also be called internally by userEvent for unrelated purposes —
    // filter to calls using this component's own real delay.)
    const pollCallIndices = () => setIntervalSpy.mock.calls.reduce<number[]>((indices, call, index) => (call[1] === POLL_INTERVAL_MS ? [...indices, index] : indices), []);
    expect(pollCallIndices()).toHaveLength(1);
    const [pollCallIndex] = pollCallIndices();

    // Invoke the captured interval callback directly — deterministic, independent of
    // real or fake wall-clock time, and immune to userEvent/fake-timer interaction.
    const intervalCallback = setIntervalSpy.mock.calls[pollCallIndex as number]?.[0] as () => void;
    const intervalId = setIntervalSpy.mock.results[pollCallIndex as number]?.value;
    intervalCallback();

    await waitFor(() => expect(screen.getByText(/Processed/)).toBeInTheDocument());
    expect(listCallCount).toBe(2);
    // The second fetch resolved to a terminal status — the interval must be cleared,
    // never left running forever once nothing can change. (clearInterval may also be
    // called internally by userEvent for unrelated ids — check the specific id.)
    expect(clearIntervalSpy).toHaveBeenCalledWith(intervalId);

    // A further manual tick (simulating what would have been a 3rd real interval fire)
    // must not happen — setInterval was only ever scheduled once at the real interval.
    expect(pollCallIndices()).toHaveLength(1);
  });

  it("keeps fetching later files in the same batch even when the first file already reached a terminal status before the second finishes uploading (review finding, AC #1)", async () => {
    const docs: Record<string, { id: string; customCourseId: string; fileName: string; fileType: string; fileSizeBytes: number; status: string; failureReason: string | null; createdAt: string }> = {};
    const fetchMock = vi.fn((url: unknown, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const urlStr = String(url);
      if (method === "POST" && urlStr.endsWith("/uploads")) {
        const id = `d${Object.keys(docs).length + 1}`;
        // The first file's job races ahead of the second file's own upload request and
        // is already "parsed" (terminal) by the time anything polls for status.
        const status = id === "d1" ? "parsed" : "queued";
        docs[id] = {
          id,
          customCourseId: "019fd450-b7cb-7a32-b021-42788045c71f",
          fileName: `${id}.txt`,
          fileType: "txt",
          fileSizeBytes: 5,
          status,
          failureReason: null,
          createdAt: "2026-01-15T00:00:00.000Z",
        };
        return jsonResponse(201, docs[id]);
      }
      if (method === "GET" && urlStr.includes("/uploads?")) {
        return jsonResponse(200, Object.values(docs));
      }
      throw new Error(`unexpected fetch: ${method} ${urlStr}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage({ accessToken: "a-token" });
    const user = userEvent.setup({ delay: null });

    await user.click(screen.getByLabelText(/right to use this material/i));
    const realFileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(realFileInput, [file("d1.txt"), file("d2.txt")]);

    await waitFor(() => expect(screen.getByText("2 of 10 files added")).toBeInTheDocument());
    // Without the fix, the first (already-terminal) fetch would have stopped the effect
    // from ever re-fetching once the second file's document existed.
    await waitFor(() => expect(screen.getAllByRole("listitem").some((item) => item.textContent?.includes("d2.txt"))).toBe(true));
  });

  it("does not permanently stop polling after a single transient fetch failure (review finding, AC #1)", async () => {
    let listCallCount = 0;
    const fetchMock = vi.fn((url: unknown, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const urlStr = String(url);
      if (method === "POST" && urlStr.endsWith("/uploads")) {
        return jsonResponse(201, {
          id: "d1",
          customCourseId: "019fd450-b7cb-7a32-b021-42788045c71f",
          fileName: "notes.txt",
          fileType: "txt",
          fileSizeBytes: 5,
          status: "queued",
          failureReason: null,
          createdAt: "2026-01-15T00:00:00.000Z",
        });
      }
      if (method === "GET" && urlStr.includes("/uploads?")) {
        listCallCount += 1;
        if (listCallCount === 1) return Promise.reject(new Error("network blip"));
        return jsonResponse(200, [
          {
            id: "d1",
            customCourseId: "019fd450-b7cb-7a32-b021-42788045c71f",
            fileName: "notes.txt",
            fileType: "txt",
            fileSizeBytes: 5,
            status: "parsed",
            failureReason: null,
            createdAt: "2026-01-15T00:00:00.000Z",
          },
        ]);
      }
      throw new Error(`unexpected fetch: ${method} ${urlStr}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    renderPage({ accessToken: "a-token" });
    const user = userEvent.setup({ delay: null });

    await user.click(screen.getByLabelText(/right to use this material/i));
    const realFileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(realFileInput, file("notes.txt"));

    // The first (failed) fetch must schedule a retry interval rather than giving up.
    await waitFor(() => expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), POLL_INTERVAL_MS));
    const pollCallIndex = setIntervalSpy.mock.calls.findIndex((call) => call[1] === POLL_INTERVAL_MS);
    const intervalCallback = setIntervalSpy.mock.calls[pollCallIndex]?.[0] as () => void;
    intervalCallback();

    await waitFor(() => expect(screen.getByText(/Processed/)).toBeInTheDocument());
    expect(listCallCount).toBe(2);
  });

  it("clicking Remove calls the delete endpoint and the document disappears from the list (Story 2.11, AC #3)", async () => {
    const fetchMock = vi.fn((url: unknown, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const urlStr = String(url);
      if (method === "POST" && urlStr.endsWith("/uploads")) {
        return jsonResponse(201, {
          id: "d1",
          customCourseId: "019fd450-b7cb-7a32-b021-42788045c71f",
          fileName: "notes.txt",
          fileType: "txt",
          fileSizeBytes: 5,
          status: "failed",
          failureReason: "corrupt file",
          createdAt: "2026-01-15T00:00:00.000Z",
        });
      }
      if (method === "GET" && urlStr.includes("/uploads?")) {
        return jsonResponse(200, [
          {
            id: "d1",
            customCourseId: "019fd450-b7cb-7a32-b021-42788045c71f",
            fileName: "notes.txt",
            fileType: "txt",
            fileSizeBytes: 5,
            status: "failed",
            failureReason: "corrupt file",
            createdAt: "2026-01-15T00:00:00.000Z",
          },
        ]);
      }
      if (method === "DELETE" && urlStr.endsWith("/uploads/d1")) {
        return Promise.resolve({ ok: true, status: 204, json: () => Promise.resolve(undefined) } as unknown as Response);
      }
      throw new Error(`unexpected fetch: ${method} ${urlStr}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage({ accessToken: "a-token" });
    const user = userEvent.setup({ delay: null });

    await user.click(screen.getByLabelText(/right to use this material/i));
    const realFileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(realFileInput, file("notes.txt"));

    await waitFor(() => expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/uploads\/d1$/), expect.objectContaining({ method: "DELETE" }));
  });

  it("removing a document frees up the 10-file limit for a new upload (review finding, AC #3)", async () => {
    const fetchMock = vi.fn((url: unknown, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const urlStr = String(url);
      if (method === "POST" && urlStr.endsWith("/uploads")) {
        return jsonResponse(201, {
          id: "d1",
          customCourseId: "019fd450-b7cb-7a32-b021-42788045c71f",
          fileName: "notes.txt",
          fileType: "txt",
          fileSizeBytes: 5,
          status: "failed",
          failureReason: "corrupt file",
          createdAt: "2026-01-15T00:00:00.000Z",
        });
      }
      if (method === "GET" && urlStr.includes("/uploads?")) {
        return jsonResponse(200, [
          {
            id: "d1",
            customCourseId: "019fd450-b7cb-7a32-b021-42788045c71f",
            fileName: "notes.txt",
            fileType: "txt",
            fileSizeBytes: 5,
            status: "failed",
            failureReason: "corrupt file",
            createdAt: "2026-01-15T00:00:00.000Z",
          },
        ]);
      }
      if (method === "DELETE" && urlStr.endsWith("/uploads/d1")) {
        return Promise.resolve({ ok: true, status: 204, json: () => Promise.resolve(undefined) } as unknown as Response);
      }
      throw new Error(`unexpected fetch: ${method} ${urlStr}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage({ accessToken: "a-token" });
    const user = userEvent.setup({ delay: null });

    await user.click(screen.getByLabelText(/right to use this material/i));
    const realFileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(realFileInput, file("notes.txt"));

    await waitFor(() => expect(screen.getByText("1 of 10 files added")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(screen.getByText("0 of 10 files added")).toBeInTheDocument());
    expect(screen.queryByText(/reached the 10-file-per-course limit/i)).not.toBeInTheDocument();
  });

  it("treats a 404 on Remove as an already-successful removal instead of showing a false error (review finding, AC #3)", async () => {
    // Simulates the outcome of a double-click race: this DELETE call is the "second"
    // request and lands after the document is already gone server-side.
    const fetchMock = vi.fn((url: unknown, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const urlStr = String(url);
      if (method === "POST" && urlStr.endsWith("/uploads")) {
        return jsonResponse(201, {
          id: "d1",
          customCourseId: "019fd450-b7cb-7a32-b021-42788045c71f",
          fileName: "notes.txt",
          fileType: "txt",
          fileSizeBytes: 5,
          status: "failed",
          failureReason: "corrupt file",
          createdAt: "2026-01-15T00:00:00.000Z",
        });
      }
      if (method === "GET" && urlStr.includes("/uploads?")) {
        return jsonResponse(200, [
          {
            id: "d1",
            customCourseId: "019fd450-b7cb-7a32-b021-42788045c71f",
            fileName: "notes.txt",
            fileType: "txt",
            fileSizeBytes: 5,
            status: "failed",
            failureReason: "corrupt file",
            createdAt: "2026-01-15T00:00:00.000Z",
          },
        ]);
      }
      if (method === "DELETE" && urlStr.endsWith("/uploads/d1")) {
        return jsonResponse(404, { error: { code: "NOT_FOUND", message: "document not found" } });
      }
      throw new Error(`unexpected fetch: ${method} ${urlStr}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage({ accessToken: "a-token" });
    const user = userEvent.setup({ delay: null });

    await user.click(screen.getByLabelText(/right to use this material/i));
    const realFileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(realFileInput, file("notes.txt"));

    await waitFor(() => expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument());
    expect(screen.queryByText(/document not found/i)).not.toBeInTheDocument();
  });

  it("shows the specific failure reason and next-step suggestion for a failed document, not a generic message (Story 2.11, AC #2, #3)", async () => {
    const fetchMock = vi.fn((url: unknown, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const urlStr = String(url);
      if (method === "POST" && urlStr.endsWith("/uploads")) {
        return jsonResponse(201, {
          id: "d1",
          customCourseId: "019fd450-b7cb-7a32-b021-42788045c71f",
          fileName: "notes.txt",
          fileType: "txt",
          fileSizeBytes: 5,
          status: "failed",
          failureReason: "encrypted file",
          createdAt: "2026-01-15T00:00:00.000Z",
        });
      }
      if (method === "GET" && urlStr.includes("/uploads?")) {
        return jsonResponse(200, [
          {
            id: "d1",
            customCourseId: "019fd450-b7cb-7a32-b021-42788045c71f",
            fileName: "notes.txt",
            fileType: "txt",
            fileSizeBytes: 5,
            status: "failed",
            failureReason: "encrypted file",
            createdAt: "2026-01-15T00:00:00.000Z",
          },
        ]);
      }
      throw new Error(`unexpected fetch: ${method} ${urlStr}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage({ accessToken: "a-token" });
    const user = userEvent.setup({ delay: null });

    await user.click(screen.getByLabelText(/right to use this material/i));
    const realFileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(realFileInput, file("notes.txt"));

    await waitFor(() => expect(screen.getByText(/encrypted file/)).toBeInTheDocument());
    expect(screen.getByText(/password protection/)).toBeInTheDocument();
  });
});
