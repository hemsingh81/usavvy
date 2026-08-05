import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { DataExportPage } from "../../../src/modules/users/DataExportPage.js";

const useAuthMock = vi.fn();

vi.mock("../../../src/modules/auth/index.js", () => ({
  useAuth: () => useAuthMock(),
}));

function renderWithSession(session: { accessToken: string } | null) {
  useAuthMock.mockReturnValue({ session });
  return render(
    <MemoryRouter initialEntries={["/data-export"]}>
      <Routes>
        <Route path="/data-export" element={<DataExportPage />} />
        <Route path="/login" element={<div>login page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("DataExportPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useAuthMock.mockReset();
  });

  it("redirects to /login when there is no session", () => {
    renderWithSession(null);

    expect(screen.getByText("login page")).toBeInTheDocument();
  });

  it("renders both download buttons", () => {
    renderWithSession({ accessToken: "a-token" });

    expect(screen.getByRole("button", { name: /download as json/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download as pdf/i })).toBeInTheDocument();
  });

  it("clicking 'Download as JSON' fetches the JSON route and triggers a blob download", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['{"account":{}}'], { type: "application/json" })),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);
    const createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /download as json/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/users/data-export/json"), expect.anything()));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });

  it("clicking 'Download as PDF' fetches the PDF route and triggers a blob download", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(["%PDF-1.4"], { type: "application/pdf" })),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);
    const createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /download as pdf/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/users/data-export/pdf"), expect.anything()));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
  });

  it("shows an inline error without removing the other button when a download fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: { code: "UNKNOWN_ERROR", message: "export failed" } }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /download as json/i }));

    await waitFor(() => expect(screen.getByText("export failed")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /download as pdf/i })).toBeInTheDocument();
  });
});
