import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../modules/auth/index.js";
import { useNotifications } from "./useNotifications.js";

// Story 1.12 (retrofit, Sprint Change Proposal 2026-08-06): every already-shipped
// authenticated page (AC #2) — plus Home, which renders regardless of session and
// isn't one of AC #2's named pages but is the nav's standard brand/home link.
const NAV_LINKS: { to: string; label: string }[] = [
  { to: "/", label: "Home" },
  { to: "/catalog", label: "Catalog" },
  { to: "/upload-content", label: "Upload content" },
  { to: "/profile", label: "Profile" },
  { to: "/preferences", label: "Preferences" },
  { to: "/activity-history", label: "Activity History" },
  { to: "/account-deletion", label: "Account Deletion" },
  { to: "/data-export", label: "Data Export" },
];

/**
 * Story 1.10 (FR-A-10) built this as the notification bell only. Story 1.12 (retrofit)
 * adds the persistent nav (AC #1/#2) into the same session-gated component — the
 * existing `!session` early-return below already satisfies AC #3 (nav hidden on every
 * public route) for free, since a public route is by definition reached before a
 * `session` exists.
 */
export function AppHeader() {
  const { session, logout } = useAuth();
  const { notifications, unreadCount, markRead, clear, actionError } = useNotifications();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Review finding: `open` previously survived a logout/login cycle (this component
  // never unmounts, only returns null) — a different learner could log in and find the
  // panel already snapped open with no click of their own.
  useEffect(() => {
    if (!session) setOpen(false);
  }, [session]);

  // Epic 3 mock-first UX pass: DESIGN.md is explicit that app chrome "stays quiet so
  // the Board reads as the one high-energy surface in the product" — the Board's own
  // dark canvas replaces this header entirely rather than competing with it.
  if (!session || location.pathname.endsWith("/board")) {
    return null;
  }

  return (
    <header className="usavvy-app-header">
      <nav className="usavvy-app-nav" aria-label="Primary navigation">
        {NAV_LINKS.map((link) => (
          <Link key={link.to} to={link.to} className="usavvy-app-nav-link">
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="usavvy-app-header-actions">
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
        {/* Review finding: `logout()` has existed in useAuth since Story 1.1 but no page
            has ever wired it to a UI control — this shared header is now the first,
            and only, place a learner can actually end their session. */}
        <button
          type="button"
          className="usavvy-app-nav-link"
          onClick={() => {
            logout();
            navigate("/login");
          }}
        >
          Log out
        </button>
      </div>

      {open ? (
        <div className="usavvy-notification-panel" role="region" aria-label="Notification Center">
          {actionError ? (
            <p className="usavvy-message-error" role="alert">
              {actionError}
            </p>
          ) : null}
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
