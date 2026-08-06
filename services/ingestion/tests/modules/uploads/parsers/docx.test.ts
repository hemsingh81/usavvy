import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseDocx } from "../../../../src/modules/uploads/parsers/docx.js";
import { CorruptDocumentError } from "../../../../src/modules/uploads/parsers/types.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "fixtures");
const fixture = (name: string) => readFileSync(join(fixturesDir, name));

describe("parseDocx", () => {
  it("splits on real h1-h6 headings from the document's own paragraph styles (AC #1)", async () => {
    const result = await parseDocx(fixture("valid-structured.docx"));

    expect(result.sections).toHaveLength(2);
    expect(result.sections[0]).toMatchObject({ heading: "Introduction", pageRangeStart: null, pageRangeEnd: null });
    expect(result.sections[0]?.text).toContain("introduction paragraph");
    expect(result.sections[1]).toMatchObject({ heading: "Details" });
    expect(result.sections[1]?.text).toContain("details section paragraph");
  });

  it("throws CorruptDocumentError with the AC #4 reason for a non-zip/corrupt buffer", async () => {
    await expect(parseDocx(fixture("corrupt.docx"))).rejects.toBeInstanceOf(CorruptDocumentError);
    await expect(parseDocx(fixture("corrupt.docx"))).rejects.toMatchObject({ reason: "corrupt file" });
  });
});
