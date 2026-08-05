import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { OnboardingWizardPage } from "../../../src/modules/users/OnboardingWizardPage.js";

const useAuthMock = vi.fn();

vi.mock("../../../src/modules/auth/index.js", () => ({
  useAuth: () => useAuthMock(),
}));

const EMPTY_PROFILE = {
  goal: null,
  interests: null,
  availability: null,
  sessionLengthMinutes: null,
  targetCompletionDate: null,
  level: null,
  currentStep: 0,
  completedAt: null,
};

function renderWithSession(session: { accessToken: string } | null) {
  useAuthMock.mockReturnValue({ session });
  return render(
    <MemoryRouter initialEntries={["/onboarding"]}>
      <Routes>
        <Route path="/onboarding" element={<OnboardingWizardPage />} />
        <Route path="/login" element={<div>login page</div>} />
        <Route path="/" element={<div>home page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function jsonResponse(body: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as unknown as Response);
}

describe("OnboardingWizardPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useAuthMock.mockReset();
  });

  it("redirects to /login when there is no session", () => {
    renderWithSession(null);

    expect(screen.getByText("login page")).toBeInTheDocument();
  });

  it("resumes at the abandoned step reported by the server", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(await jsonResponse({ ...EMPTY_PROFILE, goal: "learn calculus", interests: ["math"], currentStep: 2 })),
    );
    renderWithSession({ accessToken: "a-token" });

    await waitFor(() => expect(screen.getByText("Step 3 of 6")).toBeInTheDocument());
    expect(screen.getByText(/How many hours are you available/i)).toBeInTheDocument();
  });

  it("walks through the goal step and advances to interests", async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      if (init.method === "GET") return jsonResponse(EMPTY_PROFILE);
      return jsonResponse({ ...EMPTY_PROFILE, goal: "learn calculus", currentStep: 1 });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText("Step 1 of 6")).toBeInTheDocument());
    await user.type(screen.getByLabelText("What's your learning goal?"), "learn calculus");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(screen.getByText("Step 2 of 6")).toBeInTheDocument());
    expect(screen.getByLabelText(/Subject interests/)).toBeInTheDocument();
  });

  it("the targetDate step's Skip action submits value: null and still advances", async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      if (init.method === "GET") return jsonResponse({ ...EMPTY_PROFILE, currentStep: 4 });
      return jsonResponse({ ...EMPTY_PROFILE, currentStep: 5 });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText("Step 5 of 6")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Skip" }));

    await waitFor(() => expect(screen.getByText("Step 6 of 6")).toBeInTheDocument());
    const putCall = fetchMock.mock.calls.find((call) => (call[1] as RequestInit).method === "PUT");
    expect(putCall?.[1]).toMatchObject({ body: JSON.stringify({ step: "targetDate", value: null }) });
  });

  it("navigates home once the final (level) step completes", async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      if (init.method === "GET") return jsonResponse({ ...EMPTY_PROFILE, currentStep: 5 });
      return jsonResponse({ ...EMPTY_PROFILE, currentStep: 6, level: "beginner", completedAt: "2026-08-05T00:00:00.000Z" });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText("Step 6 of 6")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Finish" }));

    await waitFor(() => expect(screen.getByText("home page")).toBeInTheDocument());
  });

  it("redirects home immediately on load if onboarding is already complete", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(await jsonResponse({ ...EMPTY_PROFILE, currentStep: 6, completedAt: "2026-08-05T00:00:00.000Z" })),
    );
    renderWithSession({ accessToken: "a-token" });

    await waitFor(() => expect(screen.getByText("home page")).toBeInTheDocument());
  });

  it("Back navigates to the previous step without an API call", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(await jsonResponse({ ...EMPTY_PROFILE, goal: "learn calculus", currentStep: 1 })));
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText("Step 2 of 6")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Back" }));

    await waitFor(() => expect(screen.getByText("Step 1 of 6")).toBeInTheDocument());
    expect(screen.getByLabelText("What's your learning goal?")).toHaveValue("learn calculus");
  });
});
