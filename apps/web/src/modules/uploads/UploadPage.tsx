import { useState } from "react";
import { Navigate } from "react-router-dom";
import type { UploadedDocumentResponse } from "@usavvy/shared-types";
import { ApiError } from "../../shared/apiClient.js";
import { getWebConfig } from "../../app/config.js";
import { useAuth } from "../auth/index.js";
import { importFromUrl, pasteText, uploadFile } from "./api.js";

const MAX_FILES = 10;

type FileResult = { fileName: string; kind: "success"; document: UploadedDocumentResponse } | { fileName: string; kind: "error"; message: string };

/**
 * Story 2.7/2.8 (FR-C-7/FR-C-8/FR-C-12). Reachable via a direct URL — no persistent nav
 * wiring yet, the same already-accepted gap every prior page-adding story in this
 * codebase left open. `customCourseId` lives only in this component's state — an
 * accepted MVP gap (see Story 2.7's Dev Notes): reloading the page starts a new batch.
 * File upload, pasted text, and URL import all share the same attestation checkbox and
 * running `results`/count — from `uploaded_documents`' perspective they're the same
 * kind of thing (Story 2.8's Dev Notes).
 */
export function UploadPage() {
  const { session } = useAuth();
  const [customCourseId, setCustomCourseId] = useState<string | undefined>(undefined);
  const [copyrightAttested, setCopyrightAttested] = useState(false);
  const [results, setResults] = useState<FileResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const [importUrl, setImportUrl] = useState("");

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  const acceptedCount = results.filter((r) => r.kind === "success").length;
  const atLimit = acceptedCount >= MAX_FILES;

  function errorMessage(error: unknown): string {
    return error instanceof ApiError ? error.message : "something went wrong — please try again";
  }

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
      // file-to-file (see Story 2.7's Dev Notes). `localAcceptedCount` tracks progress
      // within this loop directly rather than reading back from React state, which
      // wouldn't yet reflect a setResults call from earlier in the same loop.
      for (const file of Array.from(files)) {
        if (localAcceptedCount >= MAX_FILES) {
          // Review finding: silently dropping every remaining file in this selection
          // (via `break`) left the learner with no indication those specific files were
          // skipped — every other rejection path names a reason (AD-17); this one must
          // too, matching AC #3's "the upload is blocked with a message."
          setResults((previous) => [...previous, { fileName: file.name, kind: "error", message: "10-file-per-course limit reached" }]);
          continue;
        }
        try {
          const document = await uploadFile(apiUrl, session.accessToken, activeCustomCourseId, file, copyrightAttested);
          activeCustomCourseId = document.customCourseId;
          localAcceptedCount += 1;
          setCustomCourseId(document.customCourseId);
          setResults((previous) => [...previous, { fileName: file.name, kind: "success", document }]);
        } catch (error) {
          setResults((previous) => [...previous, { fileName: file.name, kind: "error", message: errorMessage(error) }]);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function handlePasteText(): Promise<void> {
    if (!session || !pastedText.trim()) return;
    const label = "pasted-text.txt";
    if (!copyrightAttested) {
      setResults((previous) => [...previous, { fileName: label, kind: "error", message: "copyright attestation is required" }]);
      return;
    }
    if (atLimit) {
      setResults((previous) => [...previous, { fileName: label, kind: "error", message: "10-file-per-course limit reached" }]);
      return;
    }

    setBusy(true);
    try {
      const { apiUrl } = getWebConfig();
      const document = await pasteText(apiUrl, session.accessToken, customCourseId, pastedText, copyrightAttested);
      setCustomCourseId(document.customCourseId);
      setResults((previous) => [...previous, { fileName: label, kind: "success", document }]);
      setPastedText("");
    } catch (error) {
      setResults((previous) => [...previous, { fileName: label, kind: "error", message: errorMessage(error) }]);
    } finally {
      setBusy(false);
    }
  }

  async function handleUrlImport(): Promise<void> {
    if (!session || !importUrl.trim()) return;
    const label = importUrl;
    if (!copyrightAttested) {
      setResults((previous) => [...previous, { fileName: label, kind: "error", message: "copyright attestation is required" }]);
      return;
    }
    if (atLimit) {
      setResults((previous) => [...previous, { fileName: label, kind: "error", message: "10-file-per-course limit reached" }]);
      return;
    }

    setBusy(true);
    try {
      const { apiUrl } = getWebConfig();
      const document = await importFromUrl(apiUrl, session.accessToken, customCourseId, importUrl, copyrightAttested);
      setCustomCourseId(document.customCourseId);
      setResults((previous) => [...previous, { fileName: label, kind: "success", document }]);
      setImportUrl("");
    } catch (error) {
      setResults((previous) => [...previous, { fileName: label, kind: "error", message: errorMessage(error) }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>Upload your content</h1>
      <p>Upload PDF, DOCX, PPTX, TXT, or MD files (up to 50 MB and 300 pages each), paste text, or import from a URL to build a custom course.</p>

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

      <div>
        <label htmlFor="paste-text-input">Paste text</label>
        <textarea
          id="paste-text-input"
          value={pastedText}
          onChange={(event) => setPastedText(event.target.value)}
          disabled={busy || atLimit}
        />
        <button type="button" onClick={() => void handlePasteText()} disabled={busy || atLimit || !pastedText.trim()}>
          Add pasted text
        </button>
      </div>

      <div>
        <label htmlFor="url-import-input">Import from URL</label>
        <input
          id="url-import-input"
          type="url"
          value={importUrl}
          onChange={(event) => setImportUrl(event.target.value)}
          disabled={busy || atLimit}
        />
        <button type="button" onClick={() => void handleUrlImport()} disabled={busy || atLimit || !importUrl.trim()}>
          Import
        </button>
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
