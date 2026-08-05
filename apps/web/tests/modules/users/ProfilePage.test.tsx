import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProfilePage } from "../../../src/modules/users/ProfilePage.js";

const useAuthMock = vi.fn();

vi.mock("../../../src/modules/auth/index.js", () => ({
  useAuth: () => useAuthMock(),
}));

const DEFAULT_ME = {
  id: "u1",
  email: "ananya@example.com",
  emailVerified: true,
  role: "student",
  birthdate: null,
  isMinor: null,
  parentalConsentStatus: null,
  onboardingComplete: false,
  displayName: "ananya",
  memberSince: "2026-01-15T00:00:00.000Z",
};

function renderWithSession(session: { accessToken: string } | null, getMe = vi.fn().mockResolvedValue(DEFAULT_ME)) {
  useAuthMock.mockReturnValue({ session, getMe });
  return render(
    <MemoryRouter initialEntries={["/profile"]}>
      <Routes>
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/login" element={<div>login page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function jsonResponse(body: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as unknown as Response);
}

describe("ProfilePage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useAuthMock.mockReset();
  });

  it("redirects to /login when there is no session", () => {
    renderWithSession(null);

    expect(screen.getByText("login page")).toBeInTheDocument();
  });

  it("loads and displays the display name, member-since date, and avatar initials", async () => {
    renderWithSession({ accessToken: "a-token" });

    await waitFor(() => expect(screen.getByDisplayValue("ananya")).toBeInTheDocument());
    expect(screen.getByText("AN")).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  it("renders explicitly-labeled placeholder sections for stars, streak, courses, certificates, and privacy, with no extra network calls", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderWithSession({ accessToken: "a-token" });

    await waitFor(() => expect(screen.getByDisplayValue("ananya")).toBeInTheDocument());

    expect(screen.getByText(/[Ss]tars/)).toBeInTheDocument();
    expect(screen.getByText(/[Ss]treak/)).toBeInTheDocument();
    expect(screen.getByText(/[Cc]ourses/)).toBeInTheDocument();
    expect(screen.getByText(/[Cc]ertificates/)).toBeInTheDocument();
    expect(screen.getByText(/1\.6/)).toBeInTheDocument();
    // getMe is mocked directly (not via fetch) in these tests, so any placeholder
    // section wired to a real API call would show up here as an unexpected fetch call.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("editing the display name and blurring saves it and reflects the new value", async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ ...DEFAULT_ME, displayName: "Ananya Sharma" }));
    vi.stubGlobal("fetch", fetchMock);
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByDisplayValue("ananya")).toBeInTheDocument());

    const input = screen.getByDisplayValue("ananya");
    await user.clear(input);
    await user.type(input, "Ananya Sharma");
    await user.tab();

    await waitFor(() => expect(screen.getByDisplayValue("Ananya Sharma")).toBeInTheDocument());
    const putCall = fetchMock.mock.calls.find((call) => (call[1] as RequestInit).method === "PUT");
    expect(putCall?.[1]).toMatchObject({ body: JSON.stringify({ displayName: "Ananya Sharma" }) });
  });

  it("does not save when the display name is blurred unchanged", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByDisplayValue("ananya")).toBeInTheDocument());

    await user.click(screen.getByDisplayValue("ananya"));
    await user.tab();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reverts to the previous display name and shows an inline error when the save fails", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ error: { code: "VALIDATION_ERROR", message: "name is invalid" } }),
      } as unknown as Response),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByDisplayValue("ananya")).toBeInTheDocument());

    const input = screen.getByDisplayValue("ananya");
    await user.clear(input);
    await user.type(input, "Bad Name");
    await user.tab();

    await waitFor(() => expect(screen.getByText("name is invalid")).toBeInTheDocument());
    expect(screen.getByDisplayValue("ananya")).toBeInTheDocument();
  });

  it("shows a generic error view when the initial load fails", async () => {
    const getMe = vi.fn().mockRejectedValue(new Error("network down"));
    renderWithSession({ accessToken: "a-token" }, getMe);

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });
});
