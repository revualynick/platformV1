import { describe, it, expect } from "vitest";
import {
  matchesMarker,
  resolveSubject,
  chunkTranscript,
  mergeSegmentExtractions,
  classifyPipelineError,
  type SubjectCandidate,
  type ExtractedSuggestion,
} from "../check-in-pipeline.js";

const GOAL_A = "11111111-1111-1111-1111-111111111111";
const GOAL_B = "22222222-2222-2222-2222-222222222222";

describe("matchesMarker", () => {
  it("matches substring case-insensitively", () => {
    expect(matchesMarker("[Check-in] Sarah × Jordan — July", "[Check-in]")).toBe(true);
    expect(matchesMarker("[check-IN] monthly", "[Check-in]")).toBe(true);
  });

  it("rejects titles without the marker", () => {
    expect(matchesMarker("Weekly standup", "[Check-in]")).toBe(false);
    expect(matchesMarker("Checking in on the launch", "[Check-in]")).toBe(false);
  });

  it("supports custom markers and rejects empty ones", () => {
    expect(matchesMarker("1:1 Monthly Review — Sarah", "Monthly Review")).toBe(true);
    expect(matchesMarker("anything", "")).toBe(false);
  });
});

describe("resolveSubject", () => {
  const ORGANIZER = "manager-1";
  const candidates: SubjectCandidate[] = [
    { id: ORGANIZER, email: "manager@acme.com", isActive: true },
    { id: "report-1", email: "sarah@acme.com", isActive: true },
    { id: "report-2", email: "marcus@acme.com", isActive: true },
    { id: "outsider", email: "peer@acme.com", isActive: true },
    { id: "gone", email: "former@acme.com", isActive: false },
  ];
  const tree = new Set([ORGANIZER, "report-1", "report-2"]);

  it("resolves a two-person meeting to the non-organizer attendee", () => {
    expect(
      resolveSubject(["manager@acme.com", "sarah@acme.com"], ORGANIZER, candidates, tree),
    ).toBe("report-1");
  });

  it("matches emails case-insensitively", () => {
    expect(
      resolveSubject(["Manager@Acme.com", "SARAH@acme.com"], ORGANIZER, candidates, tree),
    ).toBe("report-1");
  });

  it("skips inactive users", () => {
    expect(
      resolveSubject(["manager@acme.com", "former@acme.com"], ORGANIZER, candidates, tree),
    ).toBeNull();
  });

  it("disambiguates multiple attendees via the reporting tree", () => {
    expect(
      resolveSubject(
        ["manager@acme.com", "sarah@acme.com", "peer@acme.com"],
        ORGANIZER,
        candidates,
        tree,
      ),
    ).toBe("report-1");
  });

  it("returns null when several attendees are in the tree (ambiguous)", () => {
    expect(
      resolveSubject(
        ["manager@acme.com", "sarah@acme.com", "marcus@acme.com"],
        ORGANIZER,
        candidates,
        tree,
      ),
    ).toBeNull();
  });

  it("returns null when only the organizer attends or nobody matches", () => {
    expect(resolveSubject(["manager@acme.com"], ORGANIZER, candidates, tree)).toBeNull();
    expect(
      resolveSubject(["stranger@other.com"], ORGANIZER, candidates, tree),
    ).toBeNull();
  });
});

describe("chunkTranscript", () => {
  it("returns one segment for short transcripts", () => {
    expect(chunkTranscript("hello\nworld", 100)).toEqual(["hello\nworld"]);
  });

  it("splits on line boundaries under the limit", () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i} ${"x".repeat(20)}`);
    const segments = chunkTranscript(lines.join("\n"), 60);
    expect(segments.length).toBeGreaterThan(1);
    for (const s of segments) {
      expect(s.length).toBeLessThanOrEqual(60);
    }
    expect(segments.join("\n")).toBe(lines.join("\n"));
  });
});

describe("mergeSegmentExtractions", () => {
  const entry = (goalId: string, progressPercent: number): ExtractedSuggestion => ({
    goalId,
    progressPercent,
    status: null,
    metricCurrentValue: null,
    note: `at ${progressPercent}`,
    evidenceQuote: "",
  });

  it("last segment wins per goal", () => {
    const merged = mergeSegmentExtractions([
      [entry(GOAL_A, 30), entry(GOAL_B, 10)],
      [entry(GOAL_A, 60)],
    ]);
    const a = merged.find((m) => m.goalId === GOAL_A);
    const b = merged.find((m) => m.goalId === GOAL_B);
    expect(a?.progressPercent).toBe(60);
    expect(b?.progressPercent).toBe(10);
  });

  it("handles empty segments", () => {
    expect(mergeSegmentExtractions([[], []])).toEqual([]);
  });
});

describe("classifyPipelineError", () => {
  it("maps known failure shapes to coarse codes", () => {
    expect(classifyPipelineError(new Error("Rate limit exceeded for quota"))).toBe("google_rate_limited");
    expect(classifyPipelineError(new Error("invalid_grant: token revoked"))).toBe("google_auth_error");
    expect(classifyPipelineError(new Error("Drive export failed: 500"))).toBe("transcript_export_failed");
    expect(classifyPipelineError(new Error("Anthropic model overloaded"))).toBe("llm_error");
    expect(classifyPipelineError(new Error("ECONNRESET"))).toBe("network_error");
  });

  it("never echoes the raw message (PII guard)", () => {
    const err = new Error("something about Sarah said she is unwell");
    const code = classifyPipelineError(err);
    expect(code).toBe("processing_failed");
    expect(code).not.toContain("Sarah");
  });
});
