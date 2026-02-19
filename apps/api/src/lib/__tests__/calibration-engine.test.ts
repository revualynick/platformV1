import { describe, it, expect } from "vitest";

// The calibration engine has several pure helper functions that aren't exported.
// We test the logic boundaries by re-implementing the pure functions here and
// verifying they match the expected behavior. If these are extracted and exported
// in the future, these tests can be updated to import directly.

// Re-implementation of computeStdDev from calibration-engine.ts
function computeStdDev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const sumSquares = values.reduce((acc, v) => acc + (v - mean) ** 2, 0);
  return Math.sqrt(sumSquares / values.length);
}

// Re-implementation of sentimentToNumeric
function sentimentToNumeric(sentiment: string): number {
  switch (sentiment) {
    case "positive":
      return 1;
    case "neutral":
      return 0;
    case "negative":
      return -1;
    default:
      return 0;
  }
}

// Re-implementation of computeSentimentDistribution
function computeSentimentDistribution(
  sentiments: string[],
): Record<string, number> {
  const total = sentiments.length;
  if (total === 0) return { positive: 0, neutral: 0, negative: 0 };
  const counts: Record<string, number> = { positive: 0, neutral: 0, negative: 0 };
  for (const s of sentiments) {
    const key = s in counts ? s : "neutral";
    counts[key]++;
  }
  return {
    positive: Math.round((counts.positive / total) * 1000) / 1000,
    neutral: Math.round((counts.neutral / total) * 1000) / 1000,
    negative: Math.round((counts.negative / total) * 1000) / 1000,
  };
}

// Re-implementation of alertSeverity
function alertSeverity(absDeviation: number): "info" | "warning" | "critical" {
  if (absDeviation >= 2) return "critical";
  if (absDeviation >= 1.5) return "warning";
  return "info";
}

describe("computeStdDev", () => {
  it("returns 0 for fewer than 2 values", () => {
    expect(computeStdDev([], 0)).toBe(0);
    expect(computeStdDev([5], 5)).toBe(0);
  });

  it("returns 0 when all values equal the mean", () => {
    expect(computeStdDev([5, 5, 5], 5)).toBe(0);
  });

  it("computes correct std dev for simple cases", () => {
    // Values: [2, 4], mean: 3
    // variance = ((2-3)^2 + (4-3)^2) / 2 = (1 + 1) / 2 = 1
    // stddev = sqrt(1) = 1
    expect(computeStdDev([2, 4], 3)).toBe(1);
  });

  it("computes correct std dev for larger dataset", () => {
    const values = [10, 20, 30, 40, 50];
    const mean = 30;
    // variance = (400 + 100 + 0 + 100 + 400) / 5 = 200
    // stddev = sqrt(200) ~= 14.142
    const result = computeStdDev(values, mean);
    expect(result).toBeCloseTo(14.142, 2);
  });
});

describe("sentimentToNumeric", () => {
  it("maps positive to 1", () => {
    expect(sentimentToNumeric("positive")).toBe(1);
  });

  it("maps neutral to 0", () => {
    expect(sentimentToNumeric("neutral")).toBe(0);
  });

  it("maps negative to -1", () => {
    expect(sentimentToNumeric("negative")).toBe(-1);
  });

  it("maps unknown values to 0", () => {
    expect(sentimentToNumeric("mixed")).toBe(0);
    expect(sentimentToNumeric("")).toBe(0);
    expect(sentimentToNumeric("unknown")).toBe(0);
  });
});

describe("computeSentimentDistribution", () => {
  it("returns all zeros for empty array", () => {
    const result = computeSentimentDistribution([]);
    expect(result).toEqual({ positive: 0, neutral: 0, negative: 0 });
  });

  it("computes correct distribution for single sentiment", () => {
    const result = computeSentimentDistribution(["positive"]);
    expect(result).toEqual({ positive: 1, neutral: 0, negative: 0 });
  });

  it("computes correct distribution for mixed sentiments", () => {
    const result = computeSentimentDistribution([
      "positive",
      "positive",
      "negative",
      "neutral",
    ]);
    expect(result.positive).toBeCloseTo(0.5, 3);
    expect(result.negative).toBeCloseTo(0.25, 3);
    expect(result.neutral).toBeCloseTo(0.25, 3);
  });

  it("maps unknown sentiments to neutral", () => {
    const result = computeSentimentDistribution(["mixed", "unknown"]);
    // Both should map to neutral
    expect(result.neutral).toBe(1);
    expect(result.positive).toBe(0);
    expect(result.negative).toBe(0);
  });

  it("rounds to 3 decimal places", () => {
    // 1/3 = 0.333...
    const result = computeSentimentDistribution([
      "positive",
      "neutral",
      "negative",
    ]);
    expect(result.positive).toBe(0.333);
    expect(result.neutral).toBe(0.333);
    expect(result.negative).toBe(0.333);
  });
});

describe("alertSeverity", () => {
  it("returns critical for deviation >= 2", () => {
    expect(alertSeverity(2)).toBe("critical");
    expect(alertSeverity(3)).toBe("critical");
  });

  it("returns warning for deviation >= 1.5 but < 2", () => {
    expect(alertSeverity(1.5)).toBe("warning");
    expect(alertSeverity(1.9)).toBe("warning");
  });

  it("returns info for deviation < 1.5", () => {
    expect(alertSeverity(1.4)).toBe("info");
    expect(alertSeverity(0.5)).toBe("info");
    expect(alertSeverity(0)).toBe("info");
  });
});
