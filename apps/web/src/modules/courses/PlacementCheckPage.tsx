import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import type { PlacementCheckAnswerInput, PlacementCheckQuestion } from "@usavvy/shared-types";
import { ApiError } from "../../shared/apiClient.js";
import { getWebConfig } from "../../app/config.js";
import { useAuth } from "../auth/index.js";
import { createCoursesApi } from "./api.js";

type ViewState = { kind: "loading" } | { kind: "ready"; questions: PlacementCheckQuestion[] } | { kind: "error"; message: string };

/**
 * Story 2.5 (FR-C-5). Reachable from CustomizePage's "Take placement check" link. Scoring
 * is stateless (no save) — the resulting proposal is handed to CustomizePage via router
 * state for the learner to review and confirm (AC #2), not applied automatically.
 */
export function PlacementCheckPage() {
  const { session } = useAuth();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [view, setView] = useState<ViewState>({ kind: "loading" });
  const [answers, setAnswers] = useState<Map<string, PlacementCheckAnswerInput>>(new Map());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!session || !id) return;
    let cancelled = false;
    setView({ kind: "loading" });
    const { apiUrl } = getWebConfig();
    createCoursesApi(apiUrl)
      .getPlacementCheckQuestions(session.accessToken, id)
      .then((questions) => {
        if (cancelled) return;
        setView({ kind: "ready", questions });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setView({ kind: "error", message: error instanceof ApiError ? error.message : "something went wrong — please try again" });
      });
    return () => {
      cancelled = true;
    };
  }, [session?.accessToken, id]);

  function answer(question: PlacementCheckQuestion, masteryDemonstrated: boolean): void {
    setAnswers((current) => {
      const next = new Map(current);
      next.set(question.topicId, { topicId: question.topicId, conceptId: question.conceptId, masteryDemonstrated });
      return next;
    });
  }

  async function submit(): Promise<void> {
    if (view.kind !== "ready" || !session || !id) return;
    setSubmitting(true);
    try {
      const { apiUrl } = getWebConfig();
      const proposal = await createCoursesApi(apiUrl).scorePlacementCheck(session.accessToken, id, [...answers.values()]);
      navigate(`/courses/${id}/customize`, { state: { placementProposal: proposal } });
    } catch (error) {
      setView({ kind: "error", message: error instanceof ApiError ? error.message : "something went wrong — please try again" });
    } finally {
      setSubmitting(false);
    }
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return (
    <main>
      <h1>Placement check</h1>

      {view.kind === "loading" ? <p role="status">Loading…</p> : null}

      {view.kind === "error" ? (
        <div className="usavvy-banner-error" role="alert">
          {view.message}
        </div>
      ) : null}

      {view.kind === "ready" && view.questions.length === 0 ? (
        <div className="usavvy-catalog-empty">
          <p>No placement check available for this course yet.</p>
          <Link to={`/courses/${id}/customize`}>Back to customise</Link>
        </div>
      ) : null}

      {view.kind === "ready" && view.questions.length > 0 ? (
        <>
          <ul className="usavvy-customize-topic-list">
            {view.questions.map((question) => (
              <li key={question.topicId} className="usavvy-customize-topic-row">
                <span>{question.question}</span>
                <button type="button" onClick={() => answer(question, true)} disabled={submitting}>
                  I know this
                </button>
                <button type="button" onClick={() => answer(question, false)} disabled={submitting}>
                  I&apos;m not sure yet
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="usavvy-button-primary" onClick={() => void submit()} disabled={submitting}>
            Submit
          </button>
        </>
      ) : null}
    </main>
  );
}
