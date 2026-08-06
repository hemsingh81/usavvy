import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { UploadPage } from "../../../src/modules/uploads/UploadPage.js";

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
      jsonResponse(201, { id: "d1", customCourseId: "cc1", fileName: "notes.txt", fileType: "txt", fileSizeBytes: 5, status: "queued", createdAt: "2026-01-15T00:00:00.000Z" }),
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
        jsonResponse(201, { id: "d2", customCourseId: "cc1", fileName: "good.txt", fileType: "txt", fileSizeBytes: 5, status: "queued", createdAt: "2026-01-15T00:00:00.000Z" }),
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
      jsonResponse(201, { id: "d", customCourseId: "cc1", fileName: "x.txt", fileType: "txt", fileSizeBytes: 5, status: "queued", createdAt: "2026-01-15T00:00:00.000Z" }),
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
      jsonResponse(201, { id: "d", customCourseId: "cc1", fileName: "x.txt", fileType: "txt", fileSizeBytes: 5, status: "queued", createdAt: "2026-01-15T00:00:00.000Z" }),
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
      jsonResponse(201, { id: "d1", customCourseId: "cc1", fileName: "pasted-text.txt", fileType: "txt", fileSizeBytes: 20, status: "queued", createdAt: "2026-01-15T00:00:00.000Z" }),
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
      jsonResponse(201, { id: "d2", customCourseId: "cc1", fileName: "example.com.txt", fileType: "txt", fileSizeBytes: 40, status: "queued", createdAt: "2026-01-15T00:00:00.000Z" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderPage({ accessToken: "a-token" });
    const user = userEvent.setup();

    await user.click(screen.getByLabelText(/right to use this material/i));
    await user.type(screen.getByLabelText("Import from URL"), "https://example.com/article");
    await user.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => expect(screen.getByText("1 of 10 files added")).toBeInTheDocument());
  });
});
