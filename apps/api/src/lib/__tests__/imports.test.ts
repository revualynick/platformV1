import { describe, it, expect } from "vitest";
import type { LLMCompletionRequest } from "@revualy/ai-core";
import { parseCsv, fromCells, readTabular, decodeText } from "../imports/tabular.js";
import {
  applyMapping,
  gateMapping,
  guessMapping,
  inferDateFormat,
  parseDate,
  proposeMapping,
  validateMapping,
  MAX_SAMPLE_ROWS,
  type ColumnMapping,
  type PersonRow,
} from "../imports/mapping.js";
import { findManagerCycles } from "../imports/graph.js";
import { extractOrgChart, matchChartPeople, parseOrgChartOutput } from "../imports/org-chart.js";
import { planOrgChart, planPeople, type UserSnap } from "../imports/plan.js";
import { buildXlsx } from "./xlsx-fixture.js";

const quiet = { warn: () => {} };
const reply = (content: string, stopReason = "end_turn") => ({
  content,
  usage: { inputTokens: 0, outputTokens: 0 },
  model: "fake",
  latencyMs: 0,
  stopReason,
});

describe("CSV parsing", () => {
  it("handles quotes, doubled quotes, CRLF and newlines inside quotes", () => {
    const rows = parseCsv('name,note\r\n"Smith, Jo","said ""hi""\nthen left"\r\nAmy,ok\r\n');
    expect(rows).toEqual([
      ["name", "note"],
      ["Smith, Jo", 'said "hi"\nthen left'],
      ["Amy", "ok"],
    ]);
  });

  it("detects semicolon and tab delimiters", () => {
    expect(parseCsv("a;b\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCsv("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("strips a UTF-8 BOM and falls back to Windows-1252", () => {
    expect(decodeText(Buffer.from("﻿name", "utf8")).text).toBe("name");
    const latin = decodeText(Buffer.from([0x4a, 0xf6, 0x72, 0x67])); // "Jörg" in 1252
    expect(latin.text).toBe("Jörg");
    expect(latin.warnings).toHaveLength(1);
  });

  it("names blank and repeated headers, drops empty rows, keeps sheet row numbers", () => {
    const src = fromCells([[""], ["Name", "", "Name"], ["Amy", "x", "A"], ["", "", ""], ["Bo", "", "B"]]);
    expect(src.headers).toEqual(["Name", "Column 2", "Name (2)"]);
    expect(src.rows.map((r) => r.rowNumber)).toEqual([3, 5]);
    expect(src.rows[1].cells).toEqual(["Bo", "", "B"]);
  });
});

describe("XLSX parsing", () => {
  it("reads strings, numbers and date cells from a real workbook", async () => {
    const buf = buildXlsx([
      ["Name", "Email", "Start date", "Progress"],
      ["Amy Pond", "amy@example.com", { date: 46023 }, 0.5],
    ]);
    const src = await readTabular(buf);
    expect(src.headers).toEqual(["Name", "Email", "Start date", "Progress"]);
    expect(src.rows).toEqual([{ rowNumber: 2, cells: ["Amy Pond", "amy@example.com", "2026-01-01", "0.5"] }]);
  });

  it("treats non-zip bytes as CSV", async () => {
    const src = await readTabular(Buffer.from("email,name\nA@X.com,Al\n"));
    expect(src.rows[0].cells).toEqual(["A@X.com", "Al"]);
  });
});

describe("mapping validation and application", () => {
  const headers = ["Full name", "Work email", "Manager", "Dept", "Started"];
  const good: ColumnMapping = {
    columns: { name: "Full name", email: "Work email", managerEmail: "Manager", team: "Dept", startDate: "Started" },
    dateFormat: "dmy",
  };

  it("accepts a complete mapping", () => {
    expect(validateMapping("people", headers, good)).toEqual([]);
  });

  it("rejects unknown fields, missing columns, a column used twice and missing required fields", () => {
    const errors = validateMapping("people", headers, {
      columns: { nickname: "Full name", team: "Dept", title: "Dept", startDate: "Nope" },
      dateFormat: "iso",
    });
    expect(errors.join("\n")).toMatch(/Unknown field "nickname"/);
    expect(errors.join("\n")).toMatch(/column "Nope" is not in the file/);
    expect(errors.join("\n")).toMatch(/mapped to both team and title/);
    expect(errors.join("\n")).toMatch(/Required field not mapped: email/);
    expect(errors.join("\n")).toMatch(/Required field not mapped: name/);
  });

  it("applies a mapping deterministically, normalising emails and dates", () => {
    const [row] = applyMapping("people", headers, good, [["Amy Pond", " AMY@Example.com ", "rory@example.com", "Design", "31/01/2026"]]);
    expect(row).toEqual({
      ok: true,
      value: { email: "amy@example.com", name: "Amy Pond", managerEmail: "rory@example.com", team: "Design", startDate: "2026-01-31" },
    });
  });

  it("joins split names and reports field errors without echoing values", () => {
    const [ok, bad] = applyMapping(
      "people",
      ["First", "Last", "Email", "Start"],
      { columns: { firstName: "First", lastName: "Last", email: "Email", startDate: "Start" }, dateFormat: "dmy" },
      [["Amy", "Pond", "amy@x.com", ""], ["", "", "secret-not-an-email", "13/13/2026"]],
    );
    expect(ok.ok && (ok.value as PersonRow).name).toBe("Amy Pond");
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors).toEqual([
        "email: not a valid email",
        "name: missing",
        "startDate: not a date in the chosen format (dmy)",
      ]);
      expect(bad.errors.join(" ")).not.toContain("secret");
    }
  });

  it("reads a progress column of fractions as percentages, and plain numbers as-is", () => {
    const h = ["Owner", "Goal", "Progress"];
    const m: ColumnMapping = { columns: { ownerEmail: "Owner", title: "Goal", progress: "Progress" }, dateFormat: "iso" };
    const frac = applyMapping("goals", h, m, [["a@x.com", "G1", "0.5"], ["a@x.com", "G2", "1"]]);
    expect(frac.map((r) => r.ok && (r.value as { progress?: number }).progress)).toEqual([50, 100]);
    const pct = applyMapping("goals", h, m, [["a@x.com", "G1", "45%"], ["a@x.com", "G2", "80"]]);
    expect(pct.map((r) => r.ok && (r.value as { progress?: number }).progress)).toEqual([45, 80]);
  });

  it("parses dates strictly", () => {
    expect(parseDate("2026-02-30", "iso")).toBeNull();
    expect(parseDate("02/03/2026", "mdy")).toBe("2026-02-03");
    expect(parseDate("02/03/2026", "iso")).toBeNull();
    expect(parseDate("2026-03-01T09:00:00Z", "dmy")).toBe("2026-03-01");
  });

  it("infers dd/mm vs mm/dd from the values, day-first when undecided", () => {
    expect(inferDateFormat(["13/01/2026"])).toBe("dmy");
    expect(inferDateFormat(["01/13/2026"])).toBe("mdy");
    expect(inferDateFormat(["01/02/2026"])).toBe("dmy");
    expect(inferDateFormat(["2026-01-02"])).toBe("iso");
  });

  it("gate rejects a mapping that fails most sample rows", () => {
    const wrong: ColumnMapping = { columns: { name: "Work email", email: "Full name" }, dateFormat: "iso" };
    const samples = [["Amy", "amy@x.com", "", "", ""], ["Bo", "bo@x.com", "", "", ""]];
    expect(gateMapping("people", headers, wrong, samples).join()).toMatch(/fails 2 of 2 sample rows/);
    expect(gateMapping("people", headers, good, samples)).toEqual([]);
  });

  it("guesses from header synonyms without confusing email and manager email", () => {
    const g = guessMapping("people", ["Employee Email", "Manager Email", "First Name", "Surname", "Department"]);
    expect(g.columns).toEqual({
      email: "Employee Email",
      managerEmail: "Manager Email",
      firstName: "First Name",
      lastName: "Surname",
      team: "Department",
    });
  });
});

describe("proposeMapping", () => {
  const headers = ["Who", "Mail"];
  const rows = Array.from({ length: 12 }, (_, i) => [`Person ${i}`, `p${i}@x.com`]);

  it("uses the model's proposal, sending the header and at most five sample rows", async () => {
    const requests: LLMCompletionRequest[] = [];
    const llm = {
      complete: async (req: LLMCompletionRequest) => {
        requests.push(req);
        return reply(JSON.stringify({ assignments: [{ field: "name", column: "Who" }, { field: "email", column: "Mail" }], dateFormat: "iso" }));
      },
    };
    const p = await proposeMapping(llm, "people", headers, rows, { logger: quiet });
    expect(p.source).toBe("model");
    expect(p.mapping?.columns).toEqual({ name: "Who", email: "Mail" });
    expect(requests[0].tier).toBe("standard");
    expect(requests[0].jsonSchema).toBeDefined();
    const sent = JSON.parse(requests[0].messages[1].content);
    expect(sent.sampleRows).toHaveLength(MAX_SAMPLE_ROWS);
    expect(JSON.stringify(requests)).not.toContain("p5@x.com");
  });

  it("falls back to header synonyms when the model's proposal fails the gate", async () => {
    const llm = {
      complete: async () =>
        reply(JSON.stringify({ assignments: [{ field: "email", column: "Name" }, { field: "name", column: "Email" }], dateFormat: "iso" })),
    };
    const p = await proposeMapping(llm, "people", ["Name", "Email"], [["Amy", "amy@x.com"]], { logger: quiet });
    expect(p.source).toBe("heuristic");
    expect(p.mapping?.columns).toEqual({ name: "Name", email: "Email" });
    expect(p.notes[0]).toMatch(/Model proposal rejected/);
  });

  it("returns no mapping when neither the model nor the headers give one", async () => {
    const p = await proposeMapping(null, "people", headers, rows, { logger: quiet });
    expect(p.mapping).toBeNull();
  });
});

describe("findManagerCycles", () => {
  it("finds none in a tree", () => {
    expect(findManagerCycles(new Map([["a", "b"], ["b", "c"], ["c", null]]))).toEqual([]);
  });

  it("finds a two-person cycle once, and a self-cycle", () => {
    const cycles = findManagerCycles(new Map<string, string | null>([["b", "a"], ["a", "b"], ["c", "a"], ["d", "d"]]));
    expect(cycles).toEqual([["a", "b"], ["d"]]);
  });

  it("finds a longer cycle reached from a tail", () => {
    expect(findManagerCycles(new Map([["t", "x"], ["x", "y"], ["y", "z"], ["z", "x"]]))).toEqual([["x", "y", "z"]]);
  });
});

describe("org chart output parser and gate", () => {
  const out = {
    people: [
      { id: "p1", name: "Clara Oswald", email: "", title: "CEO" },
      { id: "p2", name: " Danny  Pink ", email: "DANNY@x.com", title: "" },
      { id: "p3", name: "Bill Potts", email: "not-an-email", title: "" },
      { id: "p4", name: "", email: "", title: "" },
    ],
    lines: [
      { report: "p2", manager: "p1", confidence: "high" },
      { report: "p3", manager: "p1", confidence: "medium" },
      { report: "p3", manager: "p2", confidence: "low" },
      { report: "p1", manager: "p1", confidence: "high" },
      { report: "p9", manager: "p1", confidence: "high" },
    ],
  };

  it("keeps valid people and lines, drops the rest with warnings", () => {
    const chart = parseOrgChartOutput(JSON.stringify(out));
    expect(chart.people.map((p) => p.name)).toEqual(["Clara Oswald", "Danny Pink", "Bill Potts"]);
    const danny = chart.people[1];
    expect(danny).toMatchObject({ email: "danny@x.com", managerRef: "p1", confidence: "high" });
    // Two managers for Bill: the more confident line is kept, downgraded to low.
    expect(chart.people[2]).toMatchObject({ managerRef: "p1", confidence: "low" });
    expect(chart.people[2].email).toBeUndefined();
    expect(chart.people[0].managerRef).toBeUndefined();
    expect(chart.warnings.join("\n")).toMatch(/no readable name/);
    expect(chart.warnings.join("\n")).toMatch(/to themselves/);
    expect(chart.warnings.join("\n")).toMatch(/not in the people list/);
    expect(chart.warnings.join("\n")).toMatch(/more than one manager/);
  });

  it("throws on output of the wrong shape", () => {
    expect(() => parseOrgChartOutput('{"people": "lots"}')).toThrow();
    expect(() => parseOrgChartOutput("not json")).toThrow();
  });

  it("sends the chart as an attachment and refuses a truncated answer", async () => {
    const requests: LLMCompletionRequest[] = [];
    const llm = { complete: async (req: LLMCompletionRequest) => (requests.push(req), reply(JSON.stringify(out))) };
    const chart = await extractOrgChart(llm, { type: "image", mediaType: "image/png", data: "iVBOR" }, { logger: quiet });
    expect(chart.people).toHaveLength(3);
    expect(requests[0].messages[1].attachments).toEqual([{ type: "image", mediaType: "image/png", data: "iVBOR" }]);

    const truncated = { complete: async () => reply("{", "max_tokens") };
    await expect(extractOrgChart(truncated, { type: "image", mediaType: "image/png", data: "x" }, { logger: quiet })).rejects.toThrow(/too large/);
  });

  it("matches by email, then exact name; shared names match nobody", () => {
    const users = [
      { id: "u1", email: "danny@x.com", name: "D. Pink", isActive: true },
      { id: "u2", email: "clara@x.com", name: "clara oswald", isActive: true },
      { id: "u3", email: "b1@x.com", name: "Bill Potts", isActive: true },
      { id: "u4", email: "b2@x.com", name: "Bill Potts", isActive: true },
    ];
    const chart = parseOrgChartOutput(JSON.stringify(out));
    const m = matchChartPeople(chart.people, users);
    expect(m.get("p1")).toEqual({ userId: "u2", by: "name" });
    expect(m.get("p2")).toEqual({ userId: "u1", by: "email" });
    expect(m.get("p3")).toEqual({ userId: null, reason: "name matches more than one user" });
  });
});

const user = (id: string, email: string, managerId: string | null = null, extra: Partial<UserSnap> = {}): UserSnap => ({
  id,
  email,
  name: id,
  teamId: null,
  managerId,
  jobTitle: null,
  startDate: null,
  role: "employee",
  isActive: true,
  ...extra,
});

describe("planPeople", () => {
  const ok = (rowIndex: number, value: PersonRow) => ({ rowIndex, result: { ok: true as const, value } });

  it("creates, updates, skips duplicates and lists unmatched managers", () => {
    const existing = [user("u1", "boss@x.com"), user("u2", "old@x.com", null, { name: "Old Name" })];
    const plan = planPeople(
      [
        ok(2, { email: "new@x.com", name: "New", managerEmail: "boss@x.com", team: "Design" }),
        ok(3, { email: "old@x.com", name: "Old Name", title: "Engineer" }),
        ok(4, { email: "new@x.com", name: "New Again" }),
        ok(5, { email: "lost@x.com", name: "Lost", managerEmail: "ghost@x.com" }),
        { rowIndex: 6, result: { ok: false, errors: ["email: missing"] } },
      ],
      existing,
      [],
    );
    expect(plan.report.counts).toMatchObject({ total: 5, created: 2, updated: 1, skipped: 1, invalid: 1 });
    expect(plan.report.duplicates).toEqual([{ key: "new@x.com", rows: [2, 4] }]);
    expect(plan.report.unmatchedPeople).toEqual([{ email: "ghost@x.com", rows: [5], reason: "manager is not in the file or in Revualy" }]);
    expect(plan.report.teamsToCreate).toEqual(["Design"]);
    expect(plan.managers).toEqual([{ email: "new@x.com", managerEmail: "boss@x.com" }]);
    expect(plan.report.blocking).toEqual([]);
  });

  it("blocks on a manager cycle, including one through existing data", () => {
    const existing = [user("u1", "a@x.com", "u2"), user("u2", "b@x.com")];
    const plan = planPeople([ok(2, { email: "b@x.com", name: "u2", managerEmail: "a@x.com" })], existing, []);
    expect(plan.report.managerCycles).toEqual([["a@x.com", "b@x.com"]]);
    expect(plan.report.blocking[0]).toMatch(/a@x.com -> b@x.com -> a@x.com/);
  });

  it("plans nothing on a re-import of the same data, with a stable hash", () => {
    const existing = [user("u1", "boss@x.com"), user("u2", "amy@x.com", "u1", { name: "Amy" })];
    const rows = [ok(2, { email: "amy@x.com", name: "Amy", managerEmail: "boss@x.com" })];
    const a = planPeople(rows, existing, []);
    const b = planPeople(rows, existing, []);
    expect(a.report.counts).toMatchObject({ unchanged: 1, created: 0, updated: 0, matched: 1 });
    expect(a.report.planHash).toBe(b.report.planHash);
  });
});

describe("planOrgChart", () => {
  const users = [user("u1", "ceo@x.com", null, { name: "Clara" }), user("u2", "cto@x.com", null, { name: "Danny" }), user("u3", "dev@x.com", null, { name: "Bill" })];
  const people = [
    { rowIndex: 1, ref: "p1", name: "Clara" },
    { rowIndex: 2, ref: "p2", name: "Danny", managerRef: "p1", confidence: "high" as const },
    { rowIndex: 3, ref: "p3", name: "Bill", managerRef: "p2", confidence: "low" as const },
    { rowIndex: 4, ref: "p4", name: "Nardole", managerRef: "p1", confidence: "high" as const },
  ];

  it("applies confident lines, holds low-confidence ones and lists unmatched people", () => {
    const plan = planOrgChart(people, users, { acceptLowConfidence: false });
    expect(plan.managers).toEqual([{ rowIndex: 2, userId: "u2", managerId: "u1" }]);
    expect(plan.report.lowConfidenceLines).toEqual([{ report: "Bill", manager: "Danny", applied: false }]);
    expect(plan.report.unmatchedPeople).toEqual([{ name: "Nardole", rows: [4], reason: "no active user with this email or name" }]);
    expect(plan.report.counts).toMatchObject({ total: 4, matched: 3, created: 0, updated: 1, skipped: 1 });
  });

  it("applies low-confidence lines once accepted", () => {
    const plan = planOrgChart(people, users, { acceptLowConfidence: true });
    expect(plan.managers.map((m) => m.userId)).toEqual(["u2", "u3"]);
  });
});
