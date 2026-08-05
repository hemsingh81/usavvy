import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { NotificationsProvider, useNotifications } from "../../src/app/useNotifications.js";

const useAuthMock = vi.fn();

vi.mock("../../src/modules/auth/index.js", () => ({
  useAuth: () => useAuthMock(),
}));

const NOTIFICATION_A = {
  id: "n1",
  type: "info",
  message: "first",
  sourceProcessType: null,
  sourceProcessStatus: null,
  readAt: null,
  createdAt: "2026-01-15T00:00:00.000Z",
};

const NOTIFICATION_B = {
  id: "n2",
  type: "account_deletion_requested",
  message: "still going",
  sourceProcessType: "account_deletion",
  sourceProcessStatus: "in_progress",
  readAt: null,
  createdAt: "2026-01-16T00:00:00.000Z",
};

function jsonResponse(body: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as unknown as Response);
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <NotificationsProvider>{children}</NotificationsProvider>;
}

describe("NotificationsProvider / useNotifications", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthMock.mockReset();
  });

  it("throws when used outside a NotificationsProvider", () => {
    expect(() => renderHook(() => useNotifications())).toThrow(/must be used within a NotificationsProvider/);
  });

  it("fetches and exposes notifications once a session exists", async () => {
    useAuthMock.mockReturnValue({ session: { accessToken: "a-token" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(await jsonResponse([NOTIFICATION_A, NOTIFICATION_B])));

    const { result } = renderHook(() => useNotifications(), { wrapper });

    await waitFor(() => expect(result.current.notifications).toHaveLength(2));
  });

  it("derives unreadCount from readAt", async () => {
    useAuthMock.mockReturnValue({ session: { accessToken: "a-token" } });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(await jsonResponse([NOTIFICATION_A, { ...NOTIFICATION_B, readAt: "2026-01-17T00:00:00.000Z" }])),
    );

    const { result } = renderHook(() => useNotifications(), { wrapper });

    await waitFor(() => expect(result.current.unreadCount).toBe(1));
  });

  it("does not fetch, and starts empty, when there is no session", () => {
    useAuthMock.mockReturnValue({ session: null });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useNotifications(), { wrapper });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.notifications).toEqual([]);
  });

  it("markRead surfaces an error via actionError rather than an unhandled rejection when the PUT fails (review finding)", async () => {
    useAuthMock.mockReturnValue({ session: { accessToken: "a-token" } });
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      if (init.method === "PUT") return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: { code: "NOT_FOUND", message: "gone" } }) } as unknown as Response);
      return jsonResponse([NOTIFICATION_A]);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));

    await act(async () => {
      await result.current.markRead("n1");
    });

    expect(result.current.actionError).toBe("gone");
  });

  it("clear surfaces an error via actionError rather than an unhandled rejection when the DELETE fails (review finding)", async () => {
    useAuthMock.mockReturnValue({ session: { accessToken: "a-token" } });
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      if (init.method === "DELETE") return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: { code: "NOTIFICATION_STILL_IN_PROGRESS", message: "still going" } }) } as unknown as Response);
      return jsonResponse([NOTIFICATION_A]);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));

    await act(async () => {
      await result.current.clear("n1");
    });

    expect(result.current.actionError).toBe("still going");
    // A failed clear must not remove the notification from local state.
    expect(result.current.notifications).toHaveLength(1);
  });

  it("markRead calls the API and updates only that notification in local state", async () => {
    useAuthMock.mockReturnValue({ session: { accessToken: "a-token" } });
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      if (init.method === "PUT") return jsonResponse({ ...NOTIFICATION_A, readAt: "2026-01-18T00:00:00.000Z" });
      return jsonResponse([NOTIFICATION_A]);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));

    await act(async () => {
      await result.current.markRead("n1");
    });

    expect(result.current.notifications[0]?.readAt).toBe("2026-01-18T00:00:00.000Z");
    const putCall = fetchMock.mock.calls.find((call) => (call[1] as RequestInit).method === "PUT");
    expect(putCall?.[0]).toContain("/users/notifications/n1/read");
  });

  it("clear calls the API and removes only that notification from local state", async () => {
    useAuthMock.mockReturnValue({ session: { accessToken: "a-token" } });
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      if (init.method === "DELETE") return Promise.resolve({ ok: true, json: () => Promise.resolve(undefined) } as unknown as Response);
      return jsonResponse([NOTIFICATION_A, { ...NOTIFICATION_B, sourceProcessStatus: "resolved" }]);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.notifications).toHaveLength(2));

    await act(async () => {
      await result.current.clear("n2");
    });

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0]?.id).toBe("n1");
    const deleteCall = fetchMock.mock.calls.find((call) => (call[1] as RequestInit).method === "DELETE");
    expect(deleteCall?.[0]).toContain("/users/notifications/n2");
  });

  it("resets to empty when the session ends (logout)", async () => {
    useAuthMock.mockReturnValue({ session: { accessToken: "a-token" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(await jsonResponse([NOTIFICATION_A])));

    const { result, rerender } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));

    useAuthMock.mockReturnValue({ session: null });
    rerender();

    await waitFor(() => expect(result.current.notifications).toHaveLength(0));
  });

  it("a mount-time fetch failure doesn't crash the app and leaves an empty list", async () => {
    useAuthMock.mockReturnValue({ session: { accessToken: "a-token" } });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const { result } = renderHook(() => useNotifications(), { wrapper });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current.notifications).toEqual([]);
  });

  it("a slower-resolving session's fetch doesn't clobber a newer session's list (stale-effect guard on session change)", async () => {
    useAuthMock.mockReturnValue({ session: { accessToken: "old-token" } });
    let resolveOldFetch: (value: unknown) => void = () => undefined;
    const pendingOldFetch = new Promise((resolve) => {
      resolveOldFetch = resolve;
    });
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string> | undefined;
      if (headers?.authorization === "Bearer old-token") return pendingOldFetch;
      return jsonResponse([NOTIFICATION_B]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(() => useNotifications(), { wrapper });

    // A new session (e.g. a fresh login) arrives before the old session's slow GET
    // resolves — its own fresh GET resolves first.
    useAuthMock.mockReturnValue({ session: { accessToken: "new-token" } });
    rerender();
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));

    // The old session's request finally resolves — its cleanup already ran (session
    // changed), so this must be ignored rather than overwriting the new session's list.
    resolveOldFetch(await jsonResponse([NOTIFICATION_A]));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result.current.notifications).toEqual([NOTIFICATION_B]);
  });
});
