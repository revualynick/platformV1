/**
 * Calibration statistics for decide(): is a stated confidence of 0.8 right
 * about 8 times in 10? Pure functions over (confidence, correct) samples,
 * used by the evaluation (apps/api/eval/decide-calibration.ts) and tests.
 */

export interface CalibrationSample {
  confidence: number;
  correct: boolean;
}

export interface ReliabilityBand {
  /** Inclusive lower edge. */
  lo: number;
  /** Exclusive upper edge (the last band includes 1). */
  hi: number;
  n: number;
  meanConfidence: number | null;
  accuracy: number | null;
  /** meanConfidence minus accuracy: positive means overconfident. */
  gap: number | null;
}

export interface ReliabilityReport {
  bands: ReliabilityBand[];
  n: number;
  accuracy: number | null;
  meanConfidence: number | null;
  /** Expected calibration error: the n-weighted mean of |gap| over bands. */
  ece: number | null;
  /** Mean squared error of confidence against 1/0 correctness. */
  brier: number | null;
}

/** Default band edges: coarse below 0.7, finer where the policy thresholds sit. */
export const DEFAULT_BAND_EDGES = [0, 0.5, 0.7, 0.8, 0.9, 0.95, 1];

export function bandIndex(confidence: number, edges: readonly number[] = DEFAULT_BAND_EDGES): number {
  for (let i = 0; i < edges.length - 1; i++) {
    const last = i === edges.length - 2;
    if (confidence >= edges[i] && (confidence < edges[i + 1] || (last && confidence <= edges[i + 1]))) return i;
  }
  return confidence < edges[0] ? 0 : edges.length - 2;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function reliability(samples: readonly CalibrationSample[], edges: readonly number[] = DEFAULT_BAND_EDGES): ReliabilityReport {
  const buckets: CalibrationSample[][] = Array.from({ length: edges.length - 1 }, () => []);
  for (const s of samples) buckets[bandIndex(s.confidence, edges)].push(s);
  const bands: ReliabilityBand[] = buckets.map((b, i) => {
    const meanConfidence = mean(b.map((s) => s.confidence));
    const accuracy = mean(b.map((s) => (s.correct ? 1 : 0)));
    return {
      lo: edges[i],
      hi: edges[i + 1],
      n: b.length,
      meanConfidence,
      accuracy,
      gap: meanConfidence === null || accuracy === null ? null : meanConfidence - accuracy,
    };
  });
  const n = samples.length;
  const ece = n ? bands.reduce((sum, b) => sum + (b.gap === null ? 0 : (b.n / n) * Math.abs(b.gap)), 0) : null;
  return {
    bands,
    n,
    accuracy: mean(samples.map((s) => (s.correct ? 1 : 0))),
    meanConfidence: mean(samples.map((s) => s.confidence)),
    ece,
    brier: mean(samples.map((s) => (s.confidence - (s.correct ? 1 : 0)) ** 2)),
  };
}

const pct = (x: number | null) => (x === null ? "-" : `${(x * 100).toFixed(1)}%`);
const num = (x: number | null, d = 3) => (x === null ? "-" : x.toFixed(d));

/** The report as a Markdown table plus a summary line. */
export function formatReliability(report: ReliabilityReport, title = "Reliability"): string {
  const rows = report.bands.map(
    (b, i) =>
      `| ${b.lo.toFixed(2)}–${b.hi.toFixed(2)}${i === report.bands.length - 1 ? "]" : ")"} | ${b.n} | ${num(b.meanConfidence)} | ${pct(
        b.accuracy,
      )} | ${b.gap === null ? "-" : (b.gap >= 0 ? "+" : "") + b.gap.toFixed(3)} |`,
  );
  return [
    `### ${title}`,
    "",
    "| confidence | n | mean conf. | accuracy | gap (conf. - acc.) |",
    "|---|---|---|---|---|",
    ...rows,
    "",
    `n=${report.n}, accuracy ${pct(report.accuracy)}, mean confidence ${num(report.meanConfidence)}, ECE ${num(report.ece)}, Brier ${num(report.brier)}. A positive gap means overconfident.`,
  ].join("\n");
}
