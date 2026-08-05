import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { HomePage } from "../../src/app/HomePage.js";

const useAuthMock = vi.fn();

vi.mock("../../src/modules/auth/index.js", () => ({
  useAuth: () => useAuthMock(),
}));

function renderHomePage(auth: { session: { accessToken: string } | null; getMe?: (accessToken: string) => Promise<unknown> }) {
  useAuthMock.mockReturnValue({ session: auth.session, getMe: auth.getMe ?? vi.fn() });
  return render(<HomePage apiUrl="http://localhost:3000" />);
}

describe("HomePage health-check display", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useAuthMock.mockReset();
  });

  it("renders System OK when gateway reports core as ok, calling fetch with the given API URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ gateway: { status: "ok" }, core: { status: "ok", db: true, storage: true } }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    renderHomePage({ session: null });

    await waitFor(() => expect(screen.getByText("System OK")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3000/health", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("renders a distinguishable, non-blank degraded state when core reports degraded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ gateway: { status: "ok" }, core: { status: "degraded", db: false, storage: true } }),
      } as unknown as Response),
    );

    renderHomePage({ session: null });

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/degraded/i));
  });

  it("renders a distinguishable, non-blank error state when the fetch itself fails (AD-17: no silent failure)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Failed to fetch")));

    renderHomePage({ session: null });

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/unable to reach system/i));
  });

  it("does not show the catalog CTA or call getMe when there is no session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ gateway: { status: "ok" }, core: { status: "ok", db: true, storage: true } }),
      } as unknown as Response),
    );
    const getMe = vi.fn();

    renderHomePage({ session: null, getMe });

    await waitFor(() => expect(screen.getByText("System OK")).toBeInTheDocument());
    expect(screen.queryByText("Browse the catalog")).not.toBeInTheDocument();
    expect(getMe).not.toHaveBeenCalled();
  });
});

describe("HomePage catalog CTA (Story 1.3)", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useAuthMock.mockReset();
  });

  it("shows the CTA once /me reports onboardingComplete: true", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ gateway: { status: "ok" }, core: { status: "ok", db: true, storage: true } }),
      } as unknown as Response),
    );
    const getMe = vi.fn().mockResolvedValue({ onboardingComplete: true });

    renderHomePage({ session: { accessToken: "a-token" }, getMe });

    await waitFor(() => expect(screen.getByText("Browse the catalog")).toBeInTheDocument());
    expect(getMe).toHaveBeenCalledWith("a-token");
  });

  it("does not show the CTA when /me reports onboardingComplete: false", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ gateway: { status: "ok" }, core: { status: "ok", db: true, storage: true } }),
      } as unknown as Response),
    );
    const getMe = vi.fn().mockResolvedValue({ onboardingComplete: false });

    renderHomePage({ session: { accessToken: "a-token" }, getMe });

    await waitFor(() => expect(getMe).toHaveBeenCalled());
    expect(screen.queryByText("Browse the catalog")).not.toBeInTheDocument();
  });

  it("does not crash and still shows the health check when getMe fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ gateway: { status: "ok" }, core: { status: "ok", db: true, storage: true } }),
      } as unknown as Response),
    );
    const getMe = vi.fn().mockRejectedValue(new Error("expired session"));

    renderHomePage({ session: { accessToken: "a-token" }, getMe });

    await waitFor(() => expect(screen.getByText("System OK")).toBeInTheDocument());
    expect(screen.queryByText("Browse the catalog")).not.toBeInTheDocument();
  });
});
