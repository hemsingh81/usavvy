import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import type { CourseResponse } from "@usavvy/shared-types";
import { ApiError } from "../../shared/apiClient.js";
import { getWebConfig } from "../../app/config.js";
import { useAuth } from "../auth/index.js";
import { createCoursesApi } from "./api.js";

type ViewState = { kind: "loading" } | { kind: "ready"; course: CourseResponse } | { kind: "error"; message: string };

/**
 * Story 2.3 (FR-C-3), extended by Story 2.6 (FR-C-6). Reachable via a CatalogPage card
 * link or a direct URL — no persistent nav bar wires it up yet, the same already-accepted
 * gap every prior page-adding story in this codebase left open. "Start course" only
 * records access (AC #1) — it is explicitly NOT a real Epic 3/4 learning session, which
 * doesn't exist yet.
 */
export function CourseDetailPage() {
  const { session } = useAuth();
  const { id } = useParams<{ id: string }>();
  const [view, setView] = useState<ViewState>({ kind: "loading" });
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [updateNoticeDismissed, setUpdateNoticeDismissed] = useState(false);
  const [flaggedTopicTitles, setFlaggedTopicTitles] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!session || !id) return;
    let cancelled = false;
    setView({ kind: "loading" });
    const { apiUrl } = getWebConfig();
    createCoursesApi(apiUrl)
      .getCourse(session.accessToken, id)
      .then((course) => {
        if (cancelled) return;
        setView({ kind: "ready", course });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setView({ kind: "error", message: error instanceof ApiError ? error.message : "something went wrong — please try again" });
      });
    return () => {
      cancelled = true;
    };
  }, [session?.accessToken, id]);

  async function handleStart(): Promise<void> {
    if (!session || !id) return;
    setBusy(true);
    try {
      const { apiUrl } = getWebConfig();
      const result = await createCoursesApi(apiUrl).startCourse(session.accessToken, id);
      setStartedAt(result.startedAt);
    } catch (error) {
      setView({ kind: "error", message: error instanceof ApiError ? error.message : "something went wrong — please try again" });
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateToLatest(): Promise<void> {
    if (!session || !id) return;
    setBusy(true);
    try {
      const { apiUrl } = getWebConfig();
      const coursesApi = createCoursesApi(apiUrl);
      const result = await coursesApi.updateToLatestVersion(session.accessToken, id);
      // Review finding: the pin has now moved server-side, but `view.course` still held the
      // OLD version's content — re-fetching (the same URL id, which now transparently
      // resolves to the new pin) is required for the visible syllabus/title to actually
      // reflect what was just updated to.
      const refreshedCourse = await coursesApi.getCourse(session.accessToken, id);
      setView({ kind: "ready", course: refreshedCourse });
      setUpdateNoticeDismissed(true);
      setFlaggedTopicTitles(result.flaggedTopicTitles);
    } catch (error) {
      setView({ kind: "error", message: error instanceof ApiError ? error.message : "something went wrong — please try again" });
    } finally {
      setBusy(false);
    }
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return (
    <main>
      {view.kind === "loading" ? <p role="status">Loading…</p> : null}

      {view.kind === "error" ? (
        <div className="usavvy-banner-error" role="alert">
          {view.message}
        </div>
      ) : null}

      {view.kind === "ready" ? (
        <>
          {view.course.isPinnedToOlderVersion && !updateNoticeDismissed ? (
            <div className="usavvy-banner-info" role="status">
              <p>A newer version of this course is available.</p>
              <button type="button" onClick={() => void handleUpdateToLatest()} disabled={busy}>
                Update
              </button>
              <button type="button" onClick={() => setUpdateNoticeDismissed(true)} disabled={busy}>
                Dismiss
              </button>
            </div>
          ) : null}

          {flaggedTopicTitles && flaggedTopicTitles.length > 0 ? (
            <div className="usavvy-banner-info" role="status">
              <p>These topics changed since you customised this course and need your review: {flaggedTopicTitles.join(", ")}.</p>
              <Link to={`/courses/${id}/customize`}>review your customisation</Link>
            </div>
          ) : null}

          <h1>{view.course.title}</h1>
          {view.course.description ? <p>{view.course.description}</p> : null}

          <section>
            <h2>Syllabus</h2>
            <ol className="usavvy-course-syllabus">
              {view.course.modules.map((module_) => (
                <li key={module_.id}>
                  <h3>{module_.title}</h3>
                  <ol>
                    {module_.topics.map((topic) => (
                      <li key={topic.id}>{topic.title}</li>
                    ))}
                  </ol>
                </li>
              ))}
            </ol>
          </section>

          <p>Estimated hours: {view.course.estimatedDurationHours !== null ? `${view.course.estimatedDurationHours}h` : "not yet estimated"}</p>

          {view.course.prerequisites.length > 0 ? (
            <section>
              <h2>Prerequisites</h2>
              <ul>
                {view.course.prerequisites.map((prerequisite, index) => (
                  // Review finding: a plain string as `key` collided when the same
                  // prerequisite was listed twice; deduped at write time (createCourse) but
                  // the index is used here too since a string value is never a real identity.
                  <li key={index}>{prerequisite}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {view.course.outcomes.length > 0 ? (
            <section>
              <h2>Outcomes</h2>
              <ul>
                {view.course.outcomes.map((outcome, index) => (
                  <li key={index}>{outcome}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section>
            <h2>Sample session</h2>
            {view.course.sampleBoardAssetRef ? (
              <video src={view.course.sampleBoardAssetRef} controls data-testid="sample-board-video" />
            ) : (
              <p>Sample not yet available.</p>
            )}
          </section>

          <div className="usavvy-course-detail-ctas">
            {startedAt ? (
              <p role="status">You started this course.</p>
            ) : (
              <button type="button" className="usavvy-button-primary" onClick={() => void handleStart()} disabled={busy}>
                Start course
              </button>
            )}
            <Link to={`/courses/${id}/customize`} className="usavvy-button-secondary">
              Customise before starting
            </Link>
          </div>

          {/* Story 2.14 (FR-C-14): a secondary, lower-visual-weight action — attaching
              personal notes isn't a step in starting the course, so it doesn't compete
              with the primary "Start course"/"Customise" CTAs above for attention. */}
          <p>
            <Link to={`/courses/${id}/notes`}>Add your personal notes to this course</Link>
          </p>

          {/* Epic 3 mock-first UX pass (`_AI-Agile-Development/implementation-artifacts/
              epic-3-mock-first-ux-pass.md`) — a click-through preview with entirely
              mocked content, not the real board (Epic 3's backend hasn't been built
              yet). Clearly labeled "(preview)" so it's never mistaken for the real
              learning session Start course above leads toward. */}
          <p>
            <Link to={`/courses/${id}/board`}>Preview the interactive board (mock)</Link>
          </p>
        </>
      ) : null}
    </main>
  );
}
