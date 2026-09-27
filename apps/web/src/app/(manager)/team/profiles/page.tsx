import { requireManagerPage } from "@/lib/page-guards";
import { auth } from "@/lib/auth";
import { isDemoSession } from "@/lib/session-utils";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { listActiveUsers } from "@revualy/db/queries";
import { getTeamProfiles } from "@/lib/api";
import type { ProfileSnapshotRow } from "@/lib/api";
import Link from "next/link";
import {
  COLOUR_DIMENSION_LABELS,
  CDM_DIMENSION_LABELS,
  type ColourDimension,
  type CdmDimension,
} from "@revualy/shared";

const COLOUR_HEX: Record<string, string> = {
  red: "#ef4444",
  yellow: "#f59e0b",
  green: "#10b981",
  blue: "#3b82f6",
};

const COLOUR_STYLES: Record<string, { bg: string; text: string }> = {
  red: { bg: "bg-red-50", text: "text-red-700" },
  yellow: { bg: "bg-amber-50", text: "text-amber-700" },
  green: { bg: "bg-emerald-50", text: "text-emerald-700" },
  blue: { bg: "bg-blue-50", text: "text-blue-700" },
};

export default async function TeamProfilesPage() {
  await requireManagerPage();
  const session = await auth();
  const isDemo = isDemoSession(session);

  if (!session?.user?.id && !isDemo) {
    redirect("/login");
  }

  return (
    <div className="max-w-6xl">
      <div className="mb-10">
        <p className="text-sm font-medium text-stone-400">Development</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">
          Team Profiles
        </h1>
        <p className="mt-2 text-sm text-stone-500">
          See how your team communicates and makes decisions. Identify
          composition gaps and coaching opportunities.
        </p>
        <p className="mt-1 text-sm text-stone-500">
          Use the composition to spot gaps — e.g. a team heavy on Red/Yellow
          may pair well with Green/Blue reviewers, and low CDM spread can
          signal groupthink risk.
        </p>
      </div>

      
        <TeamProfilesContent isDemo={isDemo} managerId={session?.user?.id ?? ""} />
      
    </div>
  );
}

async function TeamProfilesContent({
  isDemo,
  managerId,
}: {
  isDemo: boolean;
  managerId: string;
}) {
  // Get team members
  let members: Array<{ id: string; name: string; teamId: string | null }> = [];

  if (!isDemo) {
    try {
      const users = await listActiveUsers(getDb(), { managerId });
      members = users.map((u) => ({ id: u.id, name: u.name, teamId: u.teamId }));
    } catch {
      // empty
    }
  }

  if (members.length === 0) {
    return (
      <div className="rounded-2xl border border-stone-200/60 bg-surface p-12 text-center">
        <p className="text-sm text-stone-500">No team members found.</p>
      </div>
    );
  }

  // Fetch profiles for both frameworks
  const teamId = members[0]?.teamId;
  let colourData: Array<{ user: { id: string; name: string }; profile: ProfileSnapshotRow | null }> = [];
  let cdmData: Array<{ user: { id: string; name: string }; profile: ProfileSnapshotRow | null }> = [];

  if (teamId) {
    try {
      const [colourRes, cdmRes] = await Promise.allSettled([
        getTeamProfiles(teamId, "colour"),
        getTeamProfiles(teamId, "cdm"),
      ]);
      if (colourRes.status === "fulfilled") colourData = colourRes.value.data;
      if (cdmRes.status === "fulfilled") cdmData = cdmRes.value.data;
    } catch {
      // empty
    }
  }

  const hasColourProfiles = colourData.some((d) => d.profile !== null);
  const hasCdmProfiles = cdmData.some((d) => d.profile !== null);

  return (
    <div className="space-y-8">
      {/* Colour Composition */}
      <div
        className="card-enter rounded-2xl border border-stone-200/60 bg-surface p-6"
        style={{ animationDelay: "100ms", boxShadow: "var(--shadow-sm)" }}
      >
        <h2 className="font-display text-lg font-semibold text-stone-900">
          Communication Style Composition
        </h2>
        <p className="mt-1 text-xs text-stone-400">
          Colour profile distribution across your team
        </p>

        {hasColourProfiles ? (
          <div className="mt-6">
            {/* Aggregate bar */}
            <TeamColourBar data={colourData} />

            {/* Individual members */}
            <div className="mt-6 divide-y divide-stone-100">
              {colourData.map((item) => (
                <MemberColourRow key={item.user.id} user={item.user} profile={item.profile} />
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-6 text-center py-8">
            <p className="text-sm text-stone-400">
              No colour assessments completed yet. Team members can take the assessment from their profile page.
            </p>
          </div>
        )}
      </div>

      {/* CDM Composition */}
      <div
        className="card-enter rounded-2xl border border-stone-200/60 bg-surface p-6"
        style={{ animationDelay: "200ms", boxShadow: "var(--shadow-sm)" }}
      >
        <h2 className="font-display text-lg font-semibold text-stone-900">
          Decision-Making Composition
        </h2>
        <p className="mt-1 text-xs text-stone-400">
          CDM dimension averages and spread across your team
        </p>

        {hasCdmProfiles ? (
          <div className="mt-6">
            <TeamCdmChart data={cdmData} />
          </div>
        ) : (
          <div className="mt-6 text-center py-8">
            <p className="text-sm text-stone-400">
              No decision-making assessments completed yet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function TeamColourBar({
  data,
}: {
  data: Array<{ user: { id: string; name: string }; profile: ProfileSnapshotRow | null }>;
}) {
  const totals = { red: 0, yellow: 0, green: 0, blue: 0 };
  let count = 0;

  for (const item of data) {
    if (!item.profile) continue;
    count++;
    const dims = item.profile.dimensions;
    totals.red += dims.red ?? 0;
    totals.yellow += dims.yellow ?? 0;
    totals.green += dims.green ?? 0;
    totals.blue += dims.blue ?? 0;
  }

  if (count === 0) return null;

  const avg = {
    red: totals.red / count,
    yellow: totals.yellow / count,
    green: totals.green / count,
    blue: totals.blue / count,
  };

  const dims = ["red", "yellow", "green", "blue"] as const;

  return (
    <div>
      <div className="flex h-6 overflow-hidden rounded-full">
        {dims.map((dim) => (
          <div
            key={dim}
            className="transition-all duration-500"
            style={{
              width: `${Math.round(avg[dim] * 100)}%`,
              backgroundColor: COLOUR_HEX[dim],
            }}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-stone-500">
        {dims.map((dim) => (
          <span key={dim}>
            {COLOUR_DIMENSION_LABELS[dim].name.split(" ")[0]} {Math.round(avg[dim] * 100)}%
          </span>
        ))}
      </div>
    </div>
  );
}

function MemberColourRow({
  user,
  profile,
}: {
  user: { id: string; name: string };
  profile: ProfileSnapshotRow | null;
}) {
  if (!profile) {
    return (
      <div className="flex items-center justify-between py-3">
        <span className="text-sm font-medium text-stone-700">{user.name}</span>
        <span className="text-xs text-stone-400">Not assessed</span>
      </div>
    );
  }

  const dims = ["red", "yellow", "green", "blue"] as const;
  const dominant = [...dims].sort(
    (a, b) => (profile.dimensions[b] ?? 0) - (profile.dimensions[a] ?? 0),
  )[0];

  return (
    <div className="flex items-center gap-4 py-3">
      <Link
        href={`/team/members/${user.id}`}
        className="w-32 text-sm font-medium text-stone-700 hover:text-forest transition-colors truncate"
      >
        {user.name}
      </Link>
      <div className="flex flex-1 h-3 overflow-hidden rounded-full">
        {dims.map((dim) => (
          <div
            key={dim}
            className="transition-all duration-500"
            style={{
              width: `${Math.round((profile.dimensions[dim] ?? 0) * 100)}%`,
              backgroundColor: COLOUR_HEX[dim],
            }}
          />
        ))}
      </div>
      <span
        className={`w-24 text-right text-xs font-medium ${COLOUR_STYLES[dominant].text}`}
      >
        {COLOUR_DIMENSION_LABELS[dominant as ColourDimension].name}
      </span>
    </div>
  );
}

function TeamCdmChart({
  data,
}: {
  data: Array<{ user: { id: string; name: string }; profile: ProfileSnapshotRow | null }>;
}) {
  const dims = [
    "inquiryVsAdvocacy",
    "conflictTolerance",
    "frameFlexibility",
    "analysisVsAction",
    "cogDiversitySeeking",
    "postMortemOrientation",
  ] as const;

  const profiledMembers = data.filter((d) => d.profile !== null);
  if (profiledMembers.length === 0) return null;

  return (
    <div className="space-y-4">
      {dims.map((dim) => {
        const values = profiledMembers.map(
          (d) => d.profile!.dimensions[dim] ?? 0.5,
        );
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const min = Math.min(...values);
        const max = Math.max(...values);
        const labels = CDM_DIMENSION_LABELS[dim as CdmDimension];

        return (
          <div key={dim}>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-stone-600">
                {labels.name}
              </span>
              <span className="text-[10px] text-stone-400">
                avg {Math.round(avg * 100)}%
              </span>
            </div>

            <div className="relative h-3 rounded-full bg-stone-100">
              {/* Spread indicator */}
              <div
                className="absolute h-full rounded-full bg-forest/15"
                style={{
                  left: `${Math.round(min * 100)}%`,
                  width: `${Math.round((max - min) * 100)}%`,
                }}
              />
              {/* Average marker */}
              <div
                className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-forest bg-white shadow-sm"
                style={{ left: `${Math.round(avg * 100)}%` }}
              />
              {/* Individual dots */}
              {values.map((v, i) => (
                <div
                  key={profiledMembers[i].user.id}
                  className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-forest/40"
                  style={{ left: `${Math.round(v * 100)}%` }}
                  title={`${profiledMembers[i].user.name}: ${Math.round(v * 100)}%`}
                />
              ))}
            </div>

            <div className="mt-0.5 flex justify-between text-[10px] text-stone-400">
              <span>{labels.low}</span>
              <span>{labels.high}</span>
            </div>
          </div>
        );
      })}

      {/* Legend */}
      <div className="mt-4 flex items-center gap-4 text-[10px] text-stone-400">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-forest/40" />
          Individual
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-full border-2 border-forest bg-white" />
          Team average
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-4 rounded bg-forest/15" />
          Spread
        </span>
      </div>

      {/* Member list */}
      <div className="mt-4 border-t border-stone-100 pt-4">
        <div className="flex flex-wrap gap-2">
          {data.map((item) => (
            <Link
              key={item.user.id}
              href={`/team/members/${item.user.id}`}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                item.profile
                  ? "bg-forest/10 text-forest hover:bg-forest/20"
                  : "bg-stone-100 text-stone-400"
              }`}
            >
              {item.user.name}
              {!item.profile && " (pending)"}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function TeamProfilesSkeleton() {
  return (
    <div className="space-y-8">
      <div className="h-64 animate-pulse rounded-2xl bg-stone-100" />
      <div className="h-80 animate-pulse rounded-2xl bg-stone-100" />
    </div>
  );
}
