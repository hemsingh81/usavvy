// One-off generator for this story's test fixtures — run manually (`node
// tests/fixtures/generate.mjs`) whenever a fixture needs regenerating; its output is
// checked into git, this script is not run as part of the test suite itself.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createCanvas } from "@napi-rs/canvas";
import JSZip from "jszip";

const dir = dirname(fileURLToPath(import.meta.url));
const out = (name) => join(dir, name);

async function makeValidTextPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  const page1 = doc.addPage([400, 300]);
  page1.drawText("Chapter One", { x: 50, y: 250, size: 24, font: boldFont, color: rgb(0, 0, 0) });
  page1.drawText("This is the body text of chapter one. It contains enough words to form a real paragraph for testing purposes.", {
    x: 50,
    y: 200,
    size: 10,
    font,
    maxWidth: 300,
  });

  const page2 = doc.addPage([400, 300]);
  page2.drawText("Chapter Two", { x: 50, y: 250, size: 24, font: boldFont, color: rgb(0, 0, 0) });
  page2.drawText("This is the body text of chapter two, following on from the first chapter with more test content.", {
    x: 50,
    y: 200,
    size: 10,
    font,
    maxWidth: 300,
  });

  writeFileSync(out("valid-text.pdf"), await doc.save());
}

// PDF spec (ISO 32000-1) 7.6.3.3's fixed 32-byte padding string, used to pad
// passwords shorter than 32 bytes before hashing.
const PAD = Buffer.from([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08, 0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80,
  0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

function padPassword(password) {
  const pwBytes = Buffer.from(password, "latin1").subarray(0, 32);
  return Buffer.concat([pwBytes, PAD], 32);
}

// Node's OpenSSL 3.x build disables the legacy "rc4" cipher by default (no config
// available in this environment to re-enable it) — a plain hand-rolled RC4 (the
// algorithm is ~15 lines: KSA then PRGA) sidesteps that entirely for this fixture.
function rc4(key, data) {
  const s = Array.from({ length: 256 }, (_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) % 256;
    [s[i], s[j]] = [s[j], s[i]];
  }
  const out = Buffer.alloc(data.length);
  let i = 0;
  j = 0;
  for (let k = 0; k < data.length; k++) {
    i = (i + 1) % 256;
    j = (j + s[i]) % 256;
    [s[i], s[j]] = [s[j], s[i]];
    out[k] = data[k] ^ s[(s[i] + s[j]) % 256];
  }
  return out;
}

/**
 * A from-the-spec implementation of the PDF Standard Security Handler, Revision 2
 * (40-bit RC4) — Algorithms 3.2/3.3/3.4 in ISO 32000-1 §7.6.3. Needed because pdf-lib
 * itself has no encryption support; this fixture exists purely to prove
 * services/ingestion's own PasswordException handling, not to exercise RC4 itself —
 * only /O, /U, /ID, and the /Encrypt dict need to be correct (pdfjs-dist authenticates
 * BEFORE ever touching content streams, so the streams themselves are left unencrypted
 * — irrelevant, since a missing-password open always fails at authentication).
 */
function computeEncryptionMaterial(ownerPassword, userPassword, permissions, idBytes) {
  const paddedOwner = padPassword(ownerPassword);
  const paddedUser = padPassword(userPassword);

  const ownerKey = createHash("md5").update(paddedOwner).digest().subarray(0, 5);
  const O = rc4(ownerKey, paddedUser);

  const pBytes = Buffer.alloc(4);
  pBytes.writeInt32LE(permissions, 0);
  const keyInput = Buffer.concat([paddedUser, O, pBytes, idBytes]);
  const encryptionKey = createHash("md5").update(keyInput).digest().subarray(0, 5);

  const U = rc4(encryptionKey, PAD);

  return { O, U };
}

function pdfLiteralString(buf) {
  // O/U are arbitrary RC4 output bytes, not text — an UNESCAPED raw \r or \n byte
  // inside a PDF literal string gets silently NORMALIZED by readers per spec
  // (7.3.4.2), corrupting exactly that byte of the key material. Octal-escaping every
  // byte (`\ddd`) sidesteps any such ambiguity entirely, at the cost of a larger file.
  let out = "";
  for (const byte of buf) {
    out += `\\${byte.toString(8).padStart(3, "0")}`;
  }
  return out;
}

/**
 * A fully self-built minimal encrypted PDF, rather than patching pdf-lib's own
 * output — patching after the fact shifts every subsequent byte offset, invalidating
 * the xref table pdfjs-dist actually trusts (silently falling back to a permissive
 * full-file object scan that may not honor a trailer added after the original %%EOF).
 * Building the object list first and computing real offsets from it guarantees a
 * structurally valid file by construction instead of by patching.
 */
async function makeEncryptedPdf() {
  const idBytes = randomBytes(16);
  const permissions = -44;
  const { O, U } = computeEncryptionMaterial("owner-password", "user-password-required", permissions, idBytes);
  const idHex = idBytes.toString("hex").toUpperCase();

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    (() => {
      const stream = "BT /F1 14 Tf 50 250 Td (secret content) Tj ET";
      return `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    })(),
    `<< /Filter /Standard /V 1 /R 2 /O (${pdfLiteralString(O)}) /U (${pdfLiteralString(U)}) /P ${permissions} >>`,
  ];

  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(body, "latin1");

  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) {
    body += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Encrypt 6 0 R /ID [<${idHex}> <${idHex}>] >>\n`;
  body += `startxref\n${xrefOffset}\n%%EOF`;

  writeFileSync(out("encrypted.pdf"), Buffer.from(body, "latin1"));
}

async function makeCorruptFiles() {
  writeFileSync(out("corrupt.pdf"), Buffer.from("this is not a real PDF file, just garbage bytes for a corrupt-file test"));
  writeFileSync(out("corrupt.docx"), Buffer.from("this is not a real zip/docx file"));
  writeFileSync(out("corrupt.pptx"), Buffer.from("this is not a real zip/pptx file"));
}

async function makeScannedPdf() {
  const canvas = createCanvas(400, 150);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, 400, 150);
  ctx.fillStyle = "black";
  ctx.font = "32px sans-serif";
  ctx.fillText("HELLO WORLD", 40, 80);
  const pngBuffer = canvas.toBuffer("image/png");

  const doc = await PDFDocument.create();
  const image = await doc.embedPng(pngBuffer);
  const page = doc.addPage([400, 150]);
  page.drawImage(image, { x: 0, y: 0, width: 400, height: 150 });
  writeFileSync(out("scanned-no-text.pdf"), await doc.save());
}

function minimalDocxXml() {
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Introduction</w:t></w:r></w:p>
    <w:p><w:r><w:t>This is the introduction paragraph with enough words to be real test content.</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Details</w:t></w:r></w:p>
    <w:p><w:r><w:t>This is the details section paragraph, following the introduction in this fixture document.</w:t></w:r></w:p>
  </w:body>
</w:document>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  return { document, contentTypes, rootRels };
}

async function makeValidDocx() {
  const { document, contentTypes, rootRels } = minimalDocxXml();
  const zip = new JSZip();
  zip.file("[Content_Types].xml", contentTypes);
  zip.file("_rels/.rels", rootRels);
  zip.file("word/document.xml", document);
  writeFileSync(out("valid-structured.docx"), await zip.generateAsync({ type: "nodebuffer" }));
}

function slideXml(title, body) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp><p:txBody><a:p><a:r><a:t>${title}</a:t></a:r></a:p></p:txBody></p:sp>
      <p:sp><p:txBody><a:p><a:r><a:t>${body}</a:t></a:r></a:p></p:txBody></p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;
}

async function makeValidPptx() {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`,
  );
  zip.file("ppt/slides/slide1.xml", slideXml("Slide One Title", "This is the body content of the first slide in this fixture."));
  zip.file("ppt/slides/slide2.xml", slideXml("Slide Two Title", "This is the body content of the second slide, following the first."));
  writeFileSync(out("valid-structured.pptx"), await zip.generateAsync({ type: "nodebuffer" }));
}

await makeValidTextPdf();
await makeEncryptedPdf();
await makeCorruptFiles();
await makeScannedPdf();
await makeValidDocx();
await makeValidPptx();
console.log("fixtures generated");
