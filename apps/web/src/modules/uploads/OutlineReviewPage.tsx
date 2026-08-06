import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import type { ProposedTopicResponse } from "@usavvy/shared-types";
import { ApiError } from "../../shared/apiClient.js";
import { getWebConfig } from "../../app/config.js";
import { useAuth } from "../auth/index.js";
import {
  confirmOutline,
  deleteProposedConcept,
  deleteProposedTopic,
  listOutline,
  mergeProposedConcepts,
  renameProposedConcept,
  renameProposedTopic,
  reorderProposedTopics,
  setProposedConceptPriority,
  setProposedTopicPriority,
} from "./api.js";

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "something went wrong — please try again";
}

/**
 * Story 2.13 (FR-C-10). Reachable from UploadPage once a custom course's outline is
 * ready — not a persistent nav entry (no AC calls for one). Reorder is a bulk "move
 * up/down" action, not drag-and-drop (Scope Note); merge is a "merge into a sibling
 * concept" select, restricted to the same proposed Topic (Scope Note — a cross-Topic
 * merge is rejected server-side too, this just never offers it as an option).
 */
export function OutlineReviewPage() {
  const { session } = useAuth();
  const { customCourseId } = useParams<{ customCourseId: string }>();
  const [topics, setTopics] = useState<ProposedTopicResponse[]>([]);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [actionError, setActionError] = useState<string | undefined>(undefined);
  const [confirming, setConfirming] = useState(false);
  const [confirmedCourseId, setConfirmedCourseId] = useState<string | undefined>(undefined);

  const accessToken = session?.accessToken;

  useEffect(() => {
    if (!accessToken || !customCourseId) return;
    let cancelled = false;
    const { apiUrl } = getWebConfig();
    listOutline(apiUrl, accessToken, customCourseId)
      .then((result) => {
        if (!cancelled) setTopics(result);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(errorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, customCourseId]);

  async function refresh(): Promise<void> {
    if (!accessToken || !customCourseId) return;
    const { apiUrl } = getWebConfig();
    setTopics(await listOutline(apiUrl, accessToken, customCourseId));
  }

  function withErrorHandling(action: () => Promise<void>): () => void {
    return () => {
      setActionError(undefined);
      void action()
        .then(() => refresh())
        .catch((error: unknown) => setActionError(errorMessage(error)));
    };
  }

  if (!session || !accessToken) {
    return <Navigate to="/login" replace />;
  }
  if (!customCourseId) {
    return <Navigate to="/upload-content" replace />;
  }
  // TypeScript doesn't carry the narrowing from the guards above into the nested
  // function declarations below — these locals give them a genuinely non-optional type.
  const safeAccessToken: string = accessToken;
  const safeCustomCourseId: string = customCourseId;

  const { apiUrl } = getWebConfig();

  function moveTopic(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= topics.length) return;
    const reordered = [...topics];
    const temp = reordered[index] as ProposedTopicResponse;
    reordered[index] = reordered[target] as ProposedTopicResponse;
    reordered[target] = temp;
    withErrorHandling(() => reorderProposedTopics(apiUrl, safeAccessToken, safeCustomCourseId, reordered.map((t) => t.id)))();
  }

  // Review finding: a 404 here means the topic/concept is already gone (e.g. a second
  // click's request landing after the first already succeeded) — that's the outcome the
  // learner wanted, not a failure to surface an alert for (Story 2.11 precedent).
  function handleDeleteTopic(topicId: string): void {
    setActionError(undefined);
    void deleteProposedTopic(apiUrl, safeAccessToken, topicId)
      .catch((error: unknown) => {
        if (!(error instanceof ApiError && error.code === "NOT_FOUND")) throw error;
      })
      .then(() => refresh())
      .catch((error: unknown) => setActionError(errorMessage(error)));
  }

  function handleDeleteConcept(conceptId: string): void {
    setActionError(undefined);
    void deleteProposedConcept(apiUrl, safeAccessToken, conceptId)
      .catch((error: unknown) => {
        if (!(error instanceof ApiError && error.code === "NOT_FOUND")) throw error;
      })
      .then(() => refresh())
      .catch((error: unknown) => setActionError(errorMessage(error)));
  }

  async function handleConfirm(): Promise<void> {
    if (topics.length === 0) return;
    setActionError(undefined);
    setConfirming(true);
    try {
      const result = await confirmOutline(apiUrl, safeAccessToken, safeCustomCourseId);
      setConfirmedCourseId(result.courseId);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setConfirming(false);
    }
  }

  return (
    <main>
      <h1>Review your outline</h1>
      {loadError ? <p role="alert">{loadError}</p> : null}
      {actionError ? <p role="alert">{actionError}</p> : null}

      {confirmedCourseId ? (
        <p role="status">
          Outline confirmed. <a href={`/courses/${confirmedCourseId}`}>Go to your course</a>
        </p>
      ) : (
        <>
          {topics.length === 0 && !loadError ? <p>No proposed outline yet.</p> : null}
          <ul>
            {topics.map((topic, topicIndex) => (
              <li key={topic.id}>
                <input
                  aria-label={`Topic ${topicIndex + 1} title`}
                  defaultValue={topic.title}
                  onBlur={(event) => {
                    if (event.target.value.trim() && event.target.value !== topic.title) {
                      withErrorHandling(() => renameProposedTopic(apiUrl, safeAccessToken, topic.id, event.target.value))();
                    }
                  }}
                />
                <label>
                  <input type="checkbox" checked={topic.priority} onChange={(event) => withErrorHandling(() => setProposedTopicPriority(apiUrl, safeAccessToken, topic.id, event.target.checked))()} />
                  Priority
                </label>
                <button type="button" onClick={() => moveTopic(topicIndex, -1)} disabled={topicIndex === 0} aria-label={`Move ${topic.title} up`}>
                  ↑
                </button>
                <button type="button" onClick={() => moveTopic(topicIndex, 1)} disabled={topicIndex === topics.length - 1} aria-label={`Move ${topic.title} down`}>
                  ↓
                </button>
                <button type="button" onClick={() => handleDeleteTopic(topic.id)}>
                  Delete topic
                </button>

                <ul>
                  {topic.concepts.map((concept) => (
                    <li key={concept.id}>
                      <input
                        aria-label={`${concept.title} title`}
                        defaultValue={concept.title}
                        onBlur={(event) => {
                          if (event.target.value.trim() && event.target.value !== concept.title) {
                            withErrorHandling(() => renameProposedConcept(apiUrl, safeAccessToken, concept.id, event.target.value))();
                          }
                        }}
                      />
                      <label>
                        <input
                          type="checkbox"
                          checked={concept.priority}
                          onChange={(event) => withErrorHandling(() => setProposedConceptPriority(apiUrl, safeAccessToken, concept.id, event.target.checked))()}
                        />
                        Priority
                      </label>
                      {(concept.sourcePageRangeStart !== null || concept.sourcePageRangeEnd !== null) ? (
                        <span>
                          Source: p.{concept.sourcePageRangeStart ?? "?"}
                          {concept.sourcePageRangeEnd !== null && concept.sourcePageRangeEnd !== concept.sourcePageRangeStart ? `–${concept.sourcePageRangeEnd}` : null}
                        </span>
                      ) : null}
                      {concept.safetyFlagged ? <span role="alert">Flagged for review</span> : null}
                      <button type="button" onClick={() => handleDeleteConcept(concept.id)}>
                        Delete concept
                      </button>
                      {topic.concepts.length > 1 ? (
                        <label>
                          Merge into
                          <select
                            aria-label={`Merge ${concept.title} into`}
                            defaultValue=""
                            onChange={(event) => {
                              const keepConceptId = event.target.value;
                              if (!keepConceptId) return;
                              withErrorHandling(() => mergeProposedConcepts(apiUrl, safeAccessToken, keepConceptId, concept.id))();
                            }}
                          >
                            <option value="" disabled>
                              Choose a concept…
                            </option>
                            {topic.concepts
                              .filter((sibling) => sibling.id !== concept.id)
                              .map((sibling) => (
                                <option key={sibling.id} value={sibling.id}>
                                  {sibling.title}
                                </option>
                              ))}
                          </select>
                        </label>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>

          {topics.length === 0 && !loadError ? <p role="alert">At least one Topic must remain to confirm this outline.</p> : null}
          <button type="button" onClick={() => void handleConfirm()} disabled={confirming || topics.length === 0}>
            Confirm outline
          </button>
        </>
      )}
    </main>
  );
}
