import { readSheet } from "read-excel-file/node";

/**
 * Every structured source (CSV, XLSX, and Google Sheets once built) is read
 * into this one shape, so mapping, dry run and commit never care where the
 * rows came from. A Google Sheets reader would call
 * spreadsheets.values.get and pass the values to `fromCells`.
 */
export interface TabularSource {
  headers: string[];
  /** Data rows, each padded to headers.length. */
  rows: Array<{ rowNumber: number; cells: string[] }>;
  warnings: string[];
}

export const MAX_IMPORT_ROWS = 10_000;

export type TabularFormat = "csv" | "xlsx";

/** Detect the format from the bytes, not the claimed type (an .xlsx is a zip). */
export function sniffTabularFormat(buf: Buffer): TabularFormat {
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04 ? "xlsx" : "csv";
}

export async function readTabular(buf: Buffer): Promise<TabularSource> {
  if (sniffTabularFormat(buf) === "xlsx") {
    // Pass the Buffer itself: a string argument is read as a file path.
    const data = await readSheet(buf);
    return fromCells(data.map((row) => row.map(cellToString)));
  }
  const { text, warnings } = decodeText(buf);
  const source = fromCells(parseCsv(text));
  return { ...source, warnings: [...warnings, ...source.warnings] };
}

/**
 * Header row is the first non-empty row. Blank headers become "Column N"
 * and repeats get a suffix, so every column has a unique name the mapping
 * can point at. Wholly empty rows are dropped; row numbers are 1-based
 * positions in the sheet, as a spreadsheet would show them.
 */
export function fromCells(cells: string[][]): TabularSource {
  const warnings: string[] = [];
  const isEmpty = (row: string[]) => row.every((c) => c.trim() === "");
  const headerAt = cells.findIndex((row) => !isEmpty(row));
  if (headerAt === -1) return { headers: [], rows: [], warnings: ["The file has no rows"] };

  const seen = new Map<string, number>();
  const rawHeaders = cells[headerAt].map((h) => h.trim());
  // A data row may be wider than the header row: keep the extra cells addressable.
  const width = Math.max(rawHeaders.length, ...cells.slice(headerAt + 1).map((r) => r.length));
  const headers: string[] = [];
  for (let i = 0; i < width; i++) {
    let name = (rawHeaders[i] ?? "").slice(0, 200) || `Column ${i + 1}`;
    const count = seen.get(name.toLowerCase()) ?? 0;
    seen.set(name.toLowerCase(), count + 1);
    if (count > 0) name = `${name} (${count + 1})`;
    headers.push(name);
  }
  // Trailing unnamed columns that are empty everywhere are noise from Excel.
  while (headers.length > rawHeaders.length && cells.slice(headerAt + 1).every((r) => !(r[headers.length - 1] ?? "").trim())) {
    headers.pop();
  }

  const rows: TabularSource["rows"] = [];
  for (let i = headerAt + 1; i < cells.length; i++) {
    if (isEmpty(cells[i])) continue;
    const padded = headers.map((_, c) => (cells[i][c] ?? "").trim());
    rows.push({ rowNumber: i + 1, cells: padded });
  }
  return { headers, rows, warnings };
}

/** UTF-8 (BOM stripped), falling back to Windows-1252 for older Excel exports. */
export function decodeText(buf: Buffer): { text: string; warnings: string[] } {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return { text: text.replace(/^﻿/, ""), warnings: [] };
  } catch {
    return {
      text: new TextDecoder("windows-1252").decode(buf),
      warnings: ["The file is not UTF-8; read it as Windows-1252. Check accented names in the dry run."],
    };
  }
}

/**
 * RFC 4180 CSV: quoted fields, doubled quotes, CRLF or LF, newlines inside
 * quotes. The delimiter (comma, semicolon or tab) is whichever appears most
 * in the first line outside quotes; European Excel writes semicolons.
 */
export function parseCsv(text: string): string[][] {
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === "") {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function detectDelimiter(text: string): string {
  const counts = new Map<string, number>([[",", 0], [";", 0], ["\t", 0]]);
  let inQuotes = false;
  for (const ch of text) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === "\n" || ch === "\r")) break;
    else if (!inQuotes && counts.has(ch)) counts.set(ch, counts.get(ch)! + 1);
  }
  let best = ",";
  for (const [d, n] of counts) if (n > counts.get(best)!) best = d;
  return best;
}

/** XLSX cell to text. Dates become YYYY-MM-DD (read-excel-file gives UTC dates). */
export function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  return String(value);
}
