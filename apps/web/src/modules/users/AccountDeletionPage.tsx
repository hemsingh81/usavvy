import { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { Button } from "../../shared/index.js";
import { ApiError } from "../../shared/apiClient.js";
import { getWebConfig } from "../../app/config.js";
import { useAuth } from "../auth/index.js";
import { createUsersApi } from "./api.js";

type ViewState = { kind: "confirming" } | { kind: "submitting" } | { kind: "done"; scheduledDeletionAt: string } | { kind: "error"; message: string };

/**
 * AC #1/#2/#3: a dedicated, single-purpose confirmation page (matching
 * AgeDeclarationPage/ParentalConsentPage's precedent for a one-time, high-consequence
 * action) — not a control bolted onto ProfilePage's freely-repeatable identity/privacy
 * edits. Protected — no session means no account to delete.
 */
export function AccountDeletionPage() {
  const { session } = useAuth();
  const [view, setView] = useState<ViewState>({ kind: "confirming" });
  const isMountedRef = useRef(true);
  useEffect(
    () => () => {
      isMountedRef.current = false;
    },
    [],
  );

  if (!session) {
    return <Navigate to="/login" replace />;
  }
  const { accessToken } = session;

  function handleConfirm(): void {
    setView({ kind: "submitting" });
    const { apiUrl } = getWebConfig();
    createUsersApi(apiUrl)
      .requestAccountDeletion(accessToken)
      .then((result) => {
        if (!isMountedRef.current) return;
        setView({ kind: "done", scheduledDeletionAt: result.scheduledDeletionAt });
      })
      .catch((error: unknown) => {
        if (!isMountedRef.current) return;
        setView({ kind: "error", message: error instanceof ApiError ? error.message : "something went wrong — please try again" });
      });
  }

  return (
    <main>
      <h1>Delete account</h1>
      {view.kind === "done" ? (
        <p role="status">
          Your account is scheduled for deletion on {new Date(view.scheduledDeletionAt).toLocaleDateString()}. Check your email for
          confirmation.
        </p>
      ) : (
        <>
          <p>
            Deleting your account will remove your personal data within 30 days. This can't be undone. We'll send a confirmation email
            once you confirm below.
          </p>
          {view.kind === "error" ? (
            <div className="usavvy-banner-error" role="alert">
              {view.message}
            </div>
          ) : null}
          <Button variant="destructive" disabled={view.kind === "submitting"} onClick={handleConfirm}>
            Delete my account
          </Button>
        </>
      )}
    </main>
  );
}
