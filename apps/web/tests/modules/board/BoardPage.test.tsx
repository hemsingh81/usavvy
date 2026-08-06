import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { BoardPage, computeSpotlight } from "../../../src/modules/board/BoardPage.js";
import type { BoardBeat } from "../../../src/modules/board/mockBoardData.js";

/**
 * Epic 3 mock-first UX pass (`_AI-Agile-Development/implementation-artifacts/
 * epic-3-mock-first-ux-pass.md`). BoardPage has no server calls at all — every test
 * here exercises real client-side interactive logic (reveal timing, navigation,
 * explain-more content swap, checkpoint flow), not a mock fetch.
 */
function renderBoard(courseId = "c1") {
  return render(
    <MemoryRouter initialEntries={[`/courses/${courseId}/board`]}>
      <Routes>
        <Route path="/courses/:id/board" element={<BoardPage />} />
        <Route path="/courses/:id" element={<div>course detail page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("BoardPage", () => {
  afterEach(() => {
    cleanup();
    // Story 3.12: jsdom's sessionStorage is shared across tests within this file (no
    // real page reload between them) — without this, a later test's renderBoard() would
    // load whatever an earlier test left behind instead of the real defaults.
    sessionStorage.clear();
  });

  it("renders the first Beat's title and progressively reveals its text", async () => {
    renderBoard();

    expect(screen.getByRole("heading", { name: "What is recursion?" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Recursion is when/)).toBeInTheDocument());
    // Progressive reveal means the FULL sentence isn't present immediately.
    expect(screen.queryByText(/directly\.$/)).not.toBeInTheDocument();
  });

  it(
    "fully reveals the Beat's text eventually, including the emphasized phrase and its Source tag",
    async () => {
      renderBoard();

      await waitFor(() => expect(screen.getByText("calling itself")).toBeInTheDocument(), { timeout: 8000 });
      await waitFor(() => expect(screen.getByText(/Source: Uploaded notes/)).toBeInTheDocument(), { timeout: 8000 });
    },
    20_000,
  );

  it(
    "Pause halts the reveal, and Resume continues from the same point rather than restarting (AC #1)",
    async () => {
      renderBoard();
      const user = userEvent.setup();

      await waitFor(() => expect(screen.getByText(/Recursion is when/).textContent?.length).toBeGreaterThan(10), { timeout: 5000 });
      await user.click(screen.getByRole("button", { name: "Pause" }));
      const pausedText = screen.getByText(/Recursion is when/).textContent;

      await new Promise((resolve) => setTimeout(resolve, 700));
      expect(screen.getByText(/Recursion is when/).textContent).toBe(pausedText);

      await user.click(screen.getByRole("button", { name: "Resume" }));
      await waitFor(() => expect(screen.getByText(/Recursion is when/).textContent?.length).toBeGreaterThan((pausedText ?? "").length), {
        timeout: 5000,
      });
    },
    15_000,
  );

  it(
    "Replay resets the current Beat's reveal back to the start (AC #2)",
    async () => {
      const { container } = renderBoard();
      const user = userEvent.setup();

      await waitFor(() => expect(screen.getByText(/Recursion is when/).textContent?.length).toBeGreaterThan(10), { timeout: 5000 });
      await user.click(screen.getByRole("button", { name: "Replay" }));

      // Reset to zero or one word — well short of the >10-char revealed state
      // confirmed just above. Queried by class, not text, since the reset instant can
      // legitimately render zero words (an empty node no text matcher can find).
      const textBlock = container.querySelector(".usavvy-board-block-text");
      expect((textBlock?.textContent ?? "").length).toBeLessThan(15);
    },
    15_000,
  );

  it("Forward navigates to the next Beat, and Back restores the previous one fully revealed instantly (AC #3)", async () => {
    renderBoard();
    const user = userEvent.setup();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Forward" }));
    expect(screen.getByRole("heading", { name: "The two parts every recursive function needs" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "What is recursion?" })).toBeInTheDocument();
    // Already visited — restored fully revealed, not re-animated from scratch.
    await waitFor(() => expect(screen.getByText(/directly\.$/)).toBeInTheDocument());
  });

  it("stacks Beats on an infinite-scroll canvas: the previous Beat stays in the document after Forward, not swapped away (Story 3.4, AC #2)", async () => {
    renderBoard();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Forward" }));

    expect(screen.getByRole("heading", { name: "What is recursion?" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "The two parts every recursive function needs" })).toBeInTheDocument();
  });

  it(
    "zoom in/out buttons change the displayed zoom level and clamp at the min/max (Story 3.4, AC #1)",
    () => {
      renderBoard();
      expect(screen.getByLabelText("Zoom level")).toHaveTextContent("100%");

      // fireEvent (synchronous, no real per-click delay) rather than userEvent — this
      // loop clicks far more times than any other interaction in this file, and
      // userEvent's realistic per-click timing made it flake under heavy system load.
      fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
      expect(screen.getByLabelText("Zoom level")).toHaveTextContent("110%");

      for (let i = 0; i < 15; i += 1) {
        fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
      }
      expect(screen.getByLabelText("Zoom level")).toHaveTextContent("200%");
      expect(screen.getByRole("button", { name: "Zoom in" })).toBeDisabled();

      for (let i = 0; i < 20; i += 1) {
        fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
      }
      expect(screen.getByLabelText("Zoom level")).toHaveTextContent("50%");
      expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
    },
    15_000,
  );

  it("Ctrl+wheel on the canvas changes the zoom level; a plain wheel does not (Story 3.4, AC #1)", async () => {
    renderBoard();
    const canvas = screen.getByRole("heading", { name: "What is recursion?" }).closest("main") as HTMLElement;

    fireEvent.wheel(canvas, { deltaY: -100 });
    expect(screen.getByLabelText("Zoom level")).toHaveTextContent("100%");

    fireEvent.wheel(canvas, { deltaY: -100, ctrlKey: true });
    expect(screen.getByLabelText("Zoom level")).toHaveTextContent("110%");

    fireEvent.wheel(canvas, { deltaY: 100, ctrlKey: true });
    expect(screen.getByLabelText("Zoom level")).toHaveTextContent("100%");
  });

  it("gutter renders a marker for every Beat; clicking one jumps to that Beat, scrolls it into view, and resets zoom to 100% (Story 3.4, AC #3/#4)", async () => {
    renderBoard();
    const user = userEvent.setup();
    const scrollIntoViewSpy = vi.fn();
    // jsdom doesn't implement scrollIntoView — safe to stub for a spy-based assertion.
    HTMLElement.prototype.scrollIntoView = scrollIntoViewSpy;

    const markers = screen.getAllByRole("button", { name: /^Jump to Beat:/ });
    expect(markers).toHaveLength(5);

    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByLabelText("Zoom level")).toHaveTextContent("110%");

    await user.click(screen.getByRole("button", { name: "Jump to Beat: Tracing the call stack" }));

    expect(screen.getByRole("heading", { name: "Tracing the call stack" })).toBeInTheDocument();
    expect(scrollIntoViewSpy).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    expect(screen.getByLabelText("Zoom level")).toHaveTextContent("100%");
  });

  // Code review finding: clicking the marker for the Beat you're ALREADY on used to
  // unconditionally re-navigate, wiping reveal progress for a Beat still mid-reveal.
  // Uses Beat 2, NOT Beat 1 — Beat 1's id is pre-seeded into visitedBeatIds by the
  // component's own initial state, so goToLessonBeat(0) never actually resets it
  // regardless of this fix; Beat 2 only enters visitedBeatIds once fully revealed,
  // so it's the case that actually exercises the reset path this fix prevents.
  // Asserts continuity (length holds or grows), not byte-for-byte equality — the
  // reveal timer legitimately keeps ticking in real time across the click's own await.
  it("clicking the marker for the currently-active Beat does not reset its in-progress reveal (Story 3.4, code review fix)", async () => {
    renderBoard();
    HTMLElement.prototype.scrollIntoView = vi.fn();
    await userEvent.setup().click(screen.getByRole("button", { name: "Forward" }));

    await waitFor(() => expect(screen.getByText(/Every recursive function/).textContent?.length).toBeGreaterThan(30), { timeout: 5000 });
    const revealedLengthBefore = screen.getByText(/Every recursive function/).textContent?.length ?? 0;

    await userEvent.setup().click(screen.getByRole("button", { name: "Jump to Beat: The two parts every recursive function needs" }));

    expect(screen.getByText(/Every recursive function/).textContent?.length).toBeGreaterThanOrEqual(revealedLengthBefore);
  });

  it(
    "Restart concept also resets zoom back to 100% (Story 3.4, code review fix)",
    async () => {
      renderBoard();
      const user = userEvent.setup();

      for (let i = 0; i < 4; i += 1) {
        await user.click(screen.getByRole("button", { name: "Forward" }));
      }
      await waitFor(() => expect(screen.getByRole("button", { name: "Start checkpoint" })).toBeInTheDocument(), { timeout: 8000 });
      await user.click(screen.getByRole("button", { name: "Zoom in" }));
      expect(screen.getByLabelText("Zoom level")).toHaveTextContent("110%");

      await user.click(screen.getByRole("button", { name: "Restart concept" }));

      expect(screen.getByLabelText("Zoom level")).toHaveTextContent("100%");
    },
    15_000,
  );

  it("disables Forward on the last Beat and Back on the first", async () => {
    renderBoard();
    const user = userEvent.setup();

    for (let i = 0; i < 4; i += 1) {
      await user.click(screen.getByRole("button", { name: "Forward" }));
    }
    expect(screen.getByRole("heading", { name: "Why factorial grows so fast" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Forward" })).toBeDisabled();
  });

  it(
    "spotlights the code line currently receiving reveal progress, dimming its own Beat's text block and the earlier Beat's block (Story 3.11, AC #1)",
    async () => {
      const { container } = renderBoard();
      const user = userEvent.setup();
      await waitFor(() => expect(screen.getByText(/directly\.$/)).toBeInTheDocument(), { timeout: 8000 });

      await user.click(screen.getByRole("button", { name: "Forward" }));
      await waitFor(() => expect(container.querySelector('.usavvy-board-code-line[data-active="true"]')).toBeTruthy(), { timeout: 8000 });

      const activeLine = container.querySelector('.usavvy-board-code-line[data-active="true"]') as HTMLElement;
      expect(activeLine.getAttribute("data-dimmed")).not.toBe("true");

      const firstBeatSection = screen.getByRole("heading", { name: "What is recursion?" }).closest("section") as HTMLElement;
      expect(within(firstBeatSection).getByText(/directly\.$/).closest(".usavvy-board-block")?.getAttribute("data-dimmed")).toBe("true");

      const secondBeatSection = screen.getByRole("heading", { name: "The two parts every recursive function needs" }).closest("section") as HTMLElement;
      // The Beat's own text block (first .usavvy-board-block) is fully revealed and no
      // longer the spotlight now that reveal has moved into its code block.
      expect(secondBeatSection.querySelector(".usavvy-board-block")?.getAttribute("data-dimmed")).toBe("true");
    },
    15_000,
  );

  it(
    "the spotlight moves to the next code line as the reveal timer advances, de-emphasizing the previous one (Story 3.11, AC #2)",
    async () => {
      const { container } = renderBoard();
      const user = userEvent.setup();
      await waitFor(() => expect(screen.getByText(/directly\.$/)).toBeInTheDocument(), { timeout: 8000 });
      await user.click(screen.getByRole("button", { name: "Forward" }));
      await waitFor(() => expect(container.querySelector('.usavvy-board-code-line[data-active="true"]')).toBeTruthy(), { timeout: 8000 });
      const firstActiveLine = container.querySelector('.usavvy-board-code-line[data-active="true"]') as HTMLElement;
      const firstActiveLineText = firstActiveLine.textContent;

      await waitFor(
        () => {
          const nowActive = container.querySelector('.usavvy-board-code-line[data-active="true"]') as HTMLElement | null;
          expect(nowActive?.textContent).not.toBe(firstActiveLineText);
        },
        { timeout: 8000 },
      );

      const lines = container.querySelectorAll(".usavvy-board-code-line");
      const previousLine = Array.from(lines).find((line) => line.textContent === firstActiveLineText) as HTMLElement;
      expect(previousLine.getAttribute("data-dimmed")).toBe("true");
    },
    15_000,
  );

  it(
    "a manual scroll suspends dimming, and the next reveal tick restores it (Story 3.11, AC #3)",
    async () => {
      const { container } = renderBoard();
      const user = userEvent.setup();
      await waitFor(() => expect(screen.getByText(/directly\.$/)).toBeInTheDocument(), { timeout: 8000 });
      await user.click(screen.getByRole("button", { name: "Forward" }));
      await waitFor(() => expect(container.querySelector('.usavvy-board-code-line[data-active="true"]')).toBeTruthy(), { timeout: 8000 });
      expect(container.querySelector('[data-dimmed="true"]')).toBeTruthy();

      fireEvent.scroll(screen.getByRole("main"));
      expect(container.querySelector('[data-dimmed="true"]')).toBeFalsy();

      await waitFor(() => expect(container.querySelector('[data-dimmed="true"]')).toBeTruthy(), { timeout: 8000 });
    },
    15_000,
  );

  it(
    "Pause suspends dimming, and Resume restores it on the next tick (Story 3.11, AC #3)",
    async () => {
      const { container } = renderBoard();
      const user = userEvent.setup();
      await waitFor(() => expect(screen.getByText(/directly\.$/)).toBeInTheDocument(), { timeout: 8000 });
      await user.click(screen.getByRole("button", { name: "Forward" }));
      await waitFor(() => expect(container.querySelector('.usavvy-board-code-line[data-active="true"]')).toBeTruthy(), { timeout: 8000 });
      expect(container.querySelector('[data-dimmed="true"]')).toBeTruthy();

      await user.click(screen.getByRole("button", { name: "Pause" }));
      expect(container.querySelector('[data-dimmed="true"]')).toBeFalsy();

      await user.click(screen.getByRole("button", { name: "Resume" }));
      await waitFor(() => expect(container.querySelector('[data-dimmed="true"]')).toBeTruthy(), { timeout: 8000 });
    },
    15_000,
  );

  it("'Explain more' -> 'a different example' swaps in a mocked alternate Beat, with a way back to the lesson (AC: Story 3.17)", async () => {
    renderBoard();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Explain more" }));
    await user.click(screen.getByRole("button", { name: "a different example" }));

    expect(screen.getByRole("heading", { name: /A different example: counting down/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "← Back to lesson" }));
    expect(screen.getByRole("heading", { name: "What is recursion?" })).toBeInTheDocument();
  });

  it("'Ask anything' generates a mocked answer referencing the submitted question (AC: Story 3.20)", async () => {
    renderBoard();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Explain more" }));
    await user.click(screen.getByRole("button", { name: "Ask anything" }));
    await user.type(screen.getByLabelText("Ask anything"), "why does it stop?");
    await user.click(screen.getByRole("button", { name: "Ask" }));

    expect(screen.getByRole("heading", { name: /why does it stop\?/ })).toBeInTheDocument();
  });

  it(
    "reaching the last Beat fully revealed offers a checkpoint, which records feedback per question and completes (AC: Story 3.13)",
    async () => {
      renderBoard();
      const user = userEvent.setup();

      for (let i = 0; i < 4; i += 1) {
        await user.click(screen.getByRole("button", { name: "Forward" }));
      }
      await waitFor(() => expect(screen.getByRole("button", { name: "Start checkpoint" })).toBeInTheDocument(), { timeout: 8000 });

      await user.click(screen.getByRole("button", { name: "Start checkpoint" }));
      expect(screen.getByText("What stops a recursive function from calling itself forever?")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "A base case" }));
      expect(screen.getByText(/Exactly — the base case/)).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Next question" }));
      await user.click(screen.getByRole("button", { name: "The call it made to return" }));
      await user.click(screen.getByRole("button", { name: "Finish checkpoint" }));

      expect(screen.getByText("Checkpoint complete")).toBeInTheDocument();
    },
    15_000,
  );

  it("the transcript panel lists only visited Beats and supports search-highlighting (AC: Story 3.30)", async () => {
    renderBoard();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Transcript" }));
    const transcript = screen.getByLabelText("Transcript");
    expect(within(transcript).getByRole("heading", { name: "What is recursion?" })).toBeInTheDocument();
    expect(within(transcript).queryByRole("heading", { name: "The two parts every recursive function needs" })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Search transcript"), "base case");
    await waitFor(() => expect(within(transcript).queryByRole("heading", { name: "What is recursion?" })).not.toBeInTheDocument());
  });

  it(
    "bookmarking the current Beat records an optional note (AC: Story 3.28)",
    async () => {
      renderBoard();
      const user = userEvent.setup();

      await waitFor(() => expect(screen.getByText(/directly\.$/)).toBeInTheDocument(), { timeout: 8000 });
      await user.click(screen.getByRole("button", { name: "Bookmark this Beat" }));
      await user.type(screen.getByLabelText("Bookmark note"), "review this again");
      await user.click(screen.getByRole("button", { name: "Save bookmark" }));

      expect(screen.getByText(/Bookmarked: "review this again"/)).toBeInTheDocument();
    },
    15_000,
  );

  it("links back to the real course detail page, not a dead end", () => {
    renderBoard();

    expect(screen.getByRole("link", { name: /Exit board/ })).toHaveAttribute("href", "/courses/c1");
  });

  it("persists speed/mute/voice across unmount+remount within the same session (Story 3.12, AC #4)", async () => {
    const user = userEvent.setup();
    const first = renderBoard();

    await user.selectOptions(screen.getByLabelText("Narration speed"), "1.5");
    await user.click(screen.getByRole("button", { name: "Mute" }));
    await user.selectOptions(screen.getByLabelText("Narration voice"), "Voice B");

    first.unmount();
    renderBoard();

    expect(screen.getByLabelText("Narration speed")).toHaveValue("1.5");
    expect(screen.getByRole("button", { name: "Unmute" })).toBeInTheDocument();
    expect(screen.getByLabelText("Narration voice")).toHaveValue("Voice B");
  });

  it("falls back to defaults when sessionStorage is empty or malformed (Story 3.12, AC #4)", () => {
    sessionStorage.setItem("usavvy-board-preferences", "not valid json{{{");
    renderBoard();

    expect(screen.getByLabelText("Narration speed")).toHaveValue("1");
    expect(screen.getByRole("button", { name: "Mute" })).toBeInTheDocument();
    expect(screen.getByLabelText("Narration voice")).toHaveValue("Voice A");
  });

  it("falls back to the default speed when a stored value is outside the allowed options (Story 3.12, AC #4)", () => {
    sessionStorage.setItem("usavvy-board-preferences", JSON.stringify({ speed: 99, muted: false, voice: "Voice A" }));
    renderBoard();

    expect(screen.getByLabelText("Narration speed")).toHaveValue("1");
  });
});

// Code review finding (Story 3.11): `computeSpotlight` gave math blocks per-line
// sub-spotlighting like code, contradicting the story's own spec (whole-block for
// text/math). Masked in the real mock data because its one math block is always the
// LAST block of its Beat — by the time a 2nd line is revealed the whole Beat is fully
// revealed and computeSpotlight's own early-return hides the symptom. Exercises a
// constructed multi-block Beat the mock data doesn't happen to contain, to actually
// catch a regression here.
describe("computeSpotlight (Story 3.11, code review fix)", () => {
  const twoBlockBeat: BoardBeat = {
    id: "test-beat",
    title: "Test Beat",
    narrationText: "irrelevant",
    sourceRef: "test",
    routeType: null,
    content: [
      { kind: "math", lines: ["line one", "line two", "line three"] },
      { kind: "table", headers: ["a"], rows: [["1"], ["2"]] },
    ],
  };

  it("spotlights the whole math block (subIndex null), not a specific line, while revealing its 2nd of 3 lines", () => {
    expect(computeSpotlight(twoBlockBeat, 2)).toEqual({ blockIndex: 0, subIndex: null });
  });

  it("spotlights the specific table row once reveal has moved past the math block", () => {
    expect(computeSpotlight(twoBlockBeat, 4)).toEqual({ blockIndex: 1, subIndex: 0 });
  });

  it("returns null once the Beat is fully revealed", () => {
    expect(computeSpotlight(twoBlockBeat, 5)).toBeNull();
  });
});
