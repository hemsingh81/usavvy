import PDFDocument from "pdfkit";
import type { DataExport } from "@usavvy/shared-types";

// Review finding (Blind Hunter + Edge Case Hunter, independently): naive String(value)
// rendered a nested object (e.g. availability, { monday: 1, ... }) as the literal text
// "[object Object]", silently destroying real learner data in the one deliverable this
// story exists to produce. Arrays (e.g. interests) are now joined with "; " rather than
// String()'s implicit "," so a comma inside an individual item can't be mistaken for an
// item boundary.
export function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.length === 0 ? "—" : value.map((item) => formatFieldValue(item)).join("; ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, nested]) => `${key}: ${formatFieldValue(nested)}`)
      .join(", ");
  }
  return String(value);
}

// Story 1.8 (FR-A-8). No design-system styling is warranted for a document a learner
// opens outside the app — plain, legible text is the entire requirement. pdfkit is
// called directly here, not behind a port (AD-1's port philosophy gates swappable
// cross-cutting capabilities, not a single-call-site rendering library).
function renderSection(doc: PDFKit.PDFDocument, title: string, fields: Record<string, unknown>): void {
  doc.moveDown().fontSize(14).text(title, { underline: true });
  doc.fontSize(11);
  for (const [key, value] of Object.entries(fields)) {
    doc.text(`${key}: ${formatFieldValue(value)}`);
  }
}

export function generateDataExportPdf(data: DataExport): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(20).text("Usavvy Data Export");
    renderSection(doc, "Account", data.account);
    renderSection(doc, "Learner Profile", data.learnerProfile);
    renderSection(doc, "Preferences", data.preferences);
    renderSection(doc, "Privacy Settings", data.privacySettings);

    doc.end();
  });
}
