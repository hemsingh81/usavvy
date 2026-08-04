import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { HomePage } from "../../src/app/HomePage.js";

describe("HomePage health-check display", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("renders System OK when gateway reports core as ok, calling fetch with the configured API URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ gateway: { status: "ok" }, core: { status: "ok", db: true, storage: true } }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    render(<HomePage />);

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

    render(<HomePage />);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/degraded/i));
  });

  it("renders a distinguishable, non-blank error state when the fetch itself fails (AD-17: no silent failure)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Failed to fetch")));

    render(<HomePage />);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/unable to reach system/i));
  });

  it("renders a distinguishable configuration-error state instead of blank-screening on an invalid VITE_API_URL (Review finding)", () => {
    vi.stubEnv("VITE_API_URL", "not-a-valid-url");

    render(<HomePage />);

    expect(screen.getByRole("alert")).toHaveTextContent(/configuration error/i);
  });
});
