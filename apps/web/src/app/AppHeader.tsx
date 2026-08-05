import { useState } from "react";
import { useAuth } from "../modules/auth/index.js";
import { useNotifications } from "./useNotifications.js";

/**
 * Story 1.10 (FR-A-10). No persistent header/nav exists anywhere else in this app —
 * every page renders its own bare <main>. This is deliberately minimal: just enough
 * chrome to host the bell icon, not a full site-wide nav/branding redesign (see that
 * story's own Scope note).
 */
export function AppHeader() {
  const { session } = useAuth();
  const { notifications, unreadCount, markRead, clear } = useNotifications();
  const [open, setOpen] = useState(false);

  if (!session) {
    return null;
  }

  return (
    <header className="usavvy-app-header">
      <button
        type="button"
        className="usavvy-notification-bell"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">🔔</span>
        {unreadCount > 0 ? <span className="usavvy-notification-dot" data-testid="notification-unread-dot" /> : null}
      </button>

      {open ? (
        <div className="usavvy-notification-panel" role="region" aria-label="Notification Center">
          {notifications.length === 0 ? (
            <p className="usavvy-notification-empty">No notifications</p>
          ) : (
            <ul className="usavvy-notification-list">
              {notifications.map((notification) => (
                <li key={notification.id} className="usavvy-notification-item">
                  <button type="button" className="usavvy-notification-message" onClick={() => void markRead(notification.id)}>
                    {notification.readAt === null ? <span className="usavvy-notification-unread-marker" aria-hidden="true" /> : null}
                    {notification.message}
                  </button>
                  {notification.sourceProcessStatus === "in_progress" ? (
                    <button
                      type="button"
                      className="usavvy-notification-clear usavvy-notification-clear--locked"
                      disabled
                      title="still in progress"
                      aria-label={`Clear ${notification.message} (still in progress)`}
                    >
                      <span aria-hidden="true">🔒</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="usavvy-notification-clear"
                      aria-label={`Clear ${notification.message}`}
                      onClick={() => void clear(notification.id)}
                    >
                      <span aria-hidden="true">✕</span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </header>
  );
}
