import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { StrictMode } from "react";
import { ParentalConsentPage } from "../../../src/modules/users/ParentalConsentPage.js";

function renderAt(path: string, { strict = false }: { strict?: boolean } = {}) {
  const ui = (
    <MemoryRouter initialEntries={[path]}>
      <ParentalConsentPage />
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{ui}</StrictMode> : ui);
}

describe("ParentalConsentPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows an error immediately when no token is present in the URL", () => {
    renderAt("/parental-consent");

    expect(screen.getByRole("alert")).toHaveTextContent("no consent token was provided");
  });

  it("shows the success state once consent is recorded — issues no session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) } as unknown as Response));

    renderAt("/parental-consent?token=a-token");

    expect(await screen.findByRole("status")).toHaveTextContent(/consent/i);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows the server's error message when the token is invalid or expired", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: { code: "INVALID_TOKEN", message: "this consent link has expired" } }),
      } as unknown as Response),
    );

    renderAt("/parental-consent?token=a-token");

    expect(await screen.findByRole("alert")).toHaveTextContent("this consent link has expired");
    expect(screen.getByRole("link", { name: "Return home" })).toBeInTheDocument();
  });

  it("dedups the request under StrictMode's double-invoke — only one network call", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    renderAt("/parental-consent?token=a-token", { strict: true });

    await screen.findByRole("status");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
