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

const DEFAULT_PRIVACY = { publicLeaderboardSharing: false, cohortDisplayName: true, uploadsForTraining: false };

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

/** Every test needs `GET /users/privacy-settings` answered — this stubs it with the
 * defaults, routing any other URL/method to a caller-supplied override. Review finding:
 * the fallback used to answer every unmatched request with the privacy-settings shape
 * regardless of URL/method, silently masking a forgotten override instead of failing
 * loudly — now it only recognizes the one request every test genuinely needs answered
 * by default and throws clearly for anything else. */
function stubFetch(overrides?: (url: string, init: RequestInit) => Promise<Response> | undefined) {
  const fetchMock = vi.fn().mockImplementation((url: string, init: RequestInit) => {
    const override = overrides?.(url, init);
    if (override) return override;
    if (url.includes("/users/privacy-settings") && init.method === "GET") return jsonResponse(DEFAULT_PRIVACY);
    throw new Error(`unstubbed fetch call: ${init.method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
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
    stubFetch();
    renderWithSession({ accessToken: "a-token" });

    await waitFor(() => expect(screen.getByDisplayValue("ananya")).toBeInTheDocument());
    expect(screen.getByText("AN")).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  it("loads and displays the fetched privacy settings as three switches with their correct on/off state", async () => {
    stubFetch();
    renderWithSession({ accessToken: "a-token" });

    await waitFor(() => expect(screen.getByRole("switch", { name: "Public leaderboard sharing" })).toBeInTheDocument());
    expect(screen.getByRole("switch", { name: "Public leaderboard sharing" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("switch", { name: "Display name in cohorts" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "Use my uploads to improve Usavvy" })).toHaveAttribute("aria-checked", "false");
  });

  it("renders explicitly-labeled placeholder sections for stars, streak, courses, and certificates, with no calls beyond the one real fetch (privacy settings — getMe is mocked directly)", async () => {
    const fetchMock = stubFetch();
    renderWithSession({ accessToken: "a-token" });

    await waitFor(() => expect(screen.getByDisplayValue("ananya")).toBeInTheDocument());

    expect(screen.getByText(/[Ss]tars/)).toBeInTheDocument();
    expect(screen.getByText(/[Ss]treak/)).toBeInTheDocument();
    expect(screen.getByText(/[Cc]ourses/)).toBeInTheDocument();
    expect(screen.getByText(/[Cc]ertificates/)).toBeInTheDocument();
    // getMe is mocked directly (not via fetch) in these tests, so the only real fetch
    // call expected is the mount-time GET /users/privacy-settings.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("editing the display name and blurring saves it and reflects the new value", async () => {
    const fetchMock = stubFetch((url, init) => (init.method === "PUT" ? jsonResponse({ ...DEFAULT_ME, displayName: "Ananya Sharma" }) : undefined));
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
    const fetchMock = stubFetch();
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByDisplayValue("ananya")).toBeInTheDocument());

    await user.click(screen.getByDisplayValue("ananya"));
    await user.tab();

    // Only the mount-time GET /users/privacy-settings — no PUT fired.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reverts to the previous display name and shows an inline error when the save fails", async () => {
    stubFetch((url, init) =>
      init.method === "PUT"
        ? (Promise.resolve({
            ok: false,
            json: () => Promise.resolve({ error: { code: "VALIDATION_ERROR", message: "name is invalid" } }),
          }) as unknown as Promise<Response>)
        : undefined,
    );
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

  it("toggling a privacy switch fires a partial PUT with just that field and doesn't disturb the other switches or the display name", async () => {
    const fetchMock = stubFetch((url, init) =>
      init.method === "PUT" ? jsonResponse({ ...DEFAULT_PRIVACY, publicLeaderboardSharing: true }) : undefined,
    );
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByRole("switch", { name: "Public leaderboard sharing" })).toBeInTheDocument());

    await user.click(screen.getByRole("switch", { name: "Public leaderboard sharing" }));

    await waitFor(() => expect(screen.getByRole("switch", { name: "Public leaderboard sharing" })).toHaveAttribute("aria-checked", "true"));
    const putCall = fetchMock.mock.calls.find((call) => (call[1] as RequestInit).method === "PUT");
    expect(putCall?.[1]).toMatchObject({ body: JSON.stringify({ publicLeaderboardSharing: true }) });
    expect(screen.getByRole("switch", { name: "Display name in cohorts" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "Use my uploads to improve Usavvy" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByDisplayValue("ananya")).toBeInTheDocument();
  });

  it("reverts a privacy toggle and shows an inline error when its save fails", async () => {
    stubFetch((url, init) =>
      init.method === "PUT"
        ? (Promise.resolve({
            ok: false,
            json: () => Promise.resolve({ error: { code: "VALIDATION_ERROR", message: "could not save privacy setting" } }),
          }) as unknown as Promise<Response>)
        : undefined,
    );
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByRole("switch", { name: "Public leaderboard sharing" })).toBeInTheDocument());

    await user.click(screen.getByRole("switch", { name: "Public leaderboard sharing" }));

    await waitFor(() => expect(screen.getByText("could not save privacy setting")).toBeInTheDocument());
    expect(screen.getByRole("switch", { name: "Public leaderboard sharing" })).toHaveAttribute("aria-checked", "false");
  });

  it("a race between an in-flight privacy-field save and a display-name save resolves correctly regardless of order (review finding: this exact cross-field scenario was claimed tested but wasn't)", async () => {
    const pending: Record<string, { resolve: (value: unknown) => void }> = {};
    stubFetch((url, init) => {
      if (init.method !== "PUT") return undefined;
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      const field = Object.keys(body)[0]!;
      return new Promise((resolve) => {
        pending[field] = {
          resolve: (value: unknown) =>
            resolve({
              ok: true,
              json: () => Promise.resolve(field === "displayName" ? { ...DEFAULT_ME, displayName: value } : { ...DEFAULT_PRIVACY, [field]: value }),
            } as unknown as Response),
        };
      });
    });
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByDisplayValue("ananya")).toBeInTheDocument());

    await user.clear(screen.getByDisplayValue("ananya"));
    await user.type(screen.getByRole("textbox", { name: "Display name" }), "New Name");
    await user.tab();
    await waitFor(() => expect(pending.displayName).toBeDefined());

    await user.click(screen.getByRole("switch", { name: "Public leaderboard sharing" }));
    await waitFor(() => expect(pending.publicLeaderboardSharing).toBeDefined());

    // Resolve the privacy toggle first, then the earlier-issued display-name save late.
    pending.publicLeaderboardSharing!.resolve(true);
    await waitFor(() => expect(screen.getByRole("switch", { name: "Public leaderboard sharing" })).toHaveAttribute("aria-checked", "true"));

    pending.displayName!.resolve("New Name");
    await waitFor(() => expect(screen.getByDisplayValue("New Name")).toBeInTheDocument());

    expect(screen.getByRole("switch", { name: "Public leaderboard sharing" })).toHaveAttribute("aria-checked", "true");
  });

  it("a race between two different in-flight privacy-field saves resolves correctly regardless of order", async () => {
    const pending: Record<string, { resolve: (value: boolean) => void }> = {};
    stubFetch((url, init) => {
      if (init.method !== "PUT") return undefined;
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      const field = Object.keys(body)[0]!;
      return new Promise((resolve) => {
        pending[field] = {
          resolve: (value: boolean) =>
            resolve({ ok: true, json: () => Promise.resolve({ ...DEFAULT_PRIVACY, [field]: value }) } as unknown as Response),
        };
      });
    });
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByRole("switch", { name: "Public leaderboard sharing" })).toBeInTheDocument());

    await user.click(screen.getByRole("switch", { name: "Public leaderboard sharing" }));
    await user.click(screen.getByRole("switch", { name: "Display name in cohorts" }));
    await waitFor(() => expect(pending.publicLeaderboardSharing).toBeDefined());
    await waitFor(() => expect(pending.cohortDisplayName).toBeDefined());

    // Resolve the second-issued request first...
    pending.cohortDisplayName!.resolve(false);
    await waitFor(() => expect(screen.getByRole("switch", { name: "Display name in cohorts" })).toHaveAttribute("aria-checked", "false"));

    // ...then the first-issued request, for a different field, resolves late.
    pending.publicLeaderboardSharing!.resolve(true);
    await waitFor(() => expect(screen.getByRole("switch", { name: "Public leaderboard sharing" })).toHaveAttribute("aria-checked", "true"));

    expect(screen.getByRole("switch", { name: "Display name in cohorts" })).toHaveAttribute("aria-checked", "false");
  });

  it("an earlier-issued save for the same privacy field's late-arriving response doesn't clobber a later-issued save for that field", async () => {
    const pending: Array<{ resolve: (value: boolean) => void }> = [];
    stubFetch((url, init) => {
      if (init.method !== "PUT") return undefined;
      return new Promise((resolve) => {
        pending.push({
          resolve: (value: boolean) =>
            resolve({ ok: true, json: () => Promise.resolve({ ...DEFAULT_PRIVACY, uploadsForTraining: value }) } as unknown as Response),
        });
      });
    });
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByRole("switch", { name: "Use my uploads to improve Usavvy" })).toBeInTheDocument());

    await user.click(screen.getByRole("switch", { name: "Use my uploads to improve Usavvy" }));
    await waitFor(() => expect(pending).toHaveLength(1));
    await user.click(screen.getByRole("switch", { name: "Use my uploads to improve Usavvy" }));
    await waitFor(() => expect(pending).toHaveLength(2));

    // Resolve the newer (second-issued) request first...
    pending[1]!.resolve(false);
    await waitFor(() => expect(screen.getByRole("switch", { name: "Use my uploads to improve Usavvy" })).toHaveAttribute("aria-checked", "false"));

    // ...then the older (first-issued) request resolves late and must be ignored.
    pending[0]!.resolve(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByRole("switch", { name: "Use my uploads to improve Usavvy" })).toHaveAttribute("aria-checked", "false");
  });

  it("an earlier-issued save's late-arriving response doesn't clobber a later-issued save (review finding: all three review layers independently flagged this race)", async () => {
    const pending: Array<{ resolve: (displayName: string) => void }> = [];
    stubFetch((url, init) => {
      if (init.method !== "PUT") return undefined;
      return new Promise((resolve) => {
        pending.push({
          resolve: (displayName: string) =>
            resolve({ ok: true, json: () => Promise.resolve({ ...DEFAULT_ME, displayName }) } as unknown as Response),
        });
      });
    });
    renderWithSession({ accessToken: "a-token" });
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByDisplayValue("ananya")).toBeInTheDocument());

    await user.clear(screen.getByDisplayValue("ananya"));
    await user.type(screen.getByRole("textbox", { name: "Display name" }), "First Edit");
    await user.tab();
    await waitFor(() => expect(pending).toHaveLength(1));

    await user.clear(screen.getByDisplayValue("First Edit"));
    await user.type(screen.getByRole("textbox", { name: "Display name" }), "Second Edit");
    await user.tab();
    await waitFor(() => expect(pending).toHaveLength(2));

    // Resolve the newer (second-issued) request first...
    pending[1]!.resolve("Second Edit");
    await waitFor(() => expect(screen.getByDisplayValue("Second Edit")).toBeInTheDocument());

    // ...then the older (first-issued) request resolves late and must be ignored, not
    // overwrite the newer save's already-applied result.
    pending[0]!.resolve("First Edit");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByDisplayValue("Second Edit")).toBeInTheDocument();
  });

  it("shows a generic error view when the initial getMe load fails", async () => {
    stubFetch();
    const getMe = vi.fn().mockRejectedValue(new Error("network down"));
    renderWithSession({ accessToken: "a-token" }, getMe);

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });

  it("shows a generic error view when the initial privacy-settings load fails", async () => {
    stubFetch(() => Promise.resolve({ ok: false, json: () => Promise.resolve({ error: { code: "INTERNAL_ERROR", message: "boom" } }) }) as unknown as Promise<Response>);
    renderWithSession({ accessToken: "a-token" });

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });
});
