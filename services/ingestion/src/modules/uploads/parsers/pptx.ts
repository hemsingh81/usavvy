import JSZip from "jszip";
import { CorruptDocumentError, type ParsedDocument, type ParsedSection } from "./types.js";

/**
 * Story 2.9 (FR-C-9), AC #1. PPTX is a zip of XML slide files — no dedicated,
 * well-maintained "PPTX text extraction" library exists (researched and confirmed
 * before choosing this approach), so this reads the zip directly and extracts
 * `<a:t>...</a:t>` text runs via regex: a small, stable corner of ECMA-376 that hasn't
 * changed across PowerPoint versions — a pragmatic shortcut for "get searchable text,"
 * not an attempt at a full OOXML parse.
 *
 * Each slide is treated as one section (the PPTX analog of a PDF page); its FIRST text
 * run becomes that section's heading — typically the title placeholder, a REAL signal
 * (not a heuristic) since slide title placeholders are conventionally authored first in
 * a slide's shape tree. `pageRangeStart`/`pageRangeEnd` both equal the slide number.
 */
export async function parsePptx(buffer: Buffer): Promise<ParsedDocument> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (error) {
    throw new CorruptDocumentError(error instanceof Error ? error.message : "invalid PPTX structure");
  }

  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  const sections: ParsedSection[] = [];
  for (const name of slideFiles) {
    const file = zip.file(name);
    if (!file) continue;
    const xml = await file.async("string");
    const runs = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((match) => decodeXmlEntities(match[1] ?? ""));
    const slideNum = slideNumber(name);
    sections.push({
      heading: runs[0]?.trim() || null,
      text: runs.join(" ").replace(/\s+/g, " ").trim(),
      pageRangeStart: slideNum,
      pageRangeEnd: slideNum,
    });
  }

  return { sections };
}

function slideNumber(fileName: string): number {
  const match = fileName.match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
