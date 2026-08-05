import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AgeDeclarationPage } from "../../../src/modules/users/AgeDeclarationPage.js";

const useAuthMock = vi.fn();

vi.mock("../../../src/modules/auth/index.js", () => ({
  useAuth: () => useAuthMock(),
}));

function renderWithSession(session: { accessToken: string } | null, getMe: (accessToken: string) => Promise<unknown> = vi.fn()) {
  useAuthMock.mockReturnValue({ session, getMe });
  return render(
    <MemoryRouter initialEntries={["/age-declaration"]}>
      <Routes>
        <Route path="/age-declaration" element={<AgeDeclarationPage />} />
        <Route path="/login" element={<div>login page</div>} />
        <Route path="/waiting-for-consent" element={<div>waiting page</div>} />
        <Route path="/onboarding" element={<div>onboarding page</div>} />
        <Route path="/" element={<div>home page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AgeDeclarationPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useAuthMock.mockReset();
  });

  it("redirects to /login when there is no session", () => {
    renderWithSession(null);

    expect(screen.getByText("login page")).toBeInTheDocument();
  });

  it("does not show the parent-email field for an adult birthdate", async () => {
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Birthdate"), "1990-01-01");

    expect(screen.queryByLabelText("Parent or guardian's email")).not.toBeInTheDocument();
  });

  it("shows the parent-email field once the birthdate implies a minor", async () => {
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Birthdate"), "2015-01-01");

    expect(screen.getByLabelText("Parent or guardian's email")).toBeInTheDocument();
  });

  it("submits the adult branch and navigates home once /me reports onboarding is already complete", async () => {
    renderWithSession({ accessToken: "a-token" }, vi.fn().mockResolvedValue({ onboardingComplete: true, isMinor: false, parentalConsentStatus: "not_required", birthdate: "1990-01-01" }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ isMinor: false, parentalConsentStatus: "not_required" }),
      } as unknown as Response),
    );
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Birthdate"), "1990-01-01");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("home page")).toBeInTheDocument();
  });

  it("submits the adult branch and navigates to /onboarding when onboarding isn't complete yet (review finding: this page previously hardcoded navigate(\"/\"), skipping the onboarding redirect entirely)", async () => {
    const getMe = vi.fn().mockResolvedValue({ onboardingComplete: false, isMinor: false, parentalConsentStatus: "not_required", birthdate: "1990-01-01" });
    renderWithSession({ accessToken: "a-token" }, getMe);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ isMinor: false, parentalConsentStatus: "not_required" }),
      } as unknown as Response),
    );
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Birthdate"), "1990-01-01");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("onboarding page")).toBeInTheDocument();
    expect(getMe).toHaveBeenCalledWith("a-token");
  });

  it("navigates home instead of showing an error when getMe fails after declareAge already succeeded (review finding: previously stranded the user on a stale form)", async () => {
    const getMe = vi.fn().mockRejectedValue(new Error("expired token"));
    renderWithSession({ accessToken: "a-token" }, getMe);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ isMinor: false, parentalConsentStatus: "not_required" }),
      } as unknown as Response),
    );
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Birthdate"), "1990-01-01");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("home page")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("submits the minor branch with a parent email and navigates to the waiting screen", async () => {
    renderWithSession({ accessToken: "a-token" });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ isMinor: true, parentalConsentStatus: "pending" }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Birthdate"), "2015-01-01");
    await user.type(screen.getByLabelText("Parent or guardian's email"), "parent@example.com");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("waiting page")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/users/age-declaration"),
      expect.objectContaining({ body: JSON.stringify({ birthdate: "2015-01-01", parentEmail: "parent@example.com" }) }),
    );
  });

  it("renders the server error inline instead of navigating away", async () => {
    renderWithSession({ accessToken: "a-token" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: { code: "AGE_ALREADY_DECLARED", message: "you already declared your age" } }),
      } as unknown as Response),
    );
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Birthdate"), "1990-01-01");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("you already declared your age");
  });
});
