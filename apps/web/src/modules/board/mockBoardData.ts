/**
 * Epic 3 mock-first UX pass (`_AI-Agile-Development/implementation-artifacts/
 * epic-3-mock-first-ux-pass.md`). Static, hand-authored content standing in for what
 * `GenerationPort`/`board-orchestration` will produce once Epic 3's real backend
 * stories exist — every field here is a placeholder, not a real content contract.
 */

export type BoardContentBlock =
  | { kind: "text"; text: string; emphasis?: string[] }
  | { kind: "math"; lines: string[] }
  | { kind: "code"; language: string; lines: string[] }
  | { kind: "diagram"; nodes: { id: string; label: string }[]; edges: { from: string; to: string }[] }
  | { kind: "table"; headers: string[]; rows: string[][] };

export interface BoardBeat {
  id: string;
  title: string;
  narrationText: string;
  content: BoardContentBlock[];
  sourceRef: string;
  /** Which "explain more" route produced this Beat, if any — null for the canonical lesson Beat. */
  routeType: ExplanationRouteType | null;
}

export type ExplanationRouteType =
  | "deeper"
  | "simpler"
  | "different-example"
  | "more-examples"
  | "analogy"
  | "ask-anything"
  | "confused";

export interface CheckpointQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  feedbackCorrect: string;
  feedbackIncorrect: string;
}

export interface TranscriptEntry {
  beatId: string;
  beatTitle: string;
  text: string;
}

export interface MockConcept {
  id: string;
  title: string;
  beats: BoardBeat[];
  checkpointQuestions: CheckpointQuestion[];
}

export const MOCK_CONCEPT: MockConcept = {
  id: "concept-recursion",
  title: "Recursion",
  beats: [
    {
      id: "beat-1",
      title: "What is recursion?",
      narrationText:
        "Recursion is when a function solves a problem by calling itself on a smaller version of the same problem, until it reaches a case simple enough to answer directly.",
      content: [
        {
          kind: "text",
          text: "Recursion is when a function solves a problem by calling itself on a smaller version of the same problem, until it reaches a case simple enough to answer directly.",
          emphasis: ["calling itself", "smaller version"],
        },
      ],
      sourceRef: "Uploaded notes — Chapter 3, p. 42",
      routeType: null,
    },
    {
      id: "beat-2",
      title: "The two parts every recursive function needs",
      narrationText: "Every recursive function needs a base case, which stops the recursion, and a recursive case, which does the calling.",
      content: [
        {
          kind: "text",
          text: "Every recursive function needs a base case, which stops the recursion, and a recursive case, which does the calling.",
          emphasis: ["base case", "recursive case"],
        },
        {
          kind: "code",
          language: "python",
          lines: ["def factorial(n):", "    if n == 0:", "        return 1        # base case", "    return n * factorial(n - 1)  # recursive case"],
        },
      ],
      sourceRef: "Uploaded notes — Chapter 3, p. 44",
      routeType: null,
    },
    {
      id: "beat-3",
      title: "Tracing the call stack",
      narrationText: "Each call waits for the one below it to return, building a stack of pending multiplications that unwind once the base case is hit.",
      content: [
        {
          kind: "text",
          text: "Each call waits for the one below it to return, building a stack of pending multiplications that unwind once the base case is hit.",
        },
        {
          kind: "diagram",
          nodes: [
            { id: "n1", label: "factorial(4)" },
            { id: "n2", label: "factorial(3)" },
            { id: "n3", label: "factorial(2)" },
            { id: "n4", label: "factorial(1)" },
            { id: "n5", label: "factorial(0) → 1" },
          ],
          edges: [
            { from: "n1", to: "n2" },
            { from: "n2", to: "n3" },
            { from: "n3", to: "n4" },
            { from: "n4", to: "n5" },
          ],
        },
      ],
      sourceRef: "Uploaded notes — Chapter 3, p. 45",
      routeType: null,
    },
    {
      id: "beat-4",
      title: "Recursion vs. iteration, at a glance",
      narrationText: "Recursion and iteration can solve the same problems, but they trade off differently on memory and readability.",
      content: [
        { kind: "text", text: "Recursion and iteration can solve the same problems, but they trade off differently on memory and readability." },
        {
          kind: "table",
          headers: ["", "Recursion", "Iteration"],
          rows: [
            ["Memory", "O(n) call stack", "O(1) typically"],
            ["Readability", "Often clearer for tree-shaped problems", "Often clearer for simple counting"],
            ["Risk", "Stack overflow on deep input", "None from depth"],
          ],
        },
      ],
      sourceRef: "Uploaded notes — Chapter 3, p. 47",
      routeType: null,
    },
    {
      id: "beat-5",
      title: "Why factorial grows so fast",
      narrationText: "Factorial growth is captured by a simple product formula, and it outpaces any polynomial.",
      content: [
        { kind: "text", text: "Factorial growth is captured by a simple product formula, and it outpaces any polynomial." },
        { kind: "math", lines: ["n! = n \\times (n-1) \\times (n-2) \\times \\cdots \\times 1", "5! = 5 \\times 4 \\times 3 \\times 2 \\times 1 = 120"] },
      ],
      sourceRef: "Uploaded notes — Chapter 3, p. 48",
      routeType: null,
    },
  ],
  checkpointQuestions: [
    {
      id: "cq-1",
      question: "What stops a recursive function from calling itself forever?",
      options: ["A base case", "A for loop", "A return type", "A print statement"],
      correctIndex: 0,
      feedbackCorrect: "Exactly — the base case is what ends the recursion.",
      feedbackIncorrect: "Not quite — it's the base case that ends the recursion, not this.",
    },
    {
      id: "cq-2",
      question: "What does each pending recursive call wait for before it can return?",
      options: ["The next user click", "The call it made to return", "A timer", "Nothing — it returns immediately"],
      correctIndex: 1,
      feedbackCorrect: "Right — each call waits on the one it called, forming the call stack.",
      feedbackIncorrect: "Each call actually waits on the one it called — that's what forms the call stack.",
    },
  ],
};

const ROUTE_LABELS: Record<ExplanationRouteType, string> = {
  deeper: "a deeper explanation",
  simpler: "a simpler explanation",
  "different-example": "a different example",
  "more-examples": "more examples",
  analogy: "an analogy",
  "ask-anything": "an answer",
  confused: "a re-explanation",
};

/**
 * Stands in for a real `GenerationPort` call — deterministically builds a plausible
 * alternate Beat for the requested explanation route, tagged with that route type
 * (mirrors AC #2 of Story 3.14 — a real implementation would also record that this
 * route has now been used for this Concept, so a later "repeat explanation" request
 * picks a different one, Story 3.25).
 */
export function mockAlternateBeat(baseBeat: BoardBeat, routeType: ExplanationRouteType, askAnythingQuestion?: string): BoardBeat {
  switch (routeType) {
    case "deeper":
      return {
        id: `${baseBeat.id}-deeper`,
        title: `${baseBeat.title} — in more depth`,
        narrationText: `Going deeper: ${baseBeat.narrationText} Formally, this is a well-founded recursion — the argument strictly decreases toward the base case, which is what guarantees termination.`,
        content: [
          { kind: "text", text: `Going deeper: ${baseBeat.narrationText}` },
          {
            kind: "text",
            text: "Formally, this is a well-founded recursion — the argument strictly decreases toward the base case on every call, which is exactly what guarantees the recursion terminates.",
            emphasis: ["well-founded recursion", "strictly decreases"],
          },
        ],
        sourceRef: baseBeat.sourceRef,
        routeType,
      };
    case "simpler":
      return {
        id: `${baseBeat.id}-simpler`,
        title: `${baseBeat.title} — the short version`,
        narrationText: "In short: a recursive function is one that calls itself on a smaller piece of the problem, until the piece is too small to break down further.",
        content: [
          {
            kind: "text",
            text: "In short: a recursive function is one that calls itself on a smaller piece of the problem, until the piece is too small to break down further.",
          },
        ],
        sourceRef: baseBeat.sourceRef,
        routeType,
      };
    case "different-example":
      return {
        id: `${baseBeat.id}-different-example`,
        title: "A different example: counting down",
        narrationText: "Here's the same idea with a countdown function instead of a factorial.",
        content: [
          { kind: "text", text: "Here's the same idea with a countdown function instead of a factorial." },
          { kind: "code", language: "python", lines: ["def countdown(n):", "    if n == 0:", "        print('done')", "        return", "    print(n)", "    countdown(n - 1)"] },
        ],
        sourceRef: baseBeat.sourceRef,
        routeType,
      };
    case "more-examples":
      return {
        id: `${baseBeat.id}-more-examples`,
        title: "One more example: summing a list",
        narrationText: "Summing a list recursively: the sum of an empty list is 0, otherwise it's the first item plus the sum of the rest.",
        content: [
          { kind: "text", text: "Summing a list recursively: the sum of an empty list is 0, otherwise it's the first item plus the sum of the rest." },
          { kind: "code", language: "python", lines: ["def sum_list(items):", "    if not items:", "        return 0", "    return items[0] + sum_list(items[1:])"] },
        ],
        sourceRef: baseBeat.sourceRef,
        routeType,
      };
    case "analogy":
      return {
        id: `${baseBeat.id}-analogy`,
        title: "An analogy: Russian nesting dolls",
        narrationText: "Think of Russian nesting dolls: to open the whole set, you open one doll to reveal a smaller one, and repeat, until you reach the smallest doll that doesn't open at all.",
        content: [
          {
            kind: "text",
            text: "Think of Russian nesting dolls: to open the whole set, you open one doll to reveal a smaller one, and repeat, until you reach the smallest doll that doesn't open at all — that smallest doll is the base case.",
            emphasis: ["smallest doll"],
          },
        ],
        sourceRef: baseBeat.sourceRef,
        routeType,
      };
    case "confused":
      return {
        id: `${baseBeat.id}-confused`,
        title: "Let's slow down",
        narrationText: "No problem — let's rebuild this one small step at a time, starting from just the base case.",
        content: [
          { kind: "text", text: "No problem — let's rebuild this one small step at a time, starting from just the base case." },
          { kind: "code", language: "python", lines: ["if n == 0:", "    return 1   # this alone is the whole base case"] },
        ],
        sourceRef: baseBeat.sourceRef,
        routeType,
      };
    case "ask-anything": {
      const question = askAnythingQuestion?.trim() || "your question";
      return {
        id: `${baseBeat.id}-ask-anything-${Date.now() % 100000}`,
        title: `Re: "${question}"`,
        narrationText: `Good question. In the context of ${baseBeat.title.toLowerCase()}: the key thing to remember is that every recursive call must move strictly closer to the base case, or it never terminates.`,
        content: [
          {
            kind: "text",
            text: `Good question. In the context of ${baseBeat.title.toLowerCase()}: the key thing to remember is that every recursive call must move strictly closer to the base case, or it never terminates.`,
          },
        ],
        sourceRef: baseBeat.sourceRef,
        routeType,
      };
    }
    default:
      return baseBeat;
  }
}

export function describeRoute(routeType: ExplanationRouteType): string {
  return ROUTE_LABELS[routeType];
}
