import { inflateRawSync, inflateSync } from "node:zlib";

/**
 * Plain text from an uploaded 1:1 notes or transcript file, in memory.
 * Nothing here writes to disk or the database: the caller discards the
 * buffer once the text has been extracted and processed.
 *
 * Supported: .txt, .md, .vtt (Meet/Zoom captions), .docx (Word, or a
 * Google Doc downloaded as Word), .html (Google Doc "Web page" export) and
 * .pdf (best effort: simple text PDFs only, see extractPdfText).
 */

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/** Guard against zip bombs when inflating .docx and PDF streams. */
const MAX_INFLATED_BYTES = 20 * 1024 * 1024;

export type DocumentReadErrorCode = "unsupported_type" | "unreadable" | "too_large" | "empty";

export class DocumentReadError extends Error {
  constructor(public readonly code: DocumentReadErrorCode) {
    super(`Document could not be read: ${code}`);
  }
}

export const SUPPORTED_EXTENSIONS = ["txt", "md", "vtt", "docx", "html", "htm", "pdf"] as const;

export function fileExtension(fileName: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(fileName.trim());
  return match ? match[1].toLowerCase() : "";
}

export function extractDocumentText(fileName: string, data: Buffer): string {
  if (data.length > MAX_UPLOAD_BYTES) throw new DocumentReadError("too_large");
  const ext = fileExtension(fileName);
  let text: string;
  switch (ext) {
    case "txt":
    case "md":
      text = data.toString("utf8");
      break;
    case "vtt":
      text = vttToText(data.toString("utf8"));
      break;
    case "docx":
      text = docxToText(data);
      break;
    case "html":
    case "htm":
      text = htmlToText(data.toString("utf8"));
      break;
    case "pdf":
      text = extractPdfText(data);
      break;
    default:
      throw new DocumentReadError("unsupported_type");
  }
  const cleaned = text.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (cleaned.length === 0) throw new DocumentReadError("empty");
  return cleaned;
}

// ── WebVTT ──────────────────────────────────────────────

/** Captions to "Speaker: words" lines: drops the header, cue ids, timings and NOTE blocks. */
export function vttToText(vtt: string): string {
  const lines: string[] = [];
  const blocks = vtt.replace(/\r\n?/g, "\n").split(/\n\n+/);
  for (const block of blocks) {
    const rows = block.split("\n");
    if (/^(WEBVTT|NOTE|STYLE|REGION)\b/.test(rows[0] ?? "")) continue;
    const timing = rows.findIndex((r) => r.includes("-->"));
    const cue = timing >= 0 ? rows.slice(timing + 1) : rows;
    for (const row of cue) {
      const voice = /^<v(?:\.[^\s>]+)?\s+([^>]+)>(.*)$/.exec(row.trim());
      const line = voice ? `${voice[1].trim()}: ${voice[2]}` : row;
      const plain = line.replace(/<[^>]+>/g, "").trim();
      if (plain) lines.push(plain);
    }
  }
  return lines.join("\n");
}

// ── HTML ────────────────────────────────────────────────

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  );
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

// ── DOCX (a zip holding word/document.xml) ──────────────

export function docxToText(data: Buffer): string {
  const xml = readZipEntry(data, "word/document.xml");
  if (xml === null) throw new DocumentReadError("unreadable");
  return decodeEntities(
    xml
      .toString("utf8")
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<w:br[^>]*\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, ""),
  );
}

/** Minimal zip reader: finds one entry through the central directory. */
export function readZipEntry(zip: Buffer, name: string): Buffer | null {
  const EOCD = 0x06054b50;
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65_535); i--) {
    if (zip.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const entries = zip.readUInt16LE(eocd + 10);
  let offset = zip.readUInt32LE(eocd + 16);
  for (let n = 0; n < entries; n++) {
    if (offset + 46 > zip.length || zip.readUInt32LE(offset) !== 0x02014b50) return null;
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const entryName = zip.toString("utf8", offset + 46, offset + 46 + nameLength);
    if (entryName === name) {
      if (localOffset + 30 > zip.length || zip.readUInt32LE(localOffset) !== 0x04034b50) return null;
      const start =
        localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
      const body = zip.subarray(start, start + compressedSize);
      try {
        if (method === 0) return Buffer.from(body);
        if (method === 8) return inflateRawSync(body, { maxOutputLength: MAX_INFLATED_BYTES });
      } catch {
        return null;
      }
      return null;
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}

// ── PDF (best effort) ───────────────────────────────────

/**
 * Text from simple PDFs: literal strings shown with Tj/TJ in plain or
 * Flate-compressed content streams. PDFs whose fonts need a ToUnicode map
 * (common for Google Docs exports) come out as noise and are rejected as
 * unreadable, so the person is asked for .docx or .txt instead of the
 * model being fed garbage. A real PDF parser is a dependency decision.
 */
export function extractPdfText(data: Buffer): string {
  if (data.subarray(0, 5).toString("latin1") !== "%PDF-") throw new DocumentReadError("unreadable");
  const raw = data.toString("latin1");
  const out: string[] = [];
  const streamRe = /<<([\s\S]*?)>>\s*stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = streamRe.exec(raw))) {
    const start = match.index + match[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;
    const body = data.subarray(start, end);
    let content: string | null = null;
    if (/\/FlateDecode/.test(match[1])) {
      try {
        content = inflateSync(body, { maxOutputLength: MAX_INFLATED_BYTES }).toString("latin1");
      } catch {
        content = null;
      }
    } else if (!/\/Filter/.test(match[1])) {
      content = body.toString("latin1");
    }
    if (content && /\bBT\b/.test(content)) out.push(pdfContentToText(content));
    streamRe.lastIndex = end;
  }
  const text = out.join("\n").trim();
  if (!looksLikeText(text)) throw new DocumentReadError("unreadable");
  return text;
}

function pdfContentToText(content: string): string {
  let text = "";
  const tokenRe = /\((?:\\.|[^\\)])*\)|\[|\]|T\*|Tj|TJ|Td|TD|ET|'|"/g;
  let token: RegExpExecArray | null;
  let pending = "";
  while ((token = tokenRe.exec(content))) {
    const t = token[0];
    if (t.startsWith("(")) pending += unescapePdfString(t.slice(1, -1));
    else if (t === "Tj" || t === "TJ" || t === "'" || t === '"') {
      text += pending;
      pending = "";
    } else if (t === "T*" || t === "Td" || t === "TD" || t === "ET") {
      if (!text.endsWith("\n")) text += "\n";
    }
  }
  return text;
}

function unescapePdfString(s: string): string {
  return s.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, c: string) => {
    const map: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "", f: "", "(": "(", ")": ")", "\\": "\\" };
    return map[c] ?? String.fromCharCode(parseInt(c, 8));
  });
}

/** Mostly letters and spaces, and long enough to be worth sending to the model. */
function looksLikeText(text: string): boolean {
  if (text.length < 20) return false;
  const letters = (text.match(/[\p{L}\s.,'!?-]/gu) ?? []).length;
  return letters / text.length > 0.8;
}
