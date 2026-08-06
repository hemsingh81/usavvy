import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MAX_OCR_PAGES_PER_DOCUMENT, ocrPdfPages } from "../../../../src/modules/uploads/parsers/ocr.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "fixtures");
const fixture = (name: string) => readFileSync(join(fixturesDir, name));

describe("ocrPdfPages", () => {
  it(
    "renders a scanned page and OCRs the known text on it (AC #2)",
    async () => {
      const results = await ocrPdfPages(fixture("scanned-no-text.pdf"), [1]);

      expect(results.get(1)?.toUpperCase()).toContain("HELLO WORLD");
    },
    30_000,
  );

  it("returns an empty map without touching the OCR engine when no pages are requested", async () => {
    const results = await ocrPdfPages(fixture("scanned-no-text.pdf"), []);

    expect(results.size).toBe(0);
  });

  it("respects MAX_OCR_PAGES_PER_DOCUMENT, only processing the pages up to the cap", async () => {
    // A page number beyond the fixture's actual page count still exercises the cap
    // logic itself (how many pages are ATTEMPTED) without needing a huge real fixture.
    const requestedPages = Array.from({ length: MAX_OCR_PAGES_PER_DOCUMENT + 10 }, (_, i) => i + 1);

    const results = await ocrPdfPages(fixture("scanned-no-text.pdf"), requestedPages);

    // Pages beyond the fixture's own single page fail to render and degrade to "" per
    // page (never throwing) — the cap is proven by the map never exceeding its size,
    // not by every entry having real text.
    expect(results.size).toBeLessThanOrEqual(MAX_OCR_PAGES_PER_DOCUMENT);
  }, 60_000);
});
