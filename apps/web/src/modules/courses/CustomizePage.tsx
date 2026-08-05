import { useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import type { CourseCustomizationDepth, CourseResponse, DependencyConflict, ExplanationStyle } from "@usavvy/shared-types";
import { ApiError } from "../../shared/apiClient.js";
import { getWebConfig } from "../../app/config.js";
import { useAuth } from "../auth/index.js";
import { createUsersApi } from "../users/index.js";
import { createCoursesApi } from "./api.js";

type ViewState =
  | { kind: "loading" }
  | {
      kind: "ready";
      course: CourseResponse;
      deselectedTopicIds: string[];
      priorityTopicIds: string[];
      depth: CourseCustomizationDepth;
      explanationStyle: ExplanationStyle;
      estimatedHours: number | null;
    }
  | { kind: "error"; message: string };

interface PendingConflict {
  conflicts: DependencyConflict[];
  pendingDeselectedTopicIds: string[];
}

const DEPTH_OPTIONS: { value: CourseCustomizationDepth; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "standard", label: "Standard" },
  { value: "deep-dive", label: "Deep dive" },
];

/**
 * Story 2.4 (FR-C-4). Reachable via CourseDetailPage's now-enabled "Customise before
 * starting" link. A checkbox's checked state always reflects the last server-confirmed
 * selection (never optimistic) — AC #3 can outright reject a change, unlike every other
 * auto-save control in this codebase (PreferencesPage's fields never get rejected).
 */
export function CustomizePage() {
  const { session } = useAuth();
  const { id } = useParams<{ id: string }>();
  const [view, setView] = useState<ViewState>({ kind: "loading" });
  const [conflict, setConflict] = useState<PendingConflict | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!session || !id) return;
    let cancelled = false;
    setView({ kind: "loading" });
    const { apiUrl } = getWebConfig();
    const coursesApi = createCoursesApi(apiUrl);
    const usersApi = createUsersApi(apiUrl);
    Promise.all([coursesApi.getCourse(session.accessToken, id), coursesApi.getCustomization(session.accessToken, id), usersApi.getPreferences(session.accessToken)])
      .then(([course, customization, preferences]) => {
        if (cancelled) return;
        setView({
          kind: "ready",
          course,
          deselectedTopicIds: customization?.deselectedTopicIds ?? [],
          priorityTopicIds: customization?.priorityTopicIds ?? [],
          depth: customization?.depth ?? "standard",
          // AC #4's "first time" case: seed from the learner's own account-wide preference
          // (Story 1.4) rather than a hardcoded default — a frontend-only merge, no new
          // backend call.
          explanationStyle: customization?.explanationStyle ?? preferences.explanationStyle,
          estimatedHours: customization?.estimatedHours ?? course.estimatedDurationHours,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setView({ kind: "error", message: error instanceof ApiError ? error.message : "something went wrong — please try again" });
      });
    return () => {
      cancelled = true;
    };
  }, [session?.accessToken, id]);

  const topics = useMemo(
    () => (view.kind === "ready" ? view.course.modules.flatMap((module_) => module_.topics.map((topic) => ({ id: topic.id, title: topic.title }))) : []),
    [view],
  );

  async function save(
    next: {
      deselectedTopicIds: string[];
      priorityTopicIds: string[];
      depth: CourseCustomizationDepth;
      explanationStyle: ExplanationStyle;
    },
    force = false,
  ): Promise<void> {
    if (view.kind !== "ready" || !session || !id) return;
    setSaving(true);
    try {
      const { apiUrl } = getWebConfig();
      const result = await createCoursesApi(apiUrl).saveCustomization(session.accessToken, id, { ...next, force });
      setConflict(null);
      setView({
        kind: "ready",
        course: view.course,
        deselectedTopicIds: result.deselectedTopicIds,
        priorityTopicIds: result.priorityTopicIds,
        depth: result.depth,
        explanationStyle: result.explanationStyle,
        estimatedHours: result.estimatedHours,
      });
    } catch (error) {
      if (error instanceof ApiError && error.code === "DEPENDENCY_CONFLICT") {
        setConflict({ conflicts: (error.details as DependencyConflict[] | undefined) ?? [], pendingDeselectedTopicIds: next.deselectedTopicIds });
      } else {
        setView({ kind: "error", message: error instanceof ApiError ? error.message : "something went wrong — please try again" });
      }
    } finally {
      setSaving(false);
    }
  }

  function toggleDeselect(topicId: string): void {
    if (view.kind !== "ready") return;
    const nextDeselected = view.deselectedTopicIds.includes(topicId)
      ? view.deselectedTopicIds.filter((t) => t !== topicId)
      : [...view.deselectedTopicIds, topicId];
    void save({ deselectedTopicIds: nextDeselected, priorityTopicIds: view.priorityTopicIds, depth: view.depth, explanationStyle: view.explanationStyle });
  }

  function togglePriority(topicId: string): void {
    if (view.kind !== "ready") return;
    const nextPriority = view.priorityTopicIds.includes(topicId) ? view.priorityTopicIds.filter((t) => t !== topicId) : [...view.priorityTopicIds, topicId];
    void save({ deselectedTopicIds: view.deselectedTopicIds, priorityTopicIds: nextPriority, depth: view.depth, explanationStyle: view.explanationStyle });
  }

  function changeDepth(depth: CourseCustomizationDepth): void {
    if (view.kind !== "ready") return;
    void save({ deselectedTopicIds: view.deselectedTopicIds, priorityTopicIds: view.priorityTopicIds, depth, explanationStyle: view.explanationStyle });
  }

  function changeExplanationStyle(explanationStyle: ExplanationStyle): void {
    if (view.kind !== "ready") return;
    void save({ deselectedTopicIds: view.deselectedTopicIds, priorityTopicIds: view.priorityTopicIds, depth: view.depth, explanationStyle });
  }

  function confirmConflict(): void {
    if (!conflict || view.kind !== "ready") return;
    void save(
      { deselectedTopicIds: conflict.pendingDeselectedTopicIds, priorityTopicIds: view.priorityTopicIds, depth: view.depth, explanationStyle: view.explanationStyle },
      true,
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return (
    <main>
      <h1>Customise course</h1>

      {view.kind === "loading" ? <p role="status">Loading…</p> : null}

      {view.kind === "error" ? (
        <div className="usavvy-banner-error" role="alert">
          {view.message}
        </div>
      ) : null}

      {view.kind === "ready" ? (
        <>
          {conflict ? (
            <div className="usavvy-banner-error" role="alert">
              <p>Some selected topics depend on what you&apos;re removing:</p>
              <ul>
                {conflict.conflicts.map((entry) => (
                  <li key={`${entry.topicId}-${entry.requiredByTopicId}`}>
                    &quot;{entry.requiredByTopicTitle}&quot; requires &quot;{entry.topicTitle}&quot;
                  </li>
                ))}
              </ul>
              <button type="button" onClick={confirmConflict} disabled={saving}>
                Save anyway
              </button>
              <button type="button" onClick={() => setConflict(null)} disabled={saving}>
                Cancel
              </button>
            </div>
          ) : null}

          <ul className="usavvy-customize-topic-list">
            {topics.map((topic) => (
              <li key={topic.id} className="usavvy-customize-topic-row">
                <span>{topic.title}</span>
                <label>
                  <input
                    type="checkbox"
                    aria-label={`I already know this: ${topic.title}`}
                    checked={view.deselectedTopicIds.includes(topic.id)}
                    onChange={() => toggleDeselect(topic.id)}
                    disabled={saving}
                  />
                  I already know this
                </label>
                <label>
                  <input
                    type="checkbox"
                    aria-label={`Priority: ${topic.title}`}
                    checked={view.priorityTopicIds.includes(topic.id)}
                    onChange={() => togglePriority(topic.id)}
                    disabled={saving}
                  />
                  Priority
                </label>
              </li>
            ))}
          </ul>

          <label>
            Depth
            <select value={view.depth} onChange={(event) => changeDepth(event.target.value as CourseCustomizationDepth)} disabled={saving}>
              {DEPTH_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Explanation style
            <select value={view.explanationStyle} onChange={(event) => changeExplanationStyle(event.target.value as ExplanationStyle)} disabled={saving}>
              <option value="concise">Concise</option>
              <option value="detailed">Detailed</option>
              <option value="example-first">Example-first</option>
              <option value="analogy-first">Analogy-first</option>
            </select>
          </label>

          <p>Estimated hours: {view.estimatedHours !== null ? `${view.estimatedHours}h` : "not yet estimated"}</p>
        </>
      ) : null}
    </main>
  );
}
