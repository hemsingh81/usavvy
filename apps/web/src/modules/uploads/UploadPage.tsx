import { useState } from "react";
import { Navigate } from "react-router-dom";
import type { UploadedDocumentResponse } from "@usavvy/shared-types";
import { ApiError } from "../../shared/apiClient.js";
import { getWebConfig } from "../../app/config.js";
import { useAuth } from "../auth/index.js";
import { uploadFile } from "./api.js";

const MAX_FILES = 10;

type FileResult = { fileName: string; kind: "success"; document: UploadedDocumentResponse } | { fileName: string; kind: "error"; message: string };

/**
 * Story 2.7 (FR-C-7/FR-C-12). Reachable via a direct URL — no persistent nav wiring
 * yet, the same already-accepted gap every prior page-adding story in this codebase
 * left open. `customCourseId` lives only in this component's state — an accepted MVP
 * gap (see this story's Dev Notes): reloading the page starts a new batch.
 */
export function UploadPage() {
  const { session } = useAuth();
  const [customCourseId, setCustomCourseId] = useState<string | undefined>(undefined);
  const [copyrightAttested, setCopyrightAttested] = useState(false);
  const [results, setResults] = useState<FileResult[]>([]);
  const [busy, setBusy] = useState(false);

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  const acceptedCount = results.filter((r) => r.kind === "success").length;
  const atLimit = acceptedCount >= MAX_FILES;

  async function handleFiles(files: FileList | null): Promise<void> {
    if (!files || files.length === 0 || !session) return;
    if (!copyrightAttested) {
      setResults((previous) => [
        ...previous,
        ...Array.from(files).map((file): FileResult => ({ fileName: file.name, kind: "error", message: "copyright attestation is required" })),
      ]);
      return;
    }

    setBusy(true);
    try {
      const { apiUrl } = getWebConfig();
      let activeCustomCourseId = customCourseId;
      let localAcceptedCount = acceptedCount;
      // Sequential, not Promise.all — the first file's response supplies customCourseId
      // for every later file, and the running 10-file count must be accurate
      // file-to-file (see this story's Dev Notes). `localAcceptedCount` tracks progress
      // within this loop directly rather than reading back from React state, which
      // wouldn't yet reflect a setResults call from earlier in the same loop.
      for (const file of Array.from(files)) {
        if (localAcceptedCount >= MAX_FILES) break;
        try {
          const document = await uploadFile(apiUrl, session.accessToken, activeCustomCourseId, file, copyrightAttested);
          activeCustomCourseId = document.customCourseId;
          localAcceptedCount += 1;
          setCustomCourseId(document.customCourseId);
          setResults((previous) => [...previous, { fileName: file.name, kind: "success", document }]);
        } catch (error) {
          setResults((previous) => [
            ...previous,
            { fileName: file.name, kind: "error", message: error instanceof ApiError ? error.message : "something went wrong — please try again" },
          ]);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>Upload your content</h1>
      <p>Upload PDF, DOCX, PPTX, TXT, or MD files (up to 50 MB and 300 pages each) to build a custom course from your own material.</p>

      <label>
        <input type="checkbox" checked={copyrightAttested} onChange={(event) => setCopyrightAttested(event.target.checked)} />I confirm I have
        the right to use this material.
      </label>

      <div>
        <input
          type="file"
          multiple
          accept=".pdf,.docx,.pptx,.txt,.md"
          disabled={busy || atLimit}
          onChange={(event) => void handleFiles(event.target.files)}
        />
      </div>

      <p role="status">
        {acceptedCount} of {MAX_FILES} files added
      </p>
      {atLimit ? <p role="alert">You've reached the 10-file-per-course limit.</p> : null}

      <ul>
        {results.map((result, index) => (
          <li key={index}>
            {result.kind === "success" ? (
              <span>{result.fileName}: accepted</span>
            ) : (
              <span role="alert">
                {result.fileName}: {result.message}
              </span>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
