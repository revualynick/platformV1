import { auth } from "@/lib/auth";
import { isDemoSession } from "@/lib/session-utils";
import { redirect } from "next/navigation";
import { getMyProfiles, getAssessmentSessions } from "@/lib/api";
import type { ProfileSnapshotRow, AssessmentSessionRow } from "@/lib/api";
import Link from "next/link";
import {
  COLOUR_DIMENSION_LABELS,
  CDM_DIMENSION_LABELS,
  type ColourDimension,
  type CdmDimension,
} from "@revualy/shared";

interface Props {
  params: Promise<{ sessionId: string }>;
}

const COLOUR_BARS: Record<
  string,
  { color: string; bg: string; textColor: string; description: string }
> = {
  red: { color: "#ef4444", bg: "bg-red-50", textColor: "text-red-700", description: "Direct, results-driven, competitive. You cut through noise to get things done." },
  yellow: { color: "#f59e0b", bg: "bg-amber-50", textColor: "text-amber-700", description: "Enthusiastic, collaborative, expressive. You energize the room and build connections." },
  green: { color: "#10b981", bg: "bg-emerald-50", textColor: "text-emerald-700", description: "Patient, supportive, harmony-seeking. You create safe spaces for people to thrive." },
  blue: { color: "#3b82f6", bg: "bg-blue-50", textColor: "text-blue-700", description: "Analytical, precise, methodical. You bring rigour and clarity to complex problems." },
};

export default async function ResultsPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.id || isDemoSession(session)) {
    redirect("/login");
  }

  const { sessionId } = await params;

  let assessmentSession: AssessmentSessionRow | undefined;
  let profile: ProfileSnapshotRow | undefined;

  try {
    const [sessionsRes, profilesRes] = await Promise.allSettled([
      getAssessmentSessions(),
      getMyProfiles(),
    ]);

    if (sessionsRes.status === "fulfilled") {
      assessmentSession = sessionsRes.value.data.find((s) => s.id === sessionId);
    }
    if (profilesRes.status === "fulfilled") {
      profile = profilesRes.value.data.find((p) => p.sessionId === sessionId);
    }
  } catch {
    redirect("/dashboard/profile");
  }

  if (!assessmentSession || !profile) {
    redirect("/dashboard/profile");
  }

  const framework = assessmentSession.framework;
  const dimensions = profile.dimensions;

  return (
    <div className="mx-auto max-w-2xl py-8">
      <div className="rounded-2xl border border-stone-200/80 bg-white p-8 shadow-sm">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-positive/10 text-2xl text-positive">
            ✓
          </div>
          <h1 className="font-display text-2xl font-semibold text-stone-900">
            {framework === "colour"
              ? "Your Communication Style"
              : "Your Decision-Making Profile"}
          </h1>
          <p className="mt-2 text-sm text-stone-500">
            Based on {Object.keys(assessmentSession.responses).length} responses
            {" · "}
            {new Date(assessmentSession.completedAt!).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>

        {/* Results */}
        <div className="mt-8">
          {framework === "colour" ? (
            <ColourResults dimensions={dimensions} />
          ) : (
            <CdmResults dimensions={dimensions} />
          )}
        </div>

        {/* Actions */}
        <div className="mt-8 flex items-center justify-center gap-3 border-t border-stone-100 pt-6">
          <Link
            href="/dashboard/profile"
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-stone-500 hover:text-stone-700 transition-colors"
          >
            Back to Profile
          </Link>
          <Link
            href={`/dashboard/profile/assess/${framework}?context=retake`}
            className="rounded-xl bg-stone-100 px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-200 transition-colors"
          >
            Retake Assessment
          </Link>
        </div>
      </div>
    </div>
  );
}

function ColourResults({ dimensions }: { dimensions: Record<string, number> }) {
  const dims = ["red", "yellow", "green", "blue"] as const;
  const sorted = [...dims].sort(
    (a, b) => (dimensions[b] ?? 0) - (dimensions[a] ?? 0),
  );
  const dominant = sorted[0];
  const secondary = sorted[1];

  return (
    <div className="space-y-6">
      {/* Blend summary */}
      <div className="rounded-xl border border-stone-200/60 bg-stone-50 p-5 text-center">
        <p className="text-xs font-medium uppercase tracking-wider text-stone-400">
          Your colour blend
        </p>
        <div className="mt-2 flex items-center justify-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-sm font-semibold ${COLOUR_BARS[dominant].bg} ${COLOUR_BARS[dominant].textColor}`}
          >
            {COLOUR_DIMENSION_LABELS[dominant].name}
          </span>
          <span className="text-xs text-stone-400">/</span>
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${COLOUR_BARS[secondary].bg} ${COLOUR_BARS[secondary].textColor}`}
          >
            {COLOUR_DIMENSION_LABELS[secondary].name}
          </span>
        </div>
      </div>

      {/* Visual bars */}
      <div className="space-y-1">
        {sorted.map((dim) => {
          const pct = Math.round((dimensions[dim] ?? 0) * 100);
          const info = COLOUR_BARS[dim];
          const label = COLOUR_DIMENSION_LABELS[dim as ColourDimension];
          return (
            <div key={dim} className="rounded-xl border border-stone-100 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: info.color }}
                  />
                  <span className="text-sm font-semibold text-stone-800">
                    {label.name}
                  </span>
                </div>
                <span className="text-lg font-bold text-stone-900">{pct}%</span>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-stone-100">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: info.color,
                  }}
                />
              </div>
              <p className="mt-2 text-xs text-stone-500">{info.description}</p>
            </div>
          );
        })}
      </div>

      {/* Interpretation */}
      <div className="rounded-xl bg-forest/5 p-5">
        <h3 className="text-sm font-semibold text-forest">What this means</h3>
        <p className="mt-2 text-sm leading-relaxed text-stone-600">
          Your dominant energy is{" "}
          <strong className={COLOUR_BARS[dominant].textColor}>
            {COLOUR_DIMENSION_LABELS[dominant].name}
          </strong>
          , with{" "}
          <strong className={COLOUR_BARS[secondary].textColor}>
            {COLOUR_DIMENSION_LABELS[secondary].name}
          </strong>{" "}
          as your secondary. This blend shapes how you communicate, give
          feedback, and handle pressure. Your profile isn&apos;t static — it
          will evolve as you grow, and Revualy will track that journey.
        </p>
      </div>
    </div>
  );
}

function CdmResults({ dimensions }: { dimensions: Record<string, number> }) {
  const dims = [
    "inquiryVsAdvocacy",
    "conflictTolerance",
    "frameFlexibility",
    "analysisVsAction",
    "cogDiversitySeeking",
    "postMortemOrientation",
  ] as const;

  const strengths = dims.filter((d) => {
    const v = dimensions[d] ?? 0.5;
    return v >= 0.65;
  });

  const developAreas = dims.filter((d) => {
    const v = dimensions[d] ?? 0.5;
    return v <= 0.35;
  });

  return (
    <div className="space-y-6">
      {/* Dimension cards */}
      <div className="space-y-1">
        {dims.map((dim) => {
          const value = dimensions[dim] ?? 0.5;
          const pct = Math.round(value * 100);
          const labels = CDM_DIMENSION_LABELS[dim as CdmDimension];
          const isStrength = value >= 0.65;
          const isDevelop = value <= 0.35;

          return (
            <div key={dim} className="rounded-xl border border-stone-100 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-stone-800">
                  {labels.name}
                </span>
                {isStrength && (
                  <span className="rounded-full bg-positive/10 px-2 py-0.5 text-[10px] font-medium text-positive">
                    Strength
                  </span>
                )}
                {isDevelop && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                    Develop
                  </span>
                )}
              </div>

              {/* Spectrum bar */}
              <div className="mt-3 flex items-center gap-3">
                <span className="w-24 text-right text-[10px] text-stone-400">
                  {labels.low}
                </span>
                <div className="relative flex-1 h-2.5 rounded-full bg-stone-100">
                  <div
                    className="absolute h-full rounded-full bg-forest/60 transition-all duration-700 ease-out"
                    style={{ width: `${pct}%` }}
                  />
                  {/* Marker */}
                  <div
                    className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-forest bg-white shadow-sm transition-all duration-700 ease-out"
                    style={{ left: `${pct}%` }}
                  />
                </div>
                <span className="w-24 text-[10px] text-stone-400">
                  {labels.high}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="rounded-xl bg-forest/5 p-5">
        <h3 className="text-sm font-semibold text-forest">Your Profile Summary</h3>
        <div className="mt-3 space-y-2 text-sm text-stone-600">
          {strengths.length > 0 && (
            <p>
              <strong>Strengths:</strong>{" "}
              {strengths
                .map((d) => CDM_DIMENSION_LABELS[d as CdmDimension].name)
                .join(", ")}
              . These are areas where your natural tendencies serve you well in
              decision-making.
            </p>
          )}
          {developAreas.length > 0 && (
            <p>
              <strong>Development areas:</strong>{" "}
              {developAreas
                .map((d) => CDM_DIMENSION_LABELS[d as CdmDimension].name)
                .join(", ")}
              . Being aware of these patterns is the first step — your manager
              can set development goals to help you grow.
            </p>
          )}
          {strengths.length === 0 && developAreas.length === 0 && (
            <p>
              Your profile shows a balanced approach across all dimensions.
              Over time, Revualy will track how your decision-making patterns
              evolve through your actual interactions.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
