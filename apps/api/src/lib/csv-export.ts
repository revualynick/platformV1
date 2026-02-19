/**
 * CSV generation utility — RFC 4180 compliant.
 */

const BOM = "\uFEFF"; // UTF-8 BOM for Excel compatibility

/**
 * Escape a single CSV field per RFC 4180:
 * - If value contains a double-quote, comma, or newline, wrap in double-quotes
 * - Double-quotes within a field are escaped by doubling them
 */
export function escapeField(value: unknown): string {
  if (value === null || value === undefined) return "";

  const str = typeof value === "object" ? JSON.stringify(value) : String(value);

  if (str.includes('"') || str.includes(",") || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

export interface CSVColumn {
  key: string;
  header: string;
}

/**
 * Convert an array of objects to an RFC 4180 CSV string.
 *
 * - Includes BOM for Excel compatibility
 * - Properly escapes double-quotes, commas, and newlines
 * - Handles null/undefined as empty string
 * - CRLF line endings per spec
 */
export function toCSV(
  rows: Record<string, unknown>[],
  columns: CSVColumn[],
): string {
  const headerLine = columns.map((c) => escapeField(c.header)).join(",");

  const dataLines = rows.map((row) =>
    columns.map((c) => escapeField(row[c.key])).join(","),
  );

  return BOM + [headerLine, ...dataLines].join("\r\n") + "\r\n";
}
