import { useEffect, useMemo, useState } from "react";
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

function renderBlock(block: BoardContentBlock, revealedInBlock: number, blockKey: string): React.ReactNode {
  switch (block.kind) {
    case "text":
      return <div key={blockKey}>{renderTextBlock(block, revealedInBlock)}</div>;
    case "math":
      return (
        <pre key={blockKey} className="usavvy-board-block-math">
          {block.lines.slice(0, revealedInBlock).map((line, index) => (
            <div key={index}>{line}</div>
          ))}
        </pre>
      );
    case "code":
      return (
        <pre key={blockKey} className="usavvy-board-block-code" aria-label={`${block.language} code`}>
          {block.lines.slice(0, revealedInBlock).map((line, index) => (
            <div key={index} className="usavvy-board-code-line" data-active={index === revealedInBlock - 1}>
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
            <span key={node.id}>
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
                <tr key={rowIndex} data-revealed={rowIndex < revealedInBlock}>
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

function BeatContent({ beat, revealedUnits }: { beat: BoardBeat; revealedUnits: number }) {
  let remaining = revealedUnits;
  return (
    <>
      {beat.content.map((block, index) => {
        const blockUnits = countUnits(block);
        const revealedInBlock = Math.max(0, Math.min(blockUnits, remaining));
        remaining -= blockUnits;
        return (
          <div className="usavvy-board-block" key={index}>
            {renderBlock(block, revealedInBlock, String(index))}
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
  const [speed, setSpeed] = useState(1);
  const [muted, setMuted] = useState(false);
  const [voice, setVoice] = useState(VOICES[0] as string);
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

  const lessonBeat = concept.beats[lessonBeatIndex] as BoardBeat;
  const displayedBeat = overlayBeat ?? lessonBeat;
  const totalUnits = useMemo(() => totalUnitsFor(displayedBeat), [displayedBeat]);
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
              onClick={() => goToLessonBeat(index)}
            />
          ))}
        </nav>

        <main className="usavvy-board-canvas">
          <h1 className="usavvy-board-beat-heading">
            {displayedBeat.title}
            {overlayBeat ? ` (${describeRoute(overlayBeat.routeType as ExplanationRouteType)})` : null}
          </h1>
          <BeatContent beat={displayedBeat} revealedUnits={revealedUnits} />
          {isFullyRevealed ? <p className="usavvy-board-source-tag">Source: {displayedBeat.sourceRef}</p> : null}

          {overlayBeat ? (
            <button type="button" className="usavvy-board-control-button" onClick={handleBack} style={{ paddingLeft: 0 }}>
              ← Back to lesson
            </button>
          ) : null}

          {!overlayBeat && isFullyRevealed ? (
            <div>
              {bookmarks.has(displayedBeat.id) ? (
                <p role="status">Bookmarked{bookmarks.get(displayedBeat.id) ? `: "${bookmarks.get(displayedBeat.id)}"` : ""}</p>
              ) : null}
              {notingBeatId === displayedBeat.id ? (
                <div>
                  <input
                    aria-label="Bookmark note"
                    value={noteText}
                    onChange={(event) => setNoteText(event.target.value)}
                    placeholder="Add a note (optional)"
                  />
                  <button type="button" className="usavvy-board-control-button" onClick={() => saveNote(displayedBeat.id)}>
                    Save bookmark
                  </button>
                </div>
              ) : (
                <button type="button" className="usavvy-board-control-button" onClick={() => toggleBookmark(displayedBeat.id)} style={{ paddingLeft: 0 }}>
                  {bookmarks.has(displayedBeat.id) ? "Remove bookmark" : "Bookmark this Beat"}
                </button>
              )}
            </div>
          ) : null}

          {atConceptEnd && !checkpointActive ? (
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
