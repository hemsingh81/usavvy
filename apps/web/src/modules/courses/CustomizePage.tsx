import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import type { CourseCustomizationDepth, CourseResponse, DependencyConflict, DifficultyTier, ExplanationStyle, PlacementCheckProposal } from "@usavvy/shared-types";
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
      startingDifficultyTier: DifficultyTier | null;
      estimatedHours: number | null;
    }
  | { kind: "error"; message: string };

interface PendingConflict {
  conflicts: DependencyConflict[];
  pendingDeselectedTopicIds: string[];
}

interface CustomizeLocationState {
  placementProposal?: PlacementCheckProposal;
}

const DEPTH_OPTIONS: { value: CourseCustomizationDepth; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "standard", label: "Standard" },
  { value: "deep-dive", label: "Deep dive" },
];

const DIFFICULTY_OPTIONS: { value: DifficultyTier; label: string }[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

/**
 * Story 2.4 (FR-C-4), extended by Story 2.5 (FR-C-5). Reachable via CourseDetailPage's
 * "Customise before starting" link, or from PlacementCheckPage carrying a scored
 * PlacementCheckProposal via router state. A checkbox's checked state always reflects the
 * last server-confirmed selection (never optimistic) — AC #3 can outright reject a change.
 */
export function CustomizePage() {
  const { session } = useAuth();
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [view, setView] = useState<ViewState>({ kind: "loading" });
  const [conflict, setConflict] = useState<PendingConflict | null>(null);
  const [pendingPlacementProposal, setPendingPlacementProposal] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!session || !id) return;
    let cancelled = false;
    setView({ kind: "loading" });
    const { apiUrl } = getWebConfig();
    const coursesApi = createCoursesApi(apiUrl);
    const usersApi = createUsersApi(apiUrl);
    const proposal = (location.state as CustomizeLocationState | null)?.placementProposal;
    Promise.all([coursesApi.getCourse(session.accessToken, id), coursesApi.getCustomization(session.accessToken, id), usersApi.getPreferences(session.accessToken)])
      .then(([course, customization, preferences]) => {
        if (cancelled) return;
        if (proposal !== undefined) {
          // Review finding: clear the router state immediately after consuming it —
          // otherwise a page reload or back/forward navigation re-reads this same stale
          // proposal from history and silently overwrites freshly-fetched, already-saved
          // data with results from a placement check taken (and possibly already applied)
          // earlier.
          navigate(location.pathname, { replace: true, state: null });
        }
        setPendingPlacementProposal(proposal !== undefined);
        setView({
          kind: "ready",
          course,
          // Story 2.5 AC #2: an incoming placement-check proposal seeds these two fields
          // for review, overriding whatever was already saved — priority/depth/
          // explanationStyle are untouched, the placement check has no opinion on them.
          deselectedTopicIds: proposal?.proposedDeselectedTopicIds ?? customization?.deselectedTopicIds ?? [],
          priorityTopicIds: customization?.priorityTopicIds ?? [],
          depth: customization?.depth ?? "standard",
          // AC #4's "first time" case: seed from the learner's own account-wide preference
          // (Story 1.4) rather than a hardcoded default — a frontend-only merge, no new
          // backend call.
          explanationStyle: customization?.explanationStyle ?? preferences.explanationStyle,
          startingDifficultyTier: proposal?.proposedStartingDifficultyTier ?? customization?.startingDifficultyTier ?? null,
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
    // location.state is intentionally read only on mount/id-change, not on every render.
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
      startingDifficultyTier: DifficultyTier | null;
    },
    force = false,
  ): Promise<void> {
    if (view.kind !== "ready" || !session || !id) return;
    setSaving(true);
    try {
      const { apiUrl } = getWebConfig();
      const result = await createCoursesApi(apiUrl).saveCustomization(session.accessToken, id, {
        deselectedTopicIds: next.deselectedTopicIds,
        priorityTopicIds: next.priorityTopicIds,
        depth: next.depth,
        explanationStyle: next.explanationStyle,
        ...(next.startingDifficultyTier !== null ? { startingDifficultyTier: next.startingDifficultyTier } : {}),
        force,
      });
      setConflict(null);
      setPendingPlacementProposal(false);
      setView({
        kind: "ready",
        course: view.course,
        deselectedTopicIds: result.deselectedTopicIds,
        priorityTopicIds: result.priorityTopicIds,
        depth: result.depth,
        explanationStyle: result.explanationStyle,
        startingDifficultyTier: result.startingDifficultyTier,
        estimatedHours: result.estimatedHours,
      });
    } catch (error) {
      if (error instanceof ApiError && error.code === "DEPENDENCY_CONFLICT") {
        // Review finding: the conflict banner takes over "review before proceeding" duty
        // here — leaving the placement-proposal banner up too would show both at once.
        setPendingPlacementProposal(false);
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
    void save({
      deselectedTopicIds: nextDeselected,
      priorityTopicIds: view.priorityTopicIds,
      depth: view.depth,
      explanationStyle: view.explanationStyle,
      startingDifficultyTier: view.startingDifficultyTier,
    });
  }

  function togglePriority(topicId: string): void {
    if (view.kind !== "ready") return;
    const nextPriority = view.priorityTopicIds.includes(topicId) ? view.priorityTopicIds.filter((t) => t !== topicId) : [...view.priorityTopicIds, topicId];
    void save({
      deselectedTopicIds: view.deselectedTopicIds,
      priorityTopicIds: nextPriority,
      depth: view.depth,
      explanationStyle: view.explanationStyle,
      startingDifficultyTier: view.startingDifficultyTier,
    });
  }

  function changeDepth(depth: CourseCustomizationDepth): void {
    if (view.kind !== "ready") return;
    void save({
      deselectedTopicIds: view.deselectedTopicIds,
      priorityTopicIds: view.priorityTopicIds,
      depth,
      explanationStyle: view.explanationStyle,
      startingDifficultyTier: view.startingDifficultyTier,
    });
  }

  function changeExplanationStyle(explanationStyle: ExplanationStyle): void {
    if (view.kind !== "ready") return;
    void save({
      deselectedTopicIds: view.deselectedTopicIds,
      priorityTopicIds: view.priorityTopicIds,
      depth: view.depth,
      explanationStyle,
      startingDifficultyTier: view.startingDifficultyTier,
    });
  }

  function changeStartingDifficultyTier(startingDifficultyTier: DifficultyTier): void {
    if (view.kind !== "ready") return;
    void save({
      deselectedTopicIds: view.deselectedTopicIds,
      priorityTopicIds: view.priorityTopicIds,
      depth: view.depth,
      explanationStyle: view.explanationStyle,
      startingDifficultyTier,
    });
  }

  function confirmConflict(): void {
    if (!conflict || view.kind !== "ready") return;
    void save(
      {
        deselectedTopicIds: conflict.pendingDeselectedTopicIds,
        priorityTopicIds: view.priorityTopicIds,
        depth: view.depth,
        explanationStyle: view.explanationStyle,
        startingDifficultyTier: view.startingDifficultyTier,
      },
      true,
    );
  }

  function confirmPlacementResults(): void {
    if (view.kind !== "ready") return;
    void save({
      deselectedTopicIds: view.deselectedTopicIds,
      priorityTopicIds: view.priorityTopicIds,
      depth: view.depth,
      explanationStyle: view.explanationStyle,
      startingDifficultyTier: view.startingDifficultyTier,
    });
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
          {pendingPlacementProposal ? (
            <div className="usavvy-banner-info" role="status">
              <p>Placement check results — review the topics below, then confirm.</p>
              <button type="button" onClick={confirmPlacementResults} disabled={saving}>
                Confirm results
              </button>
            </div>
          ) : null}

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

          <p>
            <Link to={`/courses/${id}/placement-check`}>Take placement check</Link>
          </p>

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

          <label>
            Starting difficulty
            <select
              value={view.startingDifficultyTier ?? view.course.level ?? "beginner"}
              onChange={(event) => changeStartingDifficultyTier(event.target.value as DifficultyTier)}
              disabled={saving}
            >
              {DIFFICULTY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <p>
            Estimated hours:{" "}
            {pendingPlacementProposal
              ? "will update once confirmed"
              : view.estimatedHours !== null
                ? `${view.estimatedHours}h`
                : "not yet estimated"}
          </p>
        </>
      ) : null}
    </main>
  );
}
