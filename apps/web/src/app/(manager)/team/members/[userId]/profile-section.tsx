"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProfileSnapshotRow, DevelopmentGoalRow } from "@/lib/api";
import {
  COLOUR_DIMENSION_LABELS,
  CDM_DIMENSION_LABELS,
  type ColourDimension,
  type CdmDimension,
} from "@revualy/shared";
import { InfoHint } from "@/components/info-hint";
import { setDevelopmentGoal, updateGoalStatus } from "../../profiles/actions";
import { inviteToAssessmentAction } from "./actions";

const COLOUR_HEX: Record<string, string> = {
  red: "#ef4444",
  yellow: "#f59e0b",
  green: "#10b981",
  blue: "#3b82f6",
};

interface Props {
  userId: string;
  profiles: ProfileSnapshotRow[];
  goals: DevelopmentGoalRow[];
  drift: {
    framework: string;
    baseline: ProfileSnapshotRow;
    observed: ProfileSnapshotRow | null;
    drift: Record<string, number> | null;
  } | null;
}

export function ProfileSection({ userId, profiles, goals, drift }: Props) {
  const colourProfile = profiles.find((p) => p.framework === "colour");
  const cdmProfile = profiles.find((p) => p.framework === "cdm");

  if (!colourProfile && !cdmProfile) {
    return (
      <div className="rounded-2xl border border-stone-200/60 bg-surface p-6" style={{ boxShadow: "var(--shadow-sm)" }}>
        <h3 className="font-display text-base font-semibold text-stone-800">Profile</h3>
        <p className="mt-3 text-sm text-stone-400">
          This team member hasn&apos;t completed any assessments yet.
          Assessments map their communication and decision-making style —
          useful context for coaching.
        </p>
        <InviteToAssessmentButton userId={userId} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Profile cards */}
      <div className="grid gap-4 lg:grid-cols-2">
        {colourProfile && (
          <div className="rounded-2xl border border-stone-200/60 bg-surface p-5" style={{ boxShadow: "var(--shadow-sm)" }}>
            <p className="text-[11px] font-medium uppercase tracking-wider text-stone-400">Communication Style</p>
            <ColourMini dimensions={colourProfile.dimensions} />
          </div>
        )}
        {cdmProfile && (
          <div className="rounded-2xl border border-stone-200/60 bg-surface p-5" style={{ boxShadow: "var(--shadow-sm)" }}>
            <p className="text-[11px] font-medium uppercase tracking-wider text-stone-400">Decision Making</p>
            <CdmMini dimensions={cdmProfile.dimensions} />
          </div>
        )}
      </div>

      {/* Drift indicator */}
      {drift?.drift && drift.observed && (
        <DriftSection drift={drift} />
      )}

      {/* Goals */}
      <GoalsSection userId={userId} goals={goals} profiles={profiles} />
    </div>
  );
}

function InviteToAssessmentButton({ userId }: { userId: string }) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleInvite() {
    setError(null);
    startTransition(async () => {
      const result = await inviteToAssessmentAction(userId);
      if ("error" in result) {
        setError(result.error ?? "Failed to send invite");
      } else {
        setSent(true);
      }
    });
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={handleInvite}
        disabled={isPending || sent}
        className="rounded-lg bg-forest px-4 py-1.5 text-xs font-semibold text-white hover:bg-forest-light transition-colors disabled:opacity-50"
      >
        {sent ? "Invitation sent ✓" : isPending ? "Sending…" : "Invite to take assessment"}
      </button>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function ColourMini({ dimensions }: { dimensions: Record<string, number> }) {
  const dims = ["red", "yellow", "green", "blue"] as const;
  const sorted = [...dims].sort((a, b) => (dimensions[b] ?? 0) - (dimensions[a] ?? 0));
  const dominant = sorted[0];

  return (
    <div className="mt-3">
      <div className="flex h-4 overflow-hidden rounded-full">
        {dims.map((dim) => (
          <div
            key={dim}
            style={{
              width: `${Math.round((dimensions[dim] ?? 0) * 100)}%`,
              backgroundColor: COLOUR_HEX[dim],
            }}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-stone-600">
        <span className="font-medium">{COLOUR_DIMENSION_LABELS[dominant as ColourDimension].name}</span> dominant
      </p>
    </div>
  );
}

function CdmMini({ dimensions }: { dimensions: Record<string, number> }) {
  const dims = [
    "inquiryVsAdvocacy",
    "conflictTolerance",
    "frameFlexibility",
    "analysisVsAction",
    "cogDiversitySeeking",
    "postMortemOrientation",
  ] as const;

  return (
    <div className="mt-3 space-y-2">
      {dims.map((dim) => {
        const value = dimensions[dim] ?? 0.5;
        const labels = CDM_DIMENSION_LABELS[dim as CdmDimension];
        return (
          <div key={dim} className="flex items-center gap-2">
            <span className="w-20 text-[10px] text-stone-500 truncate">{labels.name}</span>
            <div className="relative flex-1 h-1.5 rounded-full bg-stone-100">
              <div
                className="absolute h-full rounded-full bg-forest/60"
                style={{ width: `${Math.round(value * 100)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DriftSection({
  drift,
}: {
  drift: {
    framework: string;
    baseline: ProfileSnapshotRow;
    observed: ProfileSnapshotRow | null;
    drift: Record<string, number> | null;
  };
}) {
  if (!drift.drift) return null;

  const significantDrifts = Object.entries(drift.drift)
    .filter(([, value]) => Math.abs(value) >= 0.05)
    .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a));

  if (significantDrifts.length === 0) {
    return (
      <div className="rounded-xl border border-stone-100 bg-stone-50/50 px-4 py-3">
        <p className="text-xs text-stone-500">
          Behavioral patterns align closely with their self-reported profile. No significant drift detected.
        </p>
      </div>
    );
  }

  const labels = drift.framework === "colour" ? COLOUR_DIMENSION_LABELS : CDM_DIMENSION_LABELS;

  return (
    <div className="rounded-2xl border border-stone-200/60 bg-surface p-5" style={{ boxShadow: "var(--shadow-sm)" }}>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
        Behavioral Drift
      </h4>
      <p className="mt-1 text-[10px] text-stone-400">
        Drift compares self-assessment with observed behavior
        <InfoHint entry="behavioralDrift" />
      </p>
      <div className="mt-3 space-y-2">
        {significantDrifts.map(([dim, value]) => {
          const label = (labels as Record<string, { name: string }>)[dim];
          const isPositive = value > 0;
          return (
            <div key={dim} className="flex items-center justify-between">
              <span className="text-xs font-medium text-stone-600">
                {label?.name ?? dim}
              </span>
              <span
                className={`text-xs font-semibold ${
                  isPositive ? "text-positive" : "text-warning"
                }`}
              >
                {isPositive ? "+" : ""}{Math.round(value * 100)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GoalsSection({
  userId,
  goals,
  profiles,
}: {
  userId: string;
  goals: DevelopmentGoalRow[];
  profiles: ProfileSnapshotRow[];
}) {
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const [framework, setFramework] = useState<"colour" | "cdm">("colour");
  const [dimension, setDimension] = useState("");
  const [direction, setDirection] = useState<"increase" | "decrease">("increase");
  const [notes, setNotes] = useState("");

  const colourDims = ["red", "yellow", "green", "blue"];
  const cdmDims = [
    "inquiryVsAdvocacy",
    "conflictTolerance",
    "frameFlexibility",
    "analysisVsAction",
    "cogDiversitySeeking",
    "postMortemOrientation",
  ];
  const currentDims = framework === "colour" ? colourDims : cdmDims;
  const currentLabels = framework === "colour" ? COLOUR_DIMENSION_LABELS : CDM_DIMENSION_LABELS;

  function handleSubmitGoal() {
    if (!dimension) return;
    setError(null);

    const baselineProfile = profiles.find((p) => p.framework === framework);

    startTransition(async () => {
      const result = await setDevelopmentGoal(userId, {
        framework,
        dimension,
        targetDirection: direction,
        baselineSnapshotId: baselineProfile?.id,
        notes: notes || undefined,
      });

      if (!result.success) {
        setError(result.error ?? "Failed to create goal");
        return;
      }

      setShowForm(false);
      setDimension("");
      setNotes("");
      router.refresh();
    });
  }

  function handleUpdateGoal(goalId: string, status: string) {
    startTransition(async () => {
      await updateGoalStatus(goalId, { status });
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-stone-200/60 bg-surface p-5" style={{ boxShadow: "var(--shadow-sm)" }}>
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
          Development Goals
        </h4>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="text-xs font-medium text-forest hover:text-forest/80 transition-colors"
        >
          {showForm ? "Cancel" : "+ Add Goal"}
        </button>
      </div>

      {/* Goal creation form */}
      {showForm && (
        <div className="mt-4 space-y-3 rounded-xl border border-stone-200 bg-white p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-medium text-stone-500">Framework</label>
              <select
                value={framework}
                onChange={(e) => { setFramework(e.target.value as "colour" | "cdm"); setDimension(""); }}
                className="mt-1 block w-full rounded-lg border border-stone-200 px-3 py-1.5 text-xs text-stone-800 focus:border-forest focus:outline-none"
              >
                <option value="colour">Communication Style</option>
                <option value="cdm">Decision Making</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-stone-500">Dimension</label>
              <select
                value={dimension}
                onChange={(e) => setDimension(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-stone-200 px-3 py-1.5 text-xs text-stone-800 focus:border-forest focus:outline-none"
              >
                <option value="">Select...</option>
                {currentDims.map((dim) => (
                  <option key={dim} value={dim}>
                    {(currentLabels as Record<string, { name: string }>)[dim]?.name ?? dim}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-medium text-stone-500">Direction</label>
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={() => setDirection("increase")}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  direction === "increase"
                    ? "bg-forest text-white"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
              >
                Develop / Increase
              </button>
              <button
                type="button"
                onClick={() => setDirection("decrease")}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  direction === "decrease"
                    ? "bg-forest text-white"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
              >
                Moderate / Decrease
              </button>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-medium text-stone-500">Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Context for coaching conversations"
              className="mt-1 block w-full rounded-lg border border-stone-200 px-3 py-1.5 text-xs text-stone-800 focus:border-forest focus:outline-none"
            />
          </div>
          {error && (
            <p className="text-xs text-red-600">{error}</p>
          )}
          <button
            type="button"
            onClick={handleSubmitGoal}
            disabled={!dimension || isPending}
            className="rounded-lg bg-forest px-4 py-1.5 text-xs font-semibold text-white hover:bg-forest-light transition-colors disabled:opacity-50"
          >
            {isPending ? "Saving..." : "Set Goal"}
          </button>
        </div>
      )}

      {/* Existing goals */}
      {goals.length > 0 ? (
        <div className="mt-4 divide-y divide-stone-100">
          {goals.map((goal) => {
            const labels = goal.framework === "colour" ? COLOUR_DIMENSION_LABELS : CDM_DIMENSION_LABELS;
            const dimLabel = (labels as Record<string, { name: string }>)[goal.dimension]?.name ?? goal.dimension;

            return (
              <div key={goal.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-xs font-medium text-stone-700">
                    {goal.targetDirection === "increase" ? "Develop" : "Moderate"} {dimLabel}
                  </p>
                  {goal.notes && (
                    <p className="mt-0.5 text-[10px] text-stone-400">{goal.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      goal.status === "active"
                        ? "bg-positive/10 text-positive"
                        : goal.status === "achieved"
                          ? "bg-blue-50 text-blue-600"
                          : "bg-stone-100 text-stone-500"
                    }`}
                  >
                    {goal.status}
                  </span>
                  {goal.status === "active" && (
                    <button
                      type="button"
                      onClick={() => handleUpdateGoal(goal.id, "achieved")}
                      disabled={isPending}
                      className="text-[10px] font-medium text-forest hover:text-forest/80 disabled:opacity-50"
                    >
                      Mark achieved
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : !showForm ? (
        <p className="mt-3 text-xs text-stone-400">No development goals set yet.</p>
      ) : null}
    </div>
  );
}
