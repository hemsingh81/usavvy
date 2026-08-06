import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  MOCK_CONCEPT,
  mockAlternateBeat,
  describeRoute,
  type BoardBeat,
  type BoardContentBlock,
  type ExplanationRouteType,
} from "./mockBoardData.js";

/**
 * Epic 3 mock-first UX pass (`_AI-Agile-Development/implementation-artifacts/
 * epic-3-mock-first-ux-pass.md`) — a click-through, entirely mocked-data preview of
 * the Interactive Board's core learner journey, built to get sign-off on the UX
 * BEFORE any of Epic 3's real backend stories start. Nothing here talks to a server:
 * no GenerationPort, no VoicePort, no board-orchestration — every "generated"
 * explanation is a canned lookup in `mockBoardData.ts`, and narration is simulated by
 * a plain progressive-reveal timer, not real audio.
 */

// Exported so tests can drive fake timers by the exact real interval, matching
// UploadPage's own POLL_INTERVAL_MS precedent.
export const REVEAL_TICK_MS = 200;

const ROUTE_OPTIONS: ExplanationRouteType[] = ["deeper", "simpler", "different-example", "more-examples", "analogy", "confused"];
const VOICES = ["Voice A", "Voice B"];
const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5];

// Story 3.12 (FR-B-10), AC #4: "persist for the remainder of the session" is exactly
// what `sessionStorage` means (as distinct from `localStorage`'s cross-session
// persistence, or a bare `useState` which loses everything on reload) — one JSON blob
// under one key, not three separate keys.
const PREFERENCES_STORAGE_KEY = "usavvy-board-preferences";

interface BoardPreferences {
  speed: number;
  muted: boolean;
  voice: string;
}

const DEFAULT_PREFERENCES: BoardPreferences = { speed: 1, muted: false, voice: VOICES[0] as string };

function loadStoredPreferences(): BoardPreferences {
  try {
    const raw = sessionStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<BoardPreferences>;
    return {
      // Validated against the actual allowed set, not just its type — a stale/tampered
      // value outside SPEED_OPTIONS would otherwise render the <select> with no option
      // selected, matching the same rigor already applied to `voice` below.
      speed: typeof parsed.speed === "number" && SPEED_OPTIONS.includes(parsed.speed) ? parsed.speed : DEFAULT_PREFERENCES.speed,
      muted: typeof parsed.muted === "boolean" ? parsed.muted : DEFAULT_PREFERENCES.muted,
      voice: typeof parsed.voice === "string" && VOICES.includes(parsed.voice) ? parsed.voice : DEFAULT_PREFERENCES.voice,
    };
  } catch {
    // Malformed JSON, or sessionStorage itself unavailable (e.g. a locked-down/private
    // browsing context) — never let a preferences read break the whole page (AD-17's
    // "no silent failures" is about surfacing real errors, not about crashing on a
    // best-effort convenience feature; falling back to defaults is the correct behavior
    // here, not a swallowed error).
    return DEFAULT_PREFERENCES;
  }
}

// Story 3.4 (FR-B-31). Zoom is a plain CSS scale transform, clamped — no bespoke
// gesture-recognition engine (see the story's own CRITICAL SCOPE NOTE).
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.1;

function clampZoom(zoom: number): number {
  return Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) * 100) / 100;
}

function countUnits(block: BoardContentBlock): number {
  switch (block.kind) {
    case "text":
      return block.text.split(/\s+/).filter(Boolean).length;
    case "math":
      return block.lines.length;
    case "code":
      return block.lines.length;
    case "diagram":
      return block.nodes.length;
    case "table":
      return block.rows.length;
    default:
      return 1;
  }
}

function totalUnitsFor(beat: BoardBeat): number {
  return beat.content.reduce((sum, block) => sum + countUnits(block), 0);
}

// Story 3.11 (FR-B-32). `subIndex` is the discrete line/node/row within the spotlighted
// block — null for `text`/`math` blocks, whose AC's own example names the whole block as
// the spotlight unit, not a sub-word/sub-line range.
export interface Spotlight {
  blockIndex: number;
  subIndex: number | null;
}

// Story 3.11. "Narration reaches that element" — same mock-reveal-timer stand-in as
// every other "synced to narration" AC in this file (see the story's own CRITICAL SCOPE
// NOTE); no real narration-timing source exists. Returns null once the Beat is fully
// revealed — nothing is "currently narrating" anymore once its explanation is done.
// Exported so tests can exercise multi-block scenarios `mockBoardData.ts` doesn't
// happen to contain (see the code-review finding this fixed: math was accidentally
// getting per-line dimming, masked in the mock's own data by math always being the last
// block of its one Beat, so the fully-revealed guard above hid the bug in practice).
export function computeSpotlight(beat: BoardBeat, revealedUnitsForBeat: number): Spotlight | null {
  const total = totalUnitsFor(beat);
  if (revealedUnitsForBeat <= 0 || revealedUnitsForBeat >= total) return null;
  let remaining = revealedUnitsForBeat;
  for (let blockIndex = 0; blockIndex < beat.content.length; blockIndex += 1) {
    const block = beat.content[blockIndex] as BoardContentBlock;
    const blockUnits = countUnits(block);
    if (remaining <= blockUnits) {
      return { blockIndex, subIndex: block.kind === "text" || block.kind === "math" ? null : remaining - 1 };
    }
    remaining -= blockUnits;
  }
  return null;
}

function renderTextBlock(block: { text: string; emphasis?: string[] }, revealedWords: number): React.ReactNode {
  const words = block.text.split(/\s+/).filter(Boolean);
  const shown = words.slice(0, revealedWords).join(" ");
  if (!block.emphasis || block.emphasis.length === 0) {
    return <p className="usavvy-board-block-text">{shown}</p>;
  }
  const pattern = new RegExp(`(${block.emphasis.map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  const parts = shown.split(pattern);
  return (
    <p className="usavvy-board-block-text">
      {parts.map((part, index) =>
        block.emphasis?.some((e) => e.toLowerCase() === part.toLowerCase()) ? (
          <mark key={index} className="usavvy-board-emphasis">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </p>
  );
}

// Story 3.11: `spotlightSubIndex` is only ever passed non-null when THIS block is the
// one currently spotlighted — it dims every other line/node/row within it. A `null`
// value means either dimming is inactive, or this whole block isn't the spotlight (in
// which case the caller's block-wrapper `data-dimmed` already handles it, and no
// per-element dimming is needed inside here at all).
function renderBlock(block: BoardContentBlock, revealedInBlock: number, blockKey: string, spotlightSubIndex: number | null): React.ReactNode {
  switch (block.kind) {
    case "text":
      return <div key={blockKey}>{renderTextBlock(block, revealedInBlock)}</div>;
    case "math":
      return (
        <pre key={blockKey} className="usavvy-board-block-math">
          {block.lines.slice(0, revealedInBlock).map((line, index) => (
            <div key={index} data-dimmed={spotlightSubIndex !== null && index !== spotlightSubIndex}>
              {line}
            </div>
          ))}
        </pre>
      );
    case "code":
      return (
        <pre key={blockKey} className="usavvy-board-block-code" aria-label={`${block.language} code`}>
          {block.lines.slice(0, revealedInBlock).map((line, index) => (
            <div
              key={index}
              className="usavvy-board-code-line"
              data-active={index === revealedInBlock - 1}
              data-dimmed={spotlightSubIndex !== null && index !== spotlightSubIndex}
            >
              {line}
            </div>
          ))}
        </pre>
      );
    case "diagram": {
      const revealedNodes = block.nodes.slice(0, revealedInBlock);
      const revealedIds = new Set(revealedNodes.map((n) => n.id));
      return (
        <div key={blockKey} className="usavvy-board-block-diagram" role="group" aria-label="diagram">
          {revealedNodes.map((node, index) => (
            <span key={node.id} data-dimmed={spotlightSubIndex !== null && index !== spotlightSubIndex}>
              <span className="usavvy-board-diagram-node">{node.label}</span>
              {index < revealedNodes.length - 1 && block.edges.some((e) => e.from === node.id && revealedIds.has(e.to)) ? (
                <span className="usavvy-board-diagram-edge" aria-hidden="true">
                  {" "}
                  →{" "}
                </span>
              ) : null}
            </span>
          ))}
        </div>
      );
    }
    case "table":
      return (
        <div key={blockKey} className="usavvy-board-block-table">
          <table>
            <thead>
              <tr>
                {block.headers.map((header) => (
                  <th key={header}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  data-revealed={rowIndex < revealedInBlock}
                  data-dimmed={spotlightSubIndex !== null && rowIndex !== spotlightSubIndex}
                >
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    default:
      return null;
  }
}

// Story 3.11: `spotlight` is only passed non-null for the ONE Beat currently containing
// the spotlighted element (the active lesson Beat, or the overlay Beat) — every other
// rendered Beat in the stack calls this with `spotlight={null}`, dimming ALL of its own
// blocks uniformly (via `isSpotlightBlock` always being false), which is exactly
// "dim everything else on the board" (AC #1) without a separate section-level mechanism.
function BeatContent({ beat, revealedUnits, dimmingActive, spotlight }: { beat: BoardBeat; revealedUnits: number; dimmingActive: boolean; spotlight: Spotlight | null }) {
  let remaining = revealedUnits;
  return (
    <>
      {beat.content.map((block, index) => {
        const blockUnits = countUnits(block);
        const revealedInBlock = Math.max(0, Math.min(blockUnits, remaining));
        remaining -= blockUnits;
        const isSpotlightBlock = spotlight?.blockIndex === index;
        return (
          <div className="usavvy-board-block" data-dimmed={dimmingActive && !isSpotlightBlock} key={index}>
            {renderBlock(block, revealedInBlock, String(index), isSpotlightBlock ? spotlight.subIndex : null)}
          </div>
        );
      })}
    </>
  );
}

export function BoardPage() {
  const { id: courseId } = useParams<{ id: string }>();
  const concept = MOCK_CONCEPT;

  const [lessonBeatIndex, setLessonBeatIndex] = useState(0);
  const [visitedBeatIds, setVisitedBeatIds] = useState<ReadonlySet<string>>(new Set([concept.beats[0]?.id ?? ""]));
  const [overlayBeat, setOverlayBeat] = useState<BoardBeat | null>(null);
  const [revealedUnits, setRevealedUnits] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  // Story 3.12, AC #4: initialized from sessionStorage (lazy initializer, so the read
  // only ever happens once, on mount) rather than defaulting then overwriting in an
  // effect — avoids a one-frame flash of the default before the stored value applies.
  const [storedPreferences] = useState(loadStoredPreferences);
  const [speed, setSpeed] = useState(storedPreferences.speed);
  const [muted, setMuted] = useState(storedPreferences.muted);
  const [voice, setVoice] = useState(storedPreferences.voice);
  const [showTranscript, setShowTranscript] = useState(false);
  const [transcriptQuery, setTranscriptQuery] = useState("");
  const [explainOpen, setExplainOpen] = useState(false);
  const [askAnythingOpen, setAskAnythingOpen] = useState(false);
  const [askAnythingText, setAskAnythingText] = useState("");
  const [bookmarks, setBookmarks] = useState<ReadonlyMap<string, string>>(new Map());
  const [notingBeatId, setNotingBeatId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [checkpointActive, setCheckpointActive] = useState(false);
  const [checkpointIndex, setCheckpointIndex] = useState(0);
  const [checkpointSelected, setCheckpointSelected] = useState<number | null>(null);
  const [checkpointDone, setCheckpointDone] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [scrollTargetId, setScrollTargetId] = useState<string | null>(null);
  const [markerPositions, setMarkerPositions] = useState<Record<string, number>>({});
  const [dimmingSuspendedByScroll, setDimmingSuspendedByScroll] = useState(false);
  const canvasRef = useRef<HTMLElement | null>(null);
  const beatSectionRefs = useRef(new Map<string, HTMLElement>());
  // Story 3.11, AC #3: distinguishes a learner's own scroll from this component's own
  // scrollIntoView/scrollTo calls — only the former suspends dimming. Untestable in
  // jsdom (scrollIntoView never fires a real scroll event there in the first place),
  // same accepted limitation as Story 3.4's marker-position measurement; correct in a
  // real browser.
  const isProgrammaticScrollRef = useRef(false);

  function registerBeatSectionRef(beatId: string, el: HTMLElement | null): void {
    if (el) beatSectionRefs.current.set(beatId, el);
    else beatSectionRefs.current.delete(beatId);
  }

  function markProgrammaticScroll(): void {
    isProgrammaticScrollRef.current = true;
    window.setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 500);
  }

  function handleCanvasScroll(): void {
    if (isProgrammaticScrollRef.current) return;
    setDimmingSuspendedByScroll(true);
  }

  const lessonBeat = concept.beats[lessonBeatIndex] as BoardBeat;
  const displayedBeat = overlayBeat ?? lessonBeat;
  const totalUnits = useMemo(() => totalUnitsFor(displayedBeat), [displayedBeat]);
  // Story 3.11, AC #1-#3: null (no dimming) while paused or a manual scroll has
  // suspended it; otherwise the element currently receiving reveal progress.
  const spotlight = !isPaused && !dimmingSuspendedByScroll ? computeSpotlight(displayedBeat, revealedUnits) : null;
  const isFullyRevealed = revealedUnits >= totalUnits;
  const atConceptEnd = lessonBeatIndex === concept.beats.length - 1 && !overlayBeat && visitedBeatIds.has(lessonBeat.id) && isFullyRevealed;

  // Progressive reveal timer — the mock's stand-in for word/line/element-level
  // narration-synced rendering (Stories 3.5-3.9). Ticks while playing and not yet
  // fully revealed; speed scales the tick interval directly (AC: "applied immediately,
  // without needing to restart the Beat").
  useEffect(() => {
    if (isPaused || revealedUnits >= totalUnits) return;
    const intervalId = setInterval(() => {
      setRevealedUnits((current) => Math.min(totalUnits, current + 1));
      // Story 3.11, AC #3: "resuming when I return to active playback" — a real tick
      // IS returning to active playback; a timeout-based idle heuristic would be
      // unfalsifiable in this test suite and isn't what the AC actually asks for.
      setDimmingSuspendedByScroll(false);
    }, REVEAL_TICK_MS / speed);
    return () => clearInterval(intervalId);
  }, [isPaused, revealedUnits, totalUnits, speed]);

  // Review finding: only a real lesson Beat counts toward "N of M Beats studied" — an
  // "explain more" detour (overlayBeat) fully revealing must never inflate the Progress
  // Disclosure count, since it isn't one of the Concept's own Beats.
  useEffect(() => {
    if (isFullyRevealed && !overlayBeat) {
      setVisitedBeatIds((current) => new Set(current).add(displayedBeat.id));
    }
  }, [isFullyRevealed, displayedBeat.id, overlayBeat]);

  // Story 3.4, AC #3: gutter markers positioned to reflect each Beat's real location on
  // the (now-stacked) canvas — measured from actual rendered layout, not a naive
  // index/count approximation, since Beats have very different content lengths. Known
  // limitation: jsdom computes offsetTop/scrollHeight as 0, so this can't be
  // pixel-verified by this test suite; it is correct in a real browser.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scrollHeight = canvas.scrollHeight || 1;
    const next: Record<string, number> = {};
    for (const beat of concept.beats.slice(0, lessonBeatIndex + 1)) {
      const el = beatSectionRefs.current.get(beat.id);
      next[beat.id] = el ? (el.offsetTop / scrollHeight) * 100 : 0;
    }
    setMarkerPositions(next);
  }, [lessonBeatIndex, zoomLevel, revealedUnits, concept.beats]);

  // Story 3.12, AC #4: one write per change, one JSON blob — mirrors loadStoredPreferences'
  // own single-key shape. sessionStorage.setItem can throw (quota exceeded, private
  // browsing) — same "never let a best-effort convenience feature break the page" stance
  // as the load path.
  useEffect(() => {
    try {
      sessionStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ speed, muted, voice }));
    } catch {
      // Best-effort — see loadStoredPreferences' own comment.
    }
  }, [speed, muted, voice]);

  // Story 3.4, AC #4: runs right after the render that includes the jump target (even
  // if it wasn't previously in the stack), since `lessonBeatIndex` is a dependency —
  // the ref is guaranteed to exist in the DOM by the time this effect runs.
  useEffect(() => {
    if (!scrollTargetId) return;
    markProgrammaticScroll();
    beatSectionRefs.current.get(scrollTargetId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setScrollTargetId(null);
  }, [scrollTargetId, lessonBeatIndex]);

  // Code review finding: calling goToLessonBeat unconditionally — even when already on
  // the clicked Beat — reset revealedUnits back to 0 for a Beat still mid-reveal (not
  // yet in visitedBeatIds), a jarring "my progress just vanished" regression. Skipped
  // when already on that Beat (and not mid-detour); the jump/zoom-reset still happens.
  function handleGutterMarkerClick(index: number): void {
    const targetBeat = concept.beats[index];
    if (overlayBeat || index !== lessonBeatIndex) {
      goToLessonBeat(index);
    }
    setZoomLevel(1);
    if (targetBeat) setScrollTargetId(targetBeat.id);
  }

  function zoomIn(): void {
    setZoomLevel((current) => clampZoom(current + ZOOM_STEP));
  }

  function zoomOut(): void {
    setZoomLevel((current) => clampZoom(current - ZOOM_STEP));
  }

  function handleCanvasWheel(event: React.WheelEvent<HTMLElement>): void {
    if (!event.ctrlKey) return;
    event.preventDefault();
    setZoomLevel((current) => clampZoom(current + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)));
  }

  function goToLessonBeat(index: number): void {
    if (index < 0 || index >= concept.beats.length) return;
    setOverlayBeat(null);
    setLessonBeatIndex(index);
    const targetId = concept.beats[index]?.id;
    setRevealedUnits(targetId && visitedBeatIds.has(targetId) ? totalUnitsFor(concept.beats[index] as BoardBeat) : 0);
    setIsPaused(false);
  }

  function handleBack(): void {
    if (overlayBeat) {
      // Returning from an "explain more" detour — the lesson Beat was already seen,
      // so it's restored fully revealed rather than re-animated (AC: "restores that
      // Beat's exact visual state").
      setOverlayBeat(null);
      setRevealedUnits(totalUnitsFor(lessonBeat));
      return;
    }
    goToLessonBeat(lessonBeatIndex - 1);
  }

  function handleForward(): void {
    if (overlayBeat) return;
    goToLessonBeat(lessonBeatIndex + 1);
  }

  function handleReplay(): void {
    setRevealedUnits(0);
    setIsPaused(false);
  }

  function handleExplainRoute(routeType: ExplanationRouteType): void {
    setOverlayBeat(mockAlternateBeat(lessonBeat, routeType));
    setRevealedUnits(0);
    setIsPaused(false);
    setExplainOpen(false);
    setAskAnythingOpen(false);
  }

  function handleAskAnythingSubmit(event: React.FormEvent): void {
    event.preventDefault();
    if (!askAnythingText.trim()) return;
    setOverlayBeat(mockAlternateBeat(lessonBeat, "ask-anything", askAnythingText));
    setRevealedUnits(0);
    setIsPaused(false);
    setExplainOpen(false);
    setAskAnythingOpen(false);
    setAskAnythingText("");
  }

  function toggleBookmark(beatId: string): void {
    if (bookmarks.has(beatId)) {
      setBookmarks((current) => {
        const next = new Map(current);
        next.delete(beatId);
        return next;
      });
      setNotingBeatId(null);
      return;
    }
    setNotingBeatId(beatId);
    setNoteText("");
  }

  function saveNote(beatId: string): void {
    setBookmarks((current) => new Map(current).set(beatId, noteText));
    setNotingBeatId(null);
  }

  function handleRestartConcept(): void {
    setOverlayBeat(null);
    setLessonBeatIndex(0);
    setVisitedBeatIds(new Set());
    setRevealedUnits(0);
    setIsPaused(false);
    setCheckpointActive(false);
    setCheckpointDone(false);
    // Code review finding: restarting shrinks the stack back to just Beat 1, but left a
    // learner who'd zoomed/scrolled elsewhere still zoomed/scrolled away from it.
    // Element.prototype.scrollTo isn't implemented in jsdom (unlike the softer
    // scrollIntoView no-op) — guarded so this stays safe under test.
    setZoomLevel(1);
    markProgrammaticScroll();
    if (typeof canvasRef.current?.scrollTo === "function") {
      canvasRef.current.scrollTo({ top: 0 });
    }
  }

  function startCheckpoint(): void {
    setCheckpointActive(true);
    setCheckpointIndex(0);
    setCheckpointSelected(null);
    setCheckpointDone(false);
  }

  function selectCheckpointOption(optionIndex: number): void {
    setCheckpointSelected(optionIndex);
  }

  function submitCheckpointAnswer(): void {
    const question = concept.checkpointQuestions[checkpointIndex];
    if (!question || checkpointSelected === null) return;
    if (checkpointIndex + 1 >= concept.checkpointQuestions.length) {
      setCheckpointDone(true);
    }
  }

  function nextCheckpointQuestion(): void {
    setCheckpointIndex((current) => current + 1);
    setCheckpointSelected(null);
  }

  const transcriptEntries = concept.beats.filter((beat) => visitedBeatIds.has(beat.id));
  const filteredTranscript = transcriptQuery.trim()
    ? transcriptEntries.filter((beat) => beat.narrationText.toLowerCase().includes(transcriptQuery.trim().toLowerCase()))
    : transcriptEntries;

  const avatarState = isPaused ? "idle" : isFullyRevealed ? "idle" : "speaking";
  const checkpointQuestion = concept.checkpointQuestions[checkpointIndex];

  return (
    <div className="usavvy-board-page">
      <div className="usavvy-board-topbar">
        <Link to={courseId ? `/courses/${courseId}` : "/catalog"}>← Exit board (mock preview)</Link>
        <div className="usavvy-board-progress-disclosure">
          <span className="usavvy-board-avatar" data-state={avatarState} aria-label={`Avatar is ${avatarState}`}>
            <span className="usavvy-board-avatar-bar" />
            <span className="usavvy-board-avatar-bar" />
            <span className="usavvy-board-avatar-bar" />
          </span>
          <span className="usavvy-board-progress-track">
            <span
              className="usavvy-board-progress-fill"
              style={{ width: `${Math.round((visitedBeatIds.size / concept.beats.length) * 100)}%` }}
            />
          </span>
          <span className="usavvy-board-progress-label" role="status">
            {visitedBeatIds.size} of {concept.beats.length} Beats studied
          </span>
        </div>
      </div>

      <div className="usavvy-board-body">
        <nav className="usavvy-board-gutter" aria-label="Beat navigation">
          {concept.beats.map((beat, index) => (
            <button
              key={beat.id}
              type="button"
              className="usavvy-board-gutter-marker"
              data-active={!overlayBeat && index === lessonBeatIndex}
              aria-label={`Jump to Beat: ${beat.title}`}
              style={{ top: `${markerPositions[beat.id] ?? (index / Math.max(concept.beats.length - 1, 1)) * 100}%` }}
              onClick={() => handleGutterMarkerClick(index)}
            />
          ))}
        </nav>

        <main className="usavvy-board-canvas" ref={canvasRef} onWheel={handleCanvasWheel} onScroll={handleCanvasScroll}>
          <div className="usavvy-board-canvas-zoom-wrapper" style={{ transform: `scale(${zoomLevel})` }}>
            {overlayBeat ? (
              <>
                <h1 className="usavvy-board-beat-heading">
                  {overlayBeat.title} ({describeRoute(overlayBeat.routeType as ExplanationRouteType)})
                </h1>
                <BeatContent beat={overlayBeat} revealedUnits={revealedUnits} dimmingActive={spotlight !== null} spotlight={spotlight} />
                {isFullyRevealed ? <p className="usavvy-board-source-tag">Source: {overlayBeat.sourceRef}</p> : null}
                <button type="button" className="usavvy-board-control-button" onClick={handleBack} style={{ paddingLeft: 0 }}>
                  ← Back to lesson
                </button>
              </>
            ) : (
              concept.beats.slice(0, lessonBeatIndex + 1).map((beat, index) => {
                const isActive = index === lessonBeatIndex;
                const revealed = isActive ? revealedUnits : totalUnitsFor(beat);
                const sectionFullyRevealed = isActive ? isFullyRevealed : true;
                const HeadingTag = isActive ? "h1" : "h2";
                return (
                  <section
                    key={beat.id}
                    id={`beat-section-${beat.id}`}
                    ref={(el) => registerBeatSectionRef(beat.id, el)}
                    className="usavvy-board-beat-section"
                  >
                    <HeadingTag className="usavvy-board-beat-heading">{beat.title}</HeadingTag>
                    <BeatContent beat={beat} revealedUnits={revealed} dimmingActive={spotlight !== null} spotlight={isActive ? spotlight : null} />
                    {sectionFullyRevealed ? <p className="usavvy-board-source-tag">Source: {beat.sourceRef}</p> : null}

                    {isActive && isFullyRevealed ? (
                      <div>
                        {bookmarks.has(beat.id) ? (
                          <p role="status">Bookmarked{bookmarks.get(beat.id) ? `: "${bookmarks.get(beat.id)}"` : ""}</p>
                        ) : null}
                        {notingBeatId === beat.id ? (
                          <div>
                            <input
                              aria-label="Bookmark note"
                              value={noteText}
                              onChange={(event) => setNoteText(event.target.value)}
                              placeholder="Add a note (optional)"
                            />
                            <button type="button" className="usavvy-board-control-button" onClick={() => saveNote(beat.id)}>
                              Save bookmark
                            </button>
                          </div>
                        ) : (
                          <button type="button" className="usavvy-board-control-button" onClick={() => toggleBookmark(beat.id)} style={{ paddingLeft: 0 }}>
                            {bookmarks.has(beat.id) ? "Remove bookmark" : "Bookmark this Beat"}
                          </button>
                        )}
                      </div>
                    ) : null}

                    {isActive && atConceptEnd && !checkpointActive ? (
                      <div className="usavvy-board-block" role="status">
                        <p>You've reached the end of "{concept.title}."</p>
                        <button type="button" className="usavvy-board-explain-toggle" onClick={startCheckpoint}>
                          Start checkpoint
                        </button>
                        <button type="button" className="usavvy-board-control-button" onClick={handleRestartConcept}>
                          Restart concept
                        </button>
                      </div>
                    ) : null}
                  </section>
                );
              })
            )}
          </div>
        </main>
      </div>

      {checkpointActive && checkpointQuestion ? (
        <div className="usavvy-board-checkpoint-modal" role="dialog" aria-modal="true" aria-label="Checkpoint question">
          <div className="usavvy-board-checkpoint-panel">
            {!checkpointDone ? (
              <>
                <p role="status">
                  Checkpoint {checkpointIndex + 1} of {concept.checkpointQuestions.length}
                </p>
                <h2>{checkpointQuestion.question}</h2>
                <div className="usavvy-board-checkpoint-options">
                  {checkpointQuestion.options.map((option, index) => (
                    <button
                      key={index}
                      type="button"
                      className="usavvy-board-checkpoint-option"
                      data-selected={checkpointSelected === index}
                      onClick={() => selectCheckpointOption(index)}
                      disabled={checkpointSelected !== null}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                {checkpointSelected !== null ? (
                  <>
                    <p role="status">
                      {checkpointSelected === checkpointQuestion.correctIndex ? checkpointQuestion.feedbackCorrect : checkpointQuestion.feedbackIncorrect}
                    </p>
                    {checkpointIndex + 1 < concept.checkpointQuestions.length ? (
                      <button type="button" className="usavvy-board-explain-toggle" onClick={nextCheckpointQuestion}>
                        Next question
                      </button>
                    ) : (
                      <button type="button" className="usavvy-board-explain-toggle" onClick={submitCheckpointAnswer}>
                        Finish checkpoint
                      </button>
                    )}
                  </>
                ) : null}
              </>
            ) : (
              <>
                <h2>Checkpoint complete</h2>
                <p>Your answers have been recorded as a mastery signal for "{concept.title}" — not a grade.</p>
                <button type="button" className="usavvy-board-explain-toggle" onClick={() => setCheckpointActive(false)}>
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {showTranscript ? (
        <aside className="usavvy-board-transcript-panel" aria-label="Transcript">
          <button type="button" className="usavvy-board-control-button" onClick={() => setShowTranscript(false)} style={{ paddingLeft: 0, color: "inherit" }}>
            Close transcript
          </button>
          <input
            aria-label="Search transcript"
            placeholder="Search transcript"
            value={transcriptQuery}
            onChange={(event) => setTranscriptQuery(event.target.value)}
            className="usavvy-input"
          />
          {filteredTranscript.map((beat) => (
            <div className="usavvy-board-transcript-entry" key={beat.id}>
              <h3>{beat.title}</h3>
              <p>
                {transcriptQuery.trim() ? (
                  beat.narrationText.split(new RegExp(`(${transcriptQuery.trim()})`, "gi")).map((part, index) =>
                    part.toLowerCase() === transcriptQuery.trim().toLowerCase() ? (
                      <mark key={index} className="usavvy-board-transcript-highlight">
                        {part}
                      </mark>
                    ) : (
                      <span key={index}>{part}</span>
                    ),
                  )
                ) : (
                  beat.narrationText
                )}
              </p>
            </div>
          ))}
        </aside>
      ) : null}

      <div className="usavvy-board-control-bar">
        <button type="button" className="usavvy-board-control-button" onClick={() => setIsPaused((p) => !p)} disabled={isFullyRevealed}>
          {isPaused ? "Resume" : "Pause"}
        </button>
        <button type="button" className="usavvy-board-control-button" onClick={handleReplay}>
          Replay
        </button>
        <button type="button" className="usavvy-board-control-button" onClick={handleBack} disabled={!overlayBeat && lessonBeatIndex === 0}>
          Back
        </button>
        <button type="button" className="usavvy-board-control-button" onClick={handleForward} disabled={Boolean(overlayBeat) || lessonBeatIndex === concept.beats.length - 1}>
          Forward
        </button>
        <label>
          Speed
          <select aria-label="Narration speed" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
            <option value={0.75}>0.75x</option>
            <option value={1}>1x</option>
            <option value={1.25}>1.25x</option>
            <option value={1.5}>1.5x</option>
          </select>
        </label>
        <button type="button" className="usavvy-board-control-button" onClick={() => setMuted((m) => !m)} aria-pressed={muted}>
          {muted ? "Unmute" : "Mute"}
        </button>
        <label>
          Voice
          <select aria-label="Narration voice" value={voice} onChange={(event) => setVoice(event.target.value)}>
            {VOICES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="usavvy-board-control-button" onClick={() => setShowTranscript((s) => !s)}>
          Transcript
        </button>
        <div className="usavvy-board-zoom-controls">
          <button type="button" className="usavvy-board-control-button" onClick={zoomOut} disabled={zoomLevel <= MIN_ZOOM} aria-label="Zoom out">
            −
          </button>
          <span aria-label="Zoom level">{Math.round(zoomLevel * 100)}%</span>
          <button type="button" className="usavvy-board-control-button" onClick={zoomIn} disabled={zoomLevel >= MAX_ZOOM} aria-label="Zoom in">
            +
          </button>
        </div>
        <button type="button" className="usavvy-board-explain-toggle" onClick={() => setExplainOpen((open) => !open)}>
          Explain more
        </button>
      </div>

      {explainOpen ? (
        <div className="usavvy-board-explain-cluster">
          {ROUTE_OPTIONS.map((routeType) => (
            <button key={routeType} type="button" className="usavvy-board-explain-option" onClick={() => handleExplainRoute(routeType)}>
              {describeRoute(routeType)}
            </button>
          ))}
          {!askAnythingOpen ? (
            <button type="button" className="usavvy-board-explain-option" onClick={() => setAskAnythingOpen(true)}>
              Ask anything
            </button>
          ) : (
            <form className="usavvy-board-ask-anything-form" onSubmit={handleAskAnythingSubmit}>
              <input
                aria-label="Ask anything"
                placeholder="Type your question…"
                value={askAnythingText}
                onChange={(event) => setAskAnythingText(event.target.value)}
              />
              <button type="submit" className="usavvy-board-explain-option">
                Ask
              </button>
            </form>
          )}
        </div>
      ) : null}
    </div>
  );
}
