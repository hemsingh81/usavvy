import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

describe("AppHeader", () => {
  afterEach(() => {
    cleanup();
    useAuthMock.mockReset();
    useNotificationsMock.mockReset();
  });

  it("renders nothing with no session", () => {
    useAuthMock.mockReturnValue({ session: null });
    useNotificationsMock.mockReturnValue({ notifications: [], unreadCount: 0, markRead: vi.fn(), clear: vi.fn() });

    const { container } = render(<AppHeader />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the unread dot only when unreadCount > 0", () => {
    useAuthMock.mockReturnValue({ session: { accessToken: "a-token" } });
    useNotificationsMock.mockReturnValue({ notifications: [], unreadCount: 0, markRead: vi.fn(), clear: vi.fn() });

    const { rerender } = render(<AppHeader />);
    expect(screen.queryByTestId("notification-unread-dot")).not.toBeInTheDocument();

    useNotificationsMock.mockReturnValue({ notifications: [RESOLVED_NOTIFICATION], unreadCount: 1, markRead: vi.fn(), clear: vi.fn() });
    rerender(<AppHeader />);
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
    render(<AppHeader />);

    await user.click(screen.getByRole("button", { name: /notifications/i }));

    expect(screen.getByText("A resolved thing")).toBeInTheDocument();
    expect(screen.getByText("Still going")).toBeInTheDocument();
  });

  it("clicking a notification marks it read", async () => {
    useAuthMock.mockReturnValue({ session: { accessToken: "a-token" } });
    const markRead = vi.fn().mockResolvedValue(undefined);
    useNotificationsMock.mockReturnValue({ notifications: [RESOLVED_NOTIFICATION], unreadCount: 1, markRead, clear: vi.fn() });
    const user = userEvent.setup();
    render(<AppHeader />);
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
    render(<AppHeader />);
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
    render(<AppHeader />);
    await user.click(screen.getByRole("button", { name: /notifications/i }));

    await user.click(screen.getByRole("button", { name: "Clear A resolved thing" }));

    expect(clear).toHaveBeenCalledWith("n1");
  });

  it("shows an empty state when there are no notifications", async () => {
    useAuthMock.mockReturnValue({ session: { accessToken: "a-token" } });
    useNotificationsMock.mockReturnValue({ notifications: [], unreadCount: 0, markRead: vi.fn(), clear: vi.fn() });
    const user = userEvent.setup();
    render(<AppHeader />);

    await user.click(screen.getByRole("button", { name: /notifications/i }));

    await waitFor(() => expect(screen.getByText("No notifications")).toBeInTheDocument());
  });
});
