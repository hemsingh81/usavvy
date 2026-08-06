import { describe, expect, it } from "vitest";
import { parsePlainText } from "../../../../src/modules/uploads/parsers/plainText.js";

describe("parsePlainText", () => {
  it("treats a whole TXT file as one sectionless block (no structural signal exists to detect)", () => {
    const result = parsePlainText(Buffer.from("Just plain content with no structure at all."), "txt");

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]).toMatchObject({ heading: null, text: "Just plain content with no structure at all.", pageRangeStart: null });
  });

  it("splits Markdown on real #-prefixed headings (AC #1)", () => {
    const md = "# Intro\nFirst paragraph.\n\n# Details\nSecond paragraph.";
    const result = parsePlainText(Buffer.from(md), "md");

    expect(result.sections).toHaveLength(2);
    expect(result.sections[0]).toMatchObject({ heading: "Intro" });
    expect(result.sections[0]?.text).toContain("First paragraph");
    expect(result.sections[1]).toMatchObject({ heading: "Details" });
    expect(result.sections[1]?.text).toContain("Second paragraph");
  });

  it("handles Markdown with no headings at all as one sectionless block", () => {
    const result = parsePlainText(Buffer.from("Just a paragraph, no heading markers."), "md");

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]?.heading).toBeNull();
  });
});
