import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { NotificationResponse } from "@usavvy/shared-types";
import { getWebConfig } from "./config.js";
import { ApiError } from "../shared/apiClient.js";
import { useAuth } from "../modules/auth/index.js";
import { createUsersApi } from "../modules/users/api.js";

export interface NotificationsContextValue {
  notifications: NotificationResponse[];
  unreadCount: number;
  markRead: (id: string) => Promise<void>;
  clear: (id: string) => Promise<void>;
  // Review finding: markRead/clear previously had no error handling at all — a failed
  // request became an unhandled promise rejection with no user-visible feedback and no
  // reconciliation of local state (AD-17). Surfaced here instead of thrown, since
  // AppHeader's callers fire these off with `void` rather than awaiting them.
  actionError: string | undefined;
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

/**
 * Story 1.10 (FR-A-10). Mirrors ColorThemeProvider's shape, including its own review-
 * round fix proactively applied here from the start: resets to empty when the session
 * ends (logout), rather than leaving a previous learner's notifications visible.
 *
 * Unlike ColorThemeProvider, markRead/clear never independently re-fetch the whole
 * list — they mutate local state directly from their own PUT/DELETE response — so
 * there's no second, independent GET in flight for a slow mount-time fetch to race
 * against. The existing `cancelled` guard (keyed on session change) is sufficient here.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [notifications, setNotifications] = useState<NotificationResponse[]>([]);
  const [actionError, setActionError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!session) {
      setNotifications([]);
      return;
    }
    let cancelled = false;
    const { apiUrl } = getWebConfig();
    createUsersApi(apiUrl)
      .getNotifications(session.accessToken)
      .then((result) => {
        if (cancelled) return;
        setNotifications(result);
      })
      .catch(() => {
        // Non-critical enrichment — same pattern as ColorThemeProvider's own mount fetch.
      });
    return () => {
      cancelled = true;
    };
  }, [session?.accessToken]);

  const markRead = useCallback(
    async (id: string): Promise<void> => {
      if (!session) return;
      setActionError(undefined);
      try {
        const { apiUrl } = getWebConfig();
        const updated = await createUsersApi(apiUrl).markNotificationRead(session.accessToken, id);
        setNotifications((current) => current.map((n) => (n.id === id ? updated : n)));
      } catch (error) {
        setActionError(error instanceof ApiError ? error.message : "something went wrong — please try again");
      }
    },
    [session?.accessToken],
  );

  const clear = useCallback(
    async (id: string): Promise<void> => {
      if (!session) return;
      setActionError(undefined);
      try {
        const { apiUrl } = getWebConfig();
        await createUsersApi(apiUrl).clearNotification(session.accessToken, id);
        setNotifications((current) => current.filter((n) => n.id !== id));
      } catch (error) {
        setActionError(error instanceof ApiError ? error.message : "something went wrong — please try again");
      }
    },
    [session?.accessToken],
  );

  const unreadCount = notifications.filter((n) => n.readAt === null).length;

  const value = useMemo<NotificationsContextValue>(
    () => ({ notifications, unreadCount, markRead, clear, actionError }),
    [notifications, unreadCount, markRead, clear, actionError],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsContextValue {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationsProvider");
  }
  return context;
}
