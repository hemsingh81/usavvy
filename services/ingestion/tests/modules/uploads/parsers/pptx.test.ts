import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parsePptx } from "../../../../src/modules/uploads/parsers/pptx.js";
import { CorruptDocumentError } from "../../../../src/modules/uploads/parsers/types.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "fixtures");
const fixture = (name: string) => readFileSync(join(fixturesDir, name));

describe("parsePptx", () => {
  it("treats each slide as one section, using its first text run as the heading (AC #1)", async () => {
    const result = await parsePptx(fixture("valid-structured.pptx"));

    expect(result.sections).toHaveLength(2);
    expect(result.sections[0]).toMatchObject({ heading: "Slide One Title", pageRangeStart: 1, pageRangeEnd: 1 });
    expect(result.sections[0]?.text).toContain("body content of the first slide");
    expect(result.sections[1]).toMatchObject({ heading: "Slide Two Title", pageRangeStart: 2, pageRangeEnd: 2 });
  });

  it("throws CorruptDocumentError with the AC #4 reason for a non-zip/corrupt buffer", async () => {
    await expect(parsePptx(fixture("corrupt.pptx"))).rejects.toBeInstanceOf(CorruptDocumentError);
    await expect(parsePptx(fixture("corrupt.pptx"))).rejects.toMatchObject({ reason: "corrupt file" });
  });
});
