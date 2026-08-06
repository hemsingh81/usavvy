import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import type { UploadedDocumentResponse } from "@usavvy/shared-types";
import { ApiError } from "../../shared/apiClient.js";
import { getWebConfig } from "../../app/config.js";
import { useAuth } from "../auth/index.js";
import { deleteUpload, importFromUrl, listUploads, pasteText, uploadFile, type UploadGroupKey } from "./api.js";
import { describeIngestionStatus } from "./ingestionStatus.js";

const MAX_FILES = 10;
// Story 2.14 (FR-C-14). Mirrors the server's z.uuid() shape check — validated up front
// so a malformed courseId (a bad/stale link) never enters the polling effect at all,
// rather than failing `listUploadsQuerySchema.parse` inside it on every single retry
// forever (that failure happens before any network call, so treating it as a
// transient blip and retrying could never succeed).
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Story 2.11 (FR-C-11), AC #1. This codebase's first polling UI — no react-query/swr
// precedent exists anywhere; a plain setInterval matches every other page's existing
// plain-fetch convention (see useNotifications.tsx) rather than adding a new dependency.
// Exported so tests can drive fake timers by the exact real interval, not a duplicated
// magic number.
export const POLL_INTERVAL_MS = 4000;

type FileResult = { fileName: string; kind: "success"; document: UploadedDocumentResponse } | { fileName: string; kind: "error"; message: string };

/**
 * Story 2.7/2.8 (FR-C-7/FR-C-8/FR-C-12). Reachable via a direct URL — no persistent nav
 * wiring yet, the same already-accepted gap every prior page-adding story in this
 * codebase left open. `customCourseId` lives only in this component's state — an
 * accepted MVP gap (see Story 2.7's Dev Notes): reloading the page starts a new batch.
 * File upload, pasted text, and URL import all share the same attestation checkbox and
 * running `results`/count — from `uploaded_documents`' perspective they're the same
 * kind of thing (Story 2.8's Dev Notes).
 *
 * Story 2.14 (FR-C-14): also renders at `/courses/:courseId/notes`, attaching personal
 * notes to an EXISTING catalog course instead of building a new custom course. Unlike
 * `customCourseId` (only learned from the first upload's response), `courseId` is known
 * immediately from the route — so this mode's polling/list fetch fires on mount, and no
 * "Review outline" link is ever shown (that flow doesn't exist for catalog-attached notes).
 */
export function UploadPage() {
  const { session } = useAuth();
  const { courseId: routeCourseId } = useParams<{ courseId?: string }>();
  const [customCourseId, setCustomCourseId] = useState<string | undefined>(undefined);
  const [copyrightAttested, setCopyrightAttested] = useState(false);
  const [results, setResults] = useState<FileResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [documents, setDocuments] = useState<UploadedDocumentResponse[]>([]);
  const [removeError, setRemoveError] = useState<string | undefined>(undefined);
  const [removingIds, setRemovingIds] = useState<ReadonlySet<string>>(new Set());
  const [loadError, setLoadError] = useState<string | undefined>(undefined);

  const accessToken = session?.accessToken;
  const routeCourseIdIsMalformed = Boolean(routeCourseId) && !UUID_PATTERN.test(routeCourseId as string);
  const activeGroupKey: UploadGroupKey | undefined =
    routeCourseId && !routeCourseIdIsMalformed ? { courseId: routeCourseId } : customCourseId ? { customCourseId } : undefined;

  // Story 2.11 (FR-C-11), AC #1: fetches the durable, server-side status list once a
  // grouping key is known, then polls while any listed document hasn't reached a status
  // this codebase can currently advance it past (see ingestionStatus.ts). In courseId
  // mode the grouping key is known immediately from the route, so this fires on mount;
  // in customCourseId mode it waits for the first upload's response to learn one.
  // Review finding: re-runs on every new `results` entry too, not just on
  // accessToken/the grouping key — customCourseId is set once from the FIRST upload and
  // never changes value for later files in the same batch, so without this dependency
  // a fast-completing first document could stop the effect from ever fetching files
  // #2+ into `documents` at all.
  useEffect(() => {
    if (!accessToken || !activeGroupKey) return;
    let cancelled = false;
    const { apiUrl } = getWebConfig();
    let intervalId: ReturnType<typeof setInterval> | undefined;

    async function fetchDocuments(): Promise<boolean> {
      try {
        const list = await listUploads(apiUrl, accessToken as string, activeGroupKey as UploadGroupKey);
        if (cancelled) return true;
        setDocuments(list);
        return list.every((document) => describeIngestionStatus(document.status, document.failureReason).isTerminal);
      } catch (error) {
        if (cancelled) return true;
        // Review finding: a malformed courseId in the URL (a bad/stale link) makes this
        // request fail with a VALIDATION_ERROR on every single retry, not just once —
        // unlike a transient blip (dropped request, momentary 401/5xx), retrying this
        // forever can never succeed. Surface it and stop polling; every other failure
        // still reports "not done" so the caller keeps retrying, matching AD-17's
        // no-silent-failure discipline without turning a permanent failure into an
        // infinite, silent retry loop.
        if (error instanceof ApiError && error.code === "VALIDATION_ERROR") {
          setLoadError(errorMessage(error));
          return true;
        }
        return false;
      }
    }

    void fetchDocuments().then((allTerminal) => {
      if (cancelled || allTerminal) return;
      intervalId = setInterval(() => {
        void fetchDocuments().then((done) => {
          if (done && intervalId !== undefined) clearInterval(intervalId);
        });
      }, POLL_INTERVAL_MS);
    });

    return () => {
      cancelled = true;
      if (intervalId !== undefined) clearInterval(intervalId);
    };
  }, [accessToken, routeCourseId, customCourseId, results.length]);

  async function handleRemove(id: string): Promise<void> {
    if (!accessToken || removingIds.has(id)) return;
    setRemoveError(undefined);
    setRemovingIds((current) => new Set(current).add(id));
    try {
      const { apiUrl } = getWebConfig();
      await deleteUpload(apiUrl, accessToken, id);
      dropDocument(id);
    } catch (error) {
      // Review finding: a 404 here means the document is already gone (e.g. a second
      // click's request landing after the first already succeeded) — that's the
      // outcome the learner wanted, not a failure to surface an alert for.
      if (error instanceof ApiError && error.code === "NOT_FOUND") {
        dropDocument(id);
      } else {
        setRemoveError(errorMessage(error));
      }
    } finally {
      setRemovingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  // Review finding: removing a document only updated `documents`, leaving the
  // client-side `results` upload log (and the `acceptedCount`/`atLimit` it drives)
  // stale — a learner removing a file to free a limit slot saw the limit stay stuck.
  function dropDocument(id: string): void {
    setDocuments((current) => current.filter((document) => document.id !== id));
    setResults((current) => current.filter((result) => !(result.kind === "success" && result.document.id === id)));
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  const acceptedCount = results.filter((r) => r.kind === "success").length;
  const atLimit = acceptedCount >= MAX_FILES;

  function errorMessage(error: unknown): string {
    return error instanceof ApiError ? error.message : "something went wrong — please try again";
  }

  // Learns customCourseId from the first upload's response in customCourseId mode; a
  // no-op in courseId mode (the server always returns customCourseId: null there).
  function learnCustomCourseId(document: UploadedDocumentResponse): void {
    if (document.customCourseId) setCustomCourseId(document.customCourseId);
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
          const document = await uploadFile(apiUrl, session.accessToken, activeCustomCourseId, routeCourseId, file, copyrightAttested);
          // In courseId mode, activeCustomCourseId must stay undefined for every file in
          // the batch — relying solely on the server always returning customCourseId:
          // null here would send both ids on the next file the moment that ever drifted.
          activeCustomCourseId = routeCourseId ? undefined : (document.customCourseId ?? undefined);
          localAcceptedCount += 1;
          learnCustomCourseId(document);
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
      const document = await pasteText(apiUrl, session.accessToken, customCourseId, routeCourseId, pastedText, copyrightAttested);
      learnCustomCourseId(document);
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
      const document = await importFromUrl(apiUrl, session.accessToken, customCourseId, routeCourseId, importUrl, copyrightAttested);
      learnCustomCourseId(document);
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
      <h1>{routeCourseId ? "Add personal notes to this course" : "Upload your content"}</h1>
      {routeCourseIdIsMalformed ? <p role="alert">This course link looks invalid — please go back and try again.</p> : null}
      {loadError ? <p role="alert">{loadError}</p> : null}
      <p>
        {routeCourseId
          ? "Upload PDF, DOCX, PPTX, TXT, or MD files (up to 50 MB and 300 pages each), paste text, or import from a URL to attach your own notes to this course."
          : "Upload PDF, DOCX, PPTX, TXT, or MD files (up to 50 MB and 300 pages each), paste text, or import from a URL to build a custom course."}
      </p>

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

      {documents.length > 0 ? (
        <section>
          <h2>Your uploaded documents</h2>
          {removeError ? <p role="alert">{removeError}</p> : null}
          <ul>
            {documents.map((document) => {
              const display = describeIngestionStatus(document.status, document.failureReason);
              return (
                <li key={document.id}>
                  <span>{document.fileName}</span>
                  <span role="status">{display.stageLabel}</span>
                  {!display.isFailure ? <progress value={display.progressPercent} max={100} /> : null}
                  {display.isFailure ? (
                    <span role="alert">
                      {display.failureReason}. {display.nextStepSuggestion}
                    </span>
                  ) : null}
                  <button type="button" onClick={() => void handleRemove(document.id)} disabled={removingIds.has(document.id)}>
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
          {/* Story 2.13 (FR-C-10): once every listed document is terminal and at least
              one reached "outline ready", the outline review screen has something to
              show — reached from here rather than a persistent nav entry (no AC calls
              for one; this is the one place a learner is already watching this specific
              custom course's progress). Story 2.14: never shown in courseId mode — a
              personal note attached to a catalog course skips outline proposal
              entirely and never reaches "outline ready" (see ingestDocument.ts). */}
          {!routeCourseId &&
          customCourseId &&
          documents.every((document) => describeIngestionStatus(document.status, document.failureReason).isTerminal) &&
          documents.some((document) => document.status === "outline ready") ? (
            <p>
              <Link to={`/upload-content/${customCourseId}/outline`}>Review outline</Link>
            </p>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
