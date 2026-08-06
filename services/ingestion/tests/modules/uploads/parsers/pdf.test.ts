import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parsePdf } from "../../../../src/modules/uploads/parsers/pdf.js";
import { CorruptDocumentError, EncryptedDocumentError } from "../../../../src/modules/uploads/parsers/types.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "fixtures");
const fixture = (name: string) => readFileSync(join(fixturesDir, name));

describe("parsePdf", () => {
  it("extracts text and detects headings by font size across pages (AC #1)", async () => {
    const result = await parsePdf(fixture("valid-text.pdf"));

    expect(result.sections).toHaveLength(2);
    expect(result.sections[0]).toMatchObject({ heading: "Chapter One", pageRangeStart: 1, pageRangeEnd: 1, needsOcr: false });
    expect(result.sections[0]?.text).toContain("This is the body text of chapter one");
    expect(result.sections[1]).toMatchObject({ heading: "Chapter Two", pageRangeStart: 2, pageRangeEnd: 2, needsOcr: false });
  });

  it("throws EncryptedDocumentError with the AC #3 reason for a password-protected PDF", async () => {
    await expect(parsePdf(fixture("encrypted.pdf"))).rejects.toBeInstanceOf(EncryptedDocumentError);
    await expect(parsePdf(fixture("encrypted.pdf"))).rejects.toMatchObject({ reason: "encrypted file" });
  });

  it("throws CorruptDocumentError with the AC #4 reason for a corrupt/non-PDF buffer", async () => {
    await expect(parsePdf(fixture("corrupt.pdf"))).rejects.toBeInstanceOf(CorruptDocumentError);
    await expect(parsePdf(fixture("corrupt.pdf"))).rejects.toMatchObject({ reason: "corrupt file" });
  });

  it("flags a page with no extractable text layer as needing OCR, without throwing (AC #2)", async () => {
    const result = await parsePdf(fixture("scanned-no-text.pdf"));

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]).toMatchObject({ text: "", needsOcr: true, pageNumber: 1 });
  });
});
