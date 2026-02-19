import { describe, it, expect } from "vitest";
import { toCSV, escapeField } from "../csv-export.js";
import type { CSVColumn } from "../csv-export.js";

const BOM = "\uFEFF";

describe("escapeField", () => {
  it("returns empty string for null", () => {
    expect(escapeField(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(escapeField(undefined)).toBe("");
  });

  it("returns plain string for simple values", () => {
    expect(escapeField("hello")).toBe("hello");
    expect(escapeField(42)).toBe("42");
    expect(escapeField(true)).toBe("true");
  });

  it("wraps in double-quotes when value contains a comma", () => {
    expect(escapeField("hello, world")).toBe('"hello, world"');
  });

  it("wraps in double-quotes when value contains a double-quote and escapes them", () => {
    expect(escapeField('say "hi"')).toBe('"say ""hi"""');
  });

  it("wraps in double-quotes when value contains a newline", () => {
    expect(escapeField("line1\nline2")).toBe('"line1\nline2"');
  });

  it("wraps in double-quotes when value contains a carriage return", () => {
    expect(escapeField("line1\rline2")).toBe('"line1\rline2"');
  });

  it("serializes objects to JSON", () => {
    const result = escapeField({ a: 1 });
    // JSON.stringify produces {"a":1} which contains a comma and quotes
    expect(result).toContain("a");
    expect(result).toContain("1");
  });

  it("handles empty string", () => {
    expect(escapeField("")).toBe("");
  });

  it("handles combined special characters", () => {
    const result = escapeField('hello, "world"\nnew line');
    // Should be wrapped in quotes with internal quotes doubled
    expect(result.startsWith('"')).toBe(true);
    expect(result.endsWith('"')).toBe(true);
    expect(result).toContain('""world""');
  });
});

describe("toCSV", () => {
  const columns: CSVColumn[] = [
    { key: "name", header: "Name" },
    { key: "score", header: "Score" },
    { key: "comment", header: "Comment" },
  ];

  it("returns just headers (plus BOM and CRLF) for empty array", () => {
    const result = toCSV([], columns);
    expect(result).toBe(BOM + "Name,Score,Comment\r\n");
  });

  it("includes BOM at the start", () => {
    const result = toCSV([], columns);
    expect(result.startsWith(BOM)).toBe(true);
  });

  it("uses CRLF line endings", () => {
    const result = toCSV(
      [{ name: "Alice", score: 90, comment: "Great" }],
      columns,
    );
    const lines = result.replace(BOM, "").split("\r\n");
    expect(lines.length).toBe(3); // header + 1 data row + trailing empty from final CRLF
    expect(lines[0]).toBe("Name,Score,Comment");
    expect(lines[1]).toBe("Alice,90,Great");
    expect(lines[2]).toBe(""); // trailing newline
  });

  it("handles null/undefined values as empty string", () => {
    const result = toCSV(
      [{ name: "Bob", score: null, comment: undefined }],
      columns,
    );
    const dataLine = result.replace(BOM, "").split("\r\n")[1];
    expect(dataLine).toBe("Bob,,");
  });

  it("properly escapes commas and quotes in data", () => {
    const result = toCSV(
      [{ name: 'O"Brien', score: 88, comment: "good, very good" }],
      columns,
    );
    const dataLine = result.replace(BOM, "").split("\r\n")[1];
    expect(dataLine).toContain('"O""Brien"');
    expect(dataLine).toContain('"good, very good"');
  });

  it("handles newlines in cell values", () => {
    const result = toCSV(
      [{ name: "Alice", score: 85, comment: "Line 1\nLine 2" }],
      columns,
    );
    const withoutBom = result.replace(BOM, "");
    // The comment should be quoted
    expect(withoutBom).toContain('"Line 1\nLine 2"');
  });

  it("escapes headers that contain special characters", () => {
    const specialColumns: CSVColumn[] = [
      { key: "name", header: "Full, Name" },
      { key: "score", header: "Score" },
    ];
    const result = toCSV([], specialColumns);
    expect(result).toBe(BOM + '"Full, Name",Score\r\n');
  });

  it("handles multiple rows", () => {
    const rows = [
      { name: "Alice", score: 90, comment: "Good" },
      { name: "Bob", score: 85, comment: "OK" },
      { name: "Charlie", score: 70, comment: "Needs improvement" },
    ];
    const result = toCSV(rows, columns);
    const lines = result.replace(BOM, "").split("\r\n");
    expect(lines.length).toBe(5); // header + 3 data + trailing
    expect(lines[1]).toBe("Alice,90,Good");
    expect(lines[2]).toBe("Bob,85,OK");
    expect(lines[3]).toBe("Charlie,70,Needs improvement");
  });
});
