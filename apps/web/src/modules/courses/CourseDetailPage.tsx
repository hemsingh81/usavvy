import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import type { CourseResponse } from "@usavvy/shared-types";
import { ApiError } from "../../shared/apiClient.js";
import { getWebConfig } from "../../app/config.js";
import { useAuth } from "../auth/index.js";
import { createCoursesApi } from "./api.js";

type ViewState = { kind: "loading" } | { kind: "ready"; course: CourseResponse } | { kind: "error"; message: string };

/**
 * Story 2.3 (FR-C-3). Reachable via a CatalogPage card link or a direct URL — no
 * persistent nav bar wires it up yet, the same already-accepted gap every prior
 * page-adding story in this codebase left open. "Start course"/"Customise before
 * starting" render disabled: neither destination exists yet (Story 2.4 owns
 * customisation; Epic 3/4 own actually starting a course).
 */
export function CourseDetailPage() {
  const { session } = useAuth();
  const { id } = useParams<{ id: string }>();
  const [view, setView] = useState<ViewState>({ kind: "loading" });

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
            <button type="button" className="usavvy-button-primary" disabled>
              Start course
            </button>
            {/* Story 2.4: wires this up for real — Epic 3/4 still own "Start course". */}
            <Link to={`/courses/${id}/customize`} className="usavvy-button-secondary">
              Customise before starting
            </Link>
          </div>
        </>
      ) : null}
    </main>
  );
}
