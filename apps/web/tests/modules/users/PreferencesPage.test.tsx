import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PreferencesPage } from "../../../src/modules/users/PreferencesPage.js";

const useAuthMock = vi.fn();

vi.mock("../../../src/modules/auth/index.js", () => ({
  useAuth: () => useAuthMock(),
}));

const DEFAULT_PREFERENCES = {
  voiceEnabled: true,
  speechRate: 1,
  boardTheme: "dark",
  explanationStyle: "concise",
  captionsEnabled: false,
  reducedMotion: false,
};

function renderWithSession(session: { accessToken: string } | null) {
  useAuthMock.mockReturnValue({ session });
  return render(
    <MemoryRouter initialEntries={["/preferences"]}>
      <Routes>
        <Route path="/preferences" element={<PreferencesPage />} />
        <Route path="/login" element={<div>login page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function jsonResponse(body: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as unknown as Response);
}

describe("PreferencesPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useAuthMock.mockReset();
  });

  it("redirects to /login when there is no session", () => {
    renderWithSession(null);

    expect(screen.getByText("login page")).toBeInTheDocument();
  });

  it("loads and displays the fetched preferences", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(await jsonResponse({ ...DEFAULT_PREFERENCES, boardTheme: "paper" })));
    renderWithSession({ accessToken: "a-token" });

    await waitFor(() => expect(screen.getByLabelText("Board theme")).toHaveValue("paper"));
    expect(screen.getByRole("switch", { name: "Voice" })).toHaveAttribute("aria-checked", "true");
  });

  it("toggling a switch fires a partial PUT with just that field and doesn't disturb other displayed values", async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      if (init.method === "GET") return jsonResponse(DEFAULT_PREFERENCES);
      return jsonResponse({ ...DEFAULT_PREFERENCES, voiceEnabled: false });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByRole("switch", { name: "Voice" })).toBeInTheDocument());
    await user.click(screen.getByRole("switch", { name: "Voice" }));

    await waitFor(() => expect(screen.getByRole("switch", { name: "Voice" })).toHaveAttribute("aria-checked", "false"));
    const putCall = fetchMock.mock.calls.find((call) => (call[1] as RequestInit).method === "PUT");
    expect(putCall?.[1]).toMatchObject({ body: JSON.stringify({ voiceEnabled: false }) });
    // The other switches keep their previously-loaded values, unaffected.
    expect(screen.getByRole("switch", { name: "Captions" })).toHaveAttribute("aria-checked", "false");
  });

  it("changing the board theme select saves just that field", async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      if (init.method === "GET") return jsonResponse(DEFAULT_PREFERENCES);
      return jsonResponse({ ...DEFAULT_PREFERENCES, boardTheme: "paper" });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByLabelText("Board theme")).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText("Board theme"), "paper");

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find((call) => (call[1] as RequestInit).method === "PUT");
      expect(putCall?.[1]).toMatchObject({ body: JSON.stringify({ boardTheme: "paper" }) });
    });
  });

  it("reverts an optimistic update and shows an inline error when a save fails, without losing other state", async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      if (init.method === "GET") return jsonResponse(DEFAULT_PREFERENCES);
      return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: { code: "VALIDATION_ERROR", message: "could not save" } }) } as unknown as Response);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByRole("switch", { name: "Voice" })).toBeInTheDocument());
    await user.click(screen.getByRole("switch", { name: "Voice" }));

    await waitFor(() => expect(screen.getByText("could not save")).toBeInTheDocument());
    // Reverted back to the loaded value rather than staying optimistically toggled.
    expect(screen.getByRole("switch", { name: "Voice" })).toHaveAttribute("aria-checked", "true");
  });

  it("a slower-resolving save for one field doesn't clobber a faster-resolving save for a different field (review finding: all three review layers independently flagged this race)", async () => {
    const pending: Record<string, { resolve: (value: unknown) => void }> = {};
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      if (init.method === "GET") return jsonResponse(DEFAULT_PREFERENCES);
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      const field = Object.keys(body)[0] as string;
      return new Promise((resolve) => {
        pending[field] = {
          resolve: (fieldValue: unknown) =>
            resolve({ ok: true, json: () => Promise.resolve({ ...DEFAULT_PREFERENCES, [field]: fieldValue }) } as unknown as Response),
        };
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByRole("switch", { name: "Voice" })).toBeInTheDocument());

    // Issue the "voice" save first, then the "captions" save — but resolve captions'
    // request FIRST, simulating out-of-order network responses.
    await user.click(screen.getByRole("switch", { name: "Voice" }));
    await user.click(screen.getByRole("switch", { name: "Captions" }));
    await waitFor(() => expect(pending.voiceEnabled).toBeDefined());
    await waitFor(() => expect(pending.captionsEnabled).toBeDefined());

    pending.captionsEnabled!.resolve(true);
    await waitFor(() => expect(screen.getByRole("switch", { name: "Captions" })).toHaveAttribute("aria-checked", "true"));

    pending.voiceEnabled!.resolve(false);
    await waitFor(() => expect(screen.getByRole("switch", { name: "Voice" })).toHaveAttribute("aria-checked", "false"));

    // The earlier-issued, later-resolving voiceEnabled response must not have reset
    // captions back to the stale value it carried in its own response snapshot.
    expect(screen.getByRole("switch", { name: "Captions" })).toHaveAttribute("aria-checked", "true");
  });
});
