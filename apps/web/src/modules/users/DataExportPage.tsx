import { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { Button } from "../../shared/index.js";
import { apiRequestBlob, ApiError } from "../../shared/apiClient.js";
import { getWebConfig } from "../../app/config.js";
import { useAuth } from "../auth/index.js";

type Format = "json" | "pdf";

const FORMAT_CONFIG: Record<Format, { path: string; filename: string; label: string }> = {
  json: { path: "/users/data-export/json", filename: "usavvy-data-export.json", label: "Download as JSON" },
  pdf: { path: "/users/data-export/pdf", filename: "usavvy-data-export.pdf", label: "Download as PDF" },
};

/**
 * AC #1: on-demand actions, not page data to load (matches AccountDeletionPage's
 * confirm-on-click shape, not ProfilePage's load-on-mount shape). Protected — no
 * session means no data to export.
 */
export function DataExportPage() {
  const { session } = useAuth();
  const [errors, setErrors] = useState<Partial<Record<Format, string>>>({});
  const [downloading, setDownloading] = useState<Partial<Record<Format, boolean>>>({});
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

  function handleDownload(format: Format): void {
    // Belt-and-suspenders alongside the button's own `disabled` prop below — React
    // commits this synchronous setDownloading before the event loop can dispatch a
    // second click, so the `disabled` attribute is what actually prevents re-entrancy
    // in practice; this guard costs nothing and covers it too if that ever changes.
    if (downloading[format]) return;
    setErrors((current) => ({ ...current, [format]: undefined }));
    setDownloading((current) => ({ ...current, [format]: true }));
    const { apiUrl } = getWebConfig();
    const { path, filename } = FORMAT_CONFIG[format];
    apiRequestBlob(apiUrl, path, accessToken)
      .then((blob) => {
        if (!isMountedRef.current) return;
        const url = URL.createObjectURL(blob);
        // Review finding: an un-appended, un-cleaned-up anchor and an immediate
        // synchronous revokeObjectURL are both known-fragile across browsers — some
        // haven't necessarily finished reading the blob URL by the time it's revoked
        // in the same tick. Appending to the DOM and deferring the revoke avoids both.
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
      })
      .catch((error: unknown) => {
        if (!isMountedRef.current) return;
        setErrors((current) => ({
          ...current,
          [format]: error instanceof ApiError ? error.message : "something went wrong — please try again",
        }));
      })
      .finally(() => {
        if (!isMountedRef.current) return;
        setDownloading((current) => ({ ...current, [format]: false }));
      });
  }

  return (
    <main>
      <h1>Export your data</h1>
      <p>Download a copy of your account and profile data (Learner Profile, preferences, privacy settings).</p>

      <Button disabled={downloading.json} onClick={() => handleDownload("json")}>
        Download as JSON
      </Button>
      {errors.json ? (
        <span className="usavvy-message-error" role="alert">
          {errors.json}
        </span>
      ) : null}

      <Button disabled={downloading.pdf} onClick={() => handleDownload("pdf")}>
        Download as PDF
      </Button>
      {errors.pdf ? (
        <span className="usavvy-message-error" role="alert">
          {errors.pdf}
        </span>
      ) : null}
    </main>
  );
}
