import PDFDocument from "pdfkit";
import type { DataExport } from "@usavvy/shared-types";

// Story 1.8 (FR-A-8). No design-system styling is warranted for a document a learner
// opens outside the app — plain, legible text is the entire requirement. pdfkit is
// called directly here, not behind a port (AD-1's port philosophy gates swappable
// cross-cutting capabilities, not a single-call-site rendering library).
function renderSection(doc: PDFKit.PDFDocument, title: string, fields: Record<string, unknown>): void {
  doc.moveDown().fontSize(14).text(title, { underline: true });
  doc.fontSize(11);
  for (const [key, value] of Object.entries(fields)) {
    doc.text(`${key}: ${value === null || value === undefined ? "—" : String(value)}`);
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
