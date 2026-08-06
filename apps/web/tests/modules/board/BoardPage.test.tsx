import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { BoardPage } from "../../../src/modules/board/BoardPage.js";

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

  it("disables Forward on the last Beat and Back on the first", async () => {
    renderBoard();
    const user = userEvent.setup();

    for (let i = 0; i < 4; i += 1) {
      await user.click(screen.getByRole("button", { name: "Forward" }));
    }
    expect(screen.getByRole("heading", { name: "Why factorial grows so fast" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Forward" })).toBeDisabled();
  });

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
});
