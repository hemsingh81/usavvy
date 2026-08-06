import { describe, expect, it } from "vitest";
import { describeIngestionStatus } from "../../../src/modules/uploads/ingestionStatus.js";

describe("describeIngestionStatus", () => {
  it("maps 'queued'", () => {
    expect(describeIngestionStatus("queued", null)).toMatchObject({ stageLabel: "Queued", progressPercent: 0, isTerminal: false, isFailure: false });
  });

  it("maps 'parsing'", () => {
    expect(describeIngestionStatus("parsing", null)).toMatchObject({ stageLabel: "Parsing", progressPercent: 25, isTerminal: false, isFailure: false });
  });

  it("maps 'safety scan'", () => {
    expect(describeIngestionStatus("safety scan", null)).toMatchObject({
      stageLabel: "Safety scan",
      progressPercent: 50,
      isTerminal: false,
      isFailure: false,
    });
  });

  it("maps 'parsed' as an honest interim terminal — not a false 'outline ready' claim (AC #4 scope note)", () => {
    const result = describeIngestionStatus("parsed", null);
    expect(result.stageLabel).toBe("Processed — outline generation coming soon");
    expect(result.isTerminal).toBe(true);
    expect(result.isFailure).toBe(false);
  });

  it("maps 'embedding' (forward-compatible, unreachable by any real job today) (AC #1)", () => {
    expect(describeIngestionStatus("embedding", null)).toMatchObject({ stageLabel: "Embedding", progressPercent: 75, isTerminal: false, isFailure: false });
  });

  it("maps 'outline ready' (forward-compatible, unreachable by any real job today) (AC #4)", () => {
    expect(describeIngestionStatus("outline ready", null)).toMatchObject({
      stageLabel: "Outline ready",
      progressPercent: 100,
      isTerminal: true,
      isFailure: false,
    });
  });

  it("maps 'blocked' with the raw failure reason and a content-policy next step (AC #2, #3)", () => {
    const result = describeIngestionStatus("blocked", "blocked: self-harm-instructions");
    expect(result).toMatchObject({ stageLabel: "Blocked", isTerminal: true, isFailure: true, failureReason: "blocked: self-harm-instructions" });
    expect(result.nextStepSuggestion).toContain("content policy");
  });

  it("maps 'failed' with 'encrypted file' to the password-removal next step (AC #2, #3)", () => {
    const result = describeIngestionStatus("failed", "encrypted file");
    expect(result.failureReason).toBe("encrypted file");
    expect(result.nextStepSuggestion).toContain("password protection");
  });

  it("maps 'failed' with 'corrupt file' to the re-export next step (AC #2, #3)", () => {
    const result = describeIngestionStatus("failed", "corrupt file");
    expect(result.failureReason).toBe("corrupt file");
    expect(result.nextStepSuggestion).toContain("corrupted");
  });

  it("still gives an actionable next step for an unrecognized failure reason, never nothing (AD-17)", () => {
    const result = describeIngestionStatus("failed", "some future reason not yet mapped");
    expect(result.isFailure).toBe(true);
    expect(result.failureReason).toBe("some future reason not yet mapped");
    expect(result.nextStepSuggestion).toBeTruthy();
  });

  it("keeps polling for an unrecognized status rather than silently declaring it done (AD-17, review finding)", () => {
    const result = describeIngestionStatus("some-future-status-this-client-does-not-know", null);
    expect(result.isTerminal).toBe(false);
    expect(result.isFailure).toBe(false);
  });
});
