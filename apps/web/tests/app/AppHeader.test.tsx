import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppHeader } from "../../src/app/AppHeader.js";

const useAuthMock = vi.fn();
const useNotificationsMock = vi.fn();

vi.mock("../../src/modules/auth/index.js", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("../../src/app/useNotifications.js", () => ({
  useNotifications: () => useNotificationsMock(),
}));

const RESOLVED_NOTIFICATION = {
  id: "n1",
  type: "info",
  message: "A resolved thing",
  sourceProcessType: "account_deletion",
  sourceProcessStatus: "resolved",
  readAt: null,
  createdAt: "2026-01-15T00:00:00.000Z",
};

const IN_PROGRESS_NOTIFICATION = {
  id: "n2",
  type: "account_deletion_requested",
  message: "Still going",
  sourceProcessType: "account_deletion",
  sourceProcessStatus: "in_progress",
  readAt: null,
  createdAt: "2026-01-16T00:00:00.000Z",
};

// Story 1.12 (retrofit): AppHeader now renders react-router-dom <Link>s, which need a
// Router ancestor to render at all — every render/rerender call needs this wrapper.
function renderHeader() {
  return render(
    <MemoryRouter>
      <AppHeader />
    </MemoryRouter>,
  );
}

// For the "clicking a nav link actually navigates" test — AppHeader itself renders no
// page content, so a real navigation assertion needs stub routes alongside it.
function renderHeaderWithRoutes() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <AppHeader />
      <Routes>
        <Route path="/" element={<p>Home page content</p>} />
        <Route path="/catalog" element={<p>Catalog page content</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AppHeader", () => {
  afterEach(() => {
    cleanup();
    useAuthMock.mockReset();
    useNotificationsMock.mockReset();
  });

  it("renders nothing with no session", () => {
    useAuthMock.mockReturnValue({ session: null });
    useNotificationsMock.mockReturnValue({ notifications: [], unreadCount: 0, markRead: vi.fn(), clear: vi.fn() });

    const { container } = renderHeader();

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the persistent nav with a link to every AC #2 page when a session exists, and none at all with no session (Story 1.12, AC #1, #2, #3)", () => {
    useAuthMock.mockReturnValue({ session: { accessToken: "a-token" } });
    useNotificationsMock.mockReturnValue({ notifications: [], unreadCount: 0, markRead: vi.fn(), clear: vi.fn() });

    renderHeader();

    const nav = screen.getByRole("navigation", { name: "Primary navigation" });
    const expectedLinks: [string, string][] = [
      ["Home", "/"],
      ["Catalog", "/catalog"],
      ["Upload content", "/upload-content"],
      ["Profile", "/profile"],
      ["Preferences", "/preferences"],
      ["Activity History", "/activity-history"],
      ["Account Deletion", "/account-deletion"],
      ["Data Export", "/data-export"],
    ];
    for (const [name, href] of expectedLinks) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    }
    expect(nav.querySelectorAll("a")).toHaveLength(expectedLinks.length);

    // AC #3, same assertion re-run with no session — the nav (and every link) must be
    // completely absent, not just empty, for a logged-out visitor.
    cleanup();
    useAuthMock.mockReturnValue({ session: null });
    renderHeader();
    expect(screen.queryByRole("navigation", { name: "Primary navigation" })).not.toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("clicking a nav link actually navigates to that route (Story 1.12, AC #1, #2)", async () => {
    useAuthMock.mockReturnValue({ session: { accessToken: "a-token" } });
    useNotificationsMock.mockReturnValue({ notifications: [], unreadCount: 0, markRead: vi.fn(), clear: vi.fn() });
    const user = userEvent.setup();
    renderHeaderWithRoutes();
    expect(screen.getByText("Home page content")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Catalog" }));

    expect(screen.getByText("Catalog page content")).toBeInTheDocument();
    expect(screen.queryByText("Home page content")).not.toBeInTheDocument();
  });

  it("clicking 'Log out' clears the session and navigates to /login (Story 1.12, review finding — logout() existed since Story 1.1 but no page had ever wired it to a control)", async () => {
    const logout = vi.fn();
    useAuthMock.mockReturnValue({ session: { accessToken: "a-token" }, logout });
    useNotificationsMock.mockReturnValue({ notifications: [], unreadCount: 0, markRead: vi.fn(), clear: vi.fn() });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/profile"]}>
        <AppHeader />
        <Routes>
          <Route path="/profile" element={<p>Profile page content</p>} />
          <Route path="/login" element={<p>Login page content</p>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "Log out" }));

    expect(logout).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Login page content")).toBeInTheDocument();
  });

  it("shows the unread dot only when unreadCount > 0", () => {
    useAuthMock.mockReturnValue({ session: { accessToken: "a-token" } });
    useNotificationsMock.mockReturnValue({ notifications: [], unreadCount: 0, markRead: vi.fn(), clear: vi.fn() });

    const { rerender } = renderHeader();
    expect(screen.queryByTestId("notification-unread-dot")).not.toBeInTheDocument();

    useNotificationsMock.mockReturnValue({ notifications: [RESOLVED_NOTIFICATION], unreadCount: 1, markRead: vi.fn(), clear: vi.fn() });
    rerender(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("notification-unread-dot")).toBeInTheDocument();
  });

  it("clicking the bell opens a panel listing notifications", async () => {
    useAuthMock.mockReturnValue({ session: { accessToken: "a-token" } });
    useNotificationsMock.mockReturnValue({
      notifications: [RESOLVED_NOTIFICATION, IN_PROGRESS_NOTIFICATION],
      unreadCount: 2,
      markRead: vi.fn(),
      clear: vi.fn(),
    });
    const user = userEvent.setup();
    renderHeader();

    await user.click(screen.getByRole("button", { name: /notifications/i }));

    expect(screen.getByText("A resolved thing")).toBeInTheDocument();
    expect(screen.getByText("Still going")).toBeInTheDocument();
  });

  it("clicking a notification marks it read", async () => {
    useAuthMock.mockReturnValue({ session: { accessToken: "a-token" } });
    const markRead = vi.fn().mockResolvedValue(undefined);
    useNotificationsMock.mockReturnValue({ notifications: [RESOLVED_NOTIFICATION], unreadCount: 1, markRead, clear: vi.fn() });
    const user = userEvent.setup();
    renderHeader();
    await user.click(screen.getByRole("button", { name: /notifications/i }));

    await user.click(screen.getByText("A resolved thing"));

    expect(markRead).toHaveBeenCalledWith("n1");
  });

  it("clear is disabled with a 'still in progress' tooltip for an in-progress notification", async () => {
    useAuthMock.mockReturnValue({ session: { accessToken: "a-token" } });
    useNotificationsMock.mockReturnValue({
      notifications: [IN_PROGRESS_NOTIFICATION],
      unreadCount: 1,
      markRead: vi.fn(),
      clear: vi.fn(),
    });
    const user = userEvent.setup();
    renderHeader();
    await user.click(screen.getByRole("button", { name: /notifications/i }));

    const clearButton = screen.getByRole("button", { name: /clear still going \(still in progress\)/i });
    expect(clearButton).toBeDisabled();
    expect(clearButton).toHaveAttribute("title", "still in progress");
  });

  it("clicking clear on a resolved notification removes it from the list", async () => {
    useAuthMock.mockReturnValue({ session: { accessToken: "a-token" } });
    const clear = vi.fn().mockResolvedValue(undefined);
    useNotificationsMock.mockReturnValue({ notifications: [RESOLVED_NOTIFICATION], unreadCount: 1, markRead: vi.fn(), clear });
    const user = userEvent.setup();
    renderHeader();
    await user.click(screen.getByRole("button", { name: /notifications/i }));

    await user.click(screen.getByRole("button", { name: "Clear A resolved thing" }));

    expect(clear).toHaveBeenCalledWith("n1");
  });

  it("shows an empty state when there are no notifications", async () => {
    useAuthMock.mockReturnValue({ session: { accessToken: "a-token" } });
    useNotificationsMock.mockReturnValue({ notifications: [], unreadCount: 0, markRead: vi.fn(), clear: vi.fn() });
    const user = userEvent.setup();
    renderHeader();

    await user.click(screen.getByRole("button", { name: /notifications/i }));

    await waitFor(() => expect(screen.getByText("No notifications")).toBeInTheDocument());
  });

  it("shows actionError as an alert inside the panel when a markRead/clear fails (review finding)", async () => {
    useAuthMock.mockReturnValue({ session: { accessToken: "a-token" } });
    useNotificationsMock.mockReturnValue({
      notifications: [RESOLVED_NOTIFICATION],
      unreadCount: 1,
      markRead: vi.fn(),
      clear: vi.fn(),
      actionError: "something went wrong — please try again",
    });
    const user = userEvent.setup();
    renderHeader();

    await user.click(screen.getByRole("button", { name: /notifications/i }));

    expect(screen.getByRole("alert")).toHaveTextContent("something went wrong — please try again");
  });

  it("resets the panel to closed when the session ends (review finding: a stale open panel previously snapped open for the next learner on login)", async () => {
    useAuthMock.mockReturnValue({ session: { accessToken: "a-token" } });
    useNotificationsMock.mockReturnValue({ notifications: [RESOLVED_NOTIFICATION], unreadCount: 1, markRead: vi.fn(), clear: vi.fn() });
    const user = userEvent.setup();
    const { rerender } = renderHeader();
    await user.click(screen.getByRole("button", { name: /notifications/i }));
    expect(screen.getByText("A resolved thing")).toBeInTheDocument();

    useAuthMock.mockReturnValue({ session: null });
    rerender(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>,
    );
    expect(screen.queryByText("A resolved thing")).not.toBeInTheDocument();

    useAuthMock.mockReturnValue({ session: { accessToken: "new-token" } });
    rerender(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>,
    );
    expect(screen.queryByText("A resolved thing")).not.toBeInTheDocument();
  });
});
