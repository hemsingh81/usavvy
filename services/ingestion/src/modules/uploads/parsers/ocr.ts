import { pdf } from "pdf-to-img";
import { createWorker } from "tesseract.js";

// Story 2.9 (FR-C-9), AC #2. Bounds worst-case job duration for a pathological
// scanned document rather than leaving OCR unbounded — pages beyond the cap are
// simply skipped (their section keeps its empty text, not an error), a documented,
// low-severity MVP limitation (see this story's Dev Notes).
export const MAX_OCR_PAGES_PER_DOCUMENT = 50;

/**
 * Renders each requested page to a PNG (`pdf-to-img`, wrapping `pdfjs-dist` +
 * `@napi-rs/canvas`) and OCRs it with a single reused `tesseract.js` worker — cheaper
 * than spinning up one worker per page. Explicitly scoped, accepted limitations:
 * generic Tesseract with no image preprocessing (deskew, contrast correction) is
 * "good enough to search and build a rough outline from," not publication-quality
 * transcription — inherent to OCR generally, not a corner this story cut. A page that
 * OCRs to empty/garbage text still doesn't throw — OCR failure degrades to an empty
 * string for that page rather than failing the whole ingestion job (AD-17: this is
 * explicitly a fallback path, not the primary guarantee).
 */
export async function ocrPdfPages(buffer: Buffer, pageNumbers: number[]): Promise<Map<number, string>> {
  const results = new Map<number, string>();
  const pagesToProcess = pageNumbers.slice(0, MAX_OCR_PAGES_PER_DOCUMENT);
  if (pagesToProcess.length === 0) return results;

  const doc = await pdf(buffer, { scale: 2 });
  const worker = await createWorker("eng");
  try {
    for (const pageNumber of pagesToProcess) {
      try {
        const pngBuffer = await doc.getPage(pageNumber);
        const { data } = await worker.recognize(pngBuffer);
        results.set(pageNumber, data.text.trim());
      } catch {
        results.set(pageNumber, "");
      }
    }
  } finally {
    await worker.terminate();
    await doc.destroy();
  }
  return results;
}
