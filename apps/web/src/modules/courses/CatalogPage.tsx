import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import type { CatalogSearchParams, CourseSummary, DifficultyTier, DurationBucket } from "@usavvy/shared-types";
import { ApiError } from "../../shared/apiClient.js";
import { getWebConfig } from "../../app/config.js";
import { useAuth } from "../auth/index.js";
import { createCoursesApi } from "./api.js";

type ViewState = { kind: "loading" } | { kind: "ready"; courses: CourseSummary[] } | { kind: "error"; message: string };

const SEARCH_DEBOUNCE_MS = 300;

const LEVEL_OPTIONS: { value: DifficultyTier; label: string }[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

const DURATION_OPTIONS: { value: DurationBucket; label: string }[] = [
  { value: "short", label: "Short (< 5h)" },
  { value: "medium", label: "Medium (5-15h)" },
  { value: "long", label: "Long (> 15h)" },
];

/**
 * Story 2.2 (FR-C-2). Reachable directly (no persistent nav bar wires it up yet — the
 * same already-accepted gap every prior page-adding story in this codebase left open).
 * No DESIGN.md component token exists for a catalog card (DESIGN.md predates Epic 2) —
 * styled from the existing generic tokens, matching Stories 1.4/1.9's own precedent.
 */
export function CatalogPage() {
  const { session } = useAuth();
  const [subject, setSubject] = useState("");
  const [level, setLevel] = useState<DifficultyTier | "">("");
  const [durationBucket, setDurationBucket] = useState<DurationBucket | "">("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [view, setView] = useState<ViewState>({ kind: "loading" });

  // Filter selects fire immediately; the free-text search input is debounced so every
  // keystroke doesn't trigger a fetch.
  useEffect(() => {
    const timer = setTimeout(() => setQ(qInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [qInput]);

  const params = useMemo<CatalogSearchParams>(
    () => ({
      ...(subject ? { subject } : {}),
      ...(level ? { level } : {}),
      ...(durationBucket ? { durationBucket } : {}),
      ...(q ? { q } : {}),
    }),
    [subject, level, durationBucket, q],
  );

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setView({ kind: "loading" });
    const { apiUrl } = getWebConfig();
    createCoursesApi(apiUrl)
      .searchCatalog(session.accessToken, params)
      .then((courses) => {
        if (cancelled) return;
        setView({ kind: "ready", courses });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setView({ kind: "error", message: error instanceof ApiError ? error.message : "something went wrong — please try again" });
      });
    return () => {
      cancelled = true;
    };
  }, [session?.accessToken, subject, level, durationBucket, q]);

  function clearFilters(): void {
    setSubject("");
    setLevel("");
    setDurationBucket("");
    setQInput("");
    setQ("");
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  const activeFilters: { key: string; label: string; clear: () => void }[] = [
    ...(subject ? [{ key: "subject", label: `Subject: ${subject}`, clear: () => setSubject("") }] : []),
    ...(level ? [{ key: "level", label: `Level: ${level}`, clear: () => setLevel("") }] : []),
    ...(durationBucket ? [{ key: "duration", label: `Duration: ${durationBucket}`, clear: () => setDurationBucket("") }] : []),
    ...(q
      ? [
          {
            key: "q",
            label: `Search: "${q}"`,
            clear: () => {
              setQInput("");
              setQ("");
            },
          },
        ]
      : []),
  ];

  return (
    <main>
      <h1>Catalog</h1>
      <form onSubmit={(event) => event.preventDefault()}>
        <label>
          Search
          <input type="text" value={qInput} onChange={(event) => setQInput(event.target.value)} placeholder="Search courses…" />
        </label>
        <label>
          Subject
          <input type="text" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="e.g. Math" />
        </label>
        <label>
          Level
          <select value={level} onChange={(event) => setLevel(event.target.value as DifficultyTier | "")}>
            <option value="">Any level</option>
            {LEVEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Duration
          <select value={durationBucket} onChange={(event) => setDurationBucket(event.target.value as DurationBucket | "")}>
            <option value="">Any duration</option>
            {DURATION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </form>

      {activeFilters.length > 0 ? (
        <ul className="usavvy-catalog-filter-chips">
          {activeFilters.map((filter) => (
            <li key={filter.key} className="usavvy-catalog-filter-chip">
              {filter.label}
              <button type="button" aria-label={`Remove filter: ${filter.label}`} onClick={filter.clear}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {view.kind === "loading" ? <p role="status">Loading…</p> : null}

      {view.kind === "error" ? (
        <div className="usavvy-banner-error" role="alert">
          {view.message}
        </div>
      ) : null}

      {view.kind === "ready" && view.courses.length === 0 ? (
        <div className="usavvy-catalog-empty">
          <p role="status">No courses match your search or filters.</p>
          <button type="button" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      ) : null}

      {view.kind === "ready" && view.courses.length > 0 ? (
        <ul className="usavvy-catalog-list">
          {view.courses.map((course) => (
            <li key={course.id} className="usavvy-catalog-card">
              <h2>{course.title}</h2>
              {course.subject ? <span>{course.subject}</span> : null}
              {course.level ? <span>{course.level}</span> : null}
              {course.estimatedDurationHours !== null ? <span>{course.estimatedDurationHours}h</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
