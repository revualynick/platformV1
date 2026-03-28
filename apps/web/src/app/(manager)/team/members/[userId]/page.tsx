import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PathNameProvider } from "@/lib/path-context";
import { auth } from "@/lib/auth";
import { isDemoSession } from "@/lib/session-utils";
import { getDb } from "@/lib/db";
import { getUserById, listActiveUsers } from "@revualy/db/queries";
import { getEngagementScoresForUser } from "@revualy/db/queries";
import { getFeedbackForSubject, getFlaggedItemsForReports } from "@revualy/db/queries";
import { getManagerNotes } from "@revualy/db/queries";
import { getSessionsForPair } from "@revualy/db/queries";
import { getActiveCoreValues } from "@revualy/db/queries";
import type { ManagerNoteRow } from "@/lib/api";
import { EngagementRing } from "@/components/engagement-ring";
import { EngagementChart } from "@/components/charts/engagement-chart";
import { ValuesRadar } from "@/components/charts/values-radar";
import { ChartErrorBoundary } from "@/components/chart-error-boundary";
import { NotesSection } from "./notes-section";
import {
  teamMembers as mockTeamMembers,
  engagementHistory as mockEngagementHistory,
  valuesScores as mockValuesScores,
  recentFeedback as mockFeedback,
  flaggedItems as mockFlaggedItems,
  oneOnOneSessions as mockOneOnOneSessions,
} from "@/lib/mock-data";
import { sentimentStyles, severityStyles } from "@/lib/style-constants";

type MockFeedbackEntry = {
  id: string;
  fromName: string;
  date: string;
  summary: string;
  sentiment: string;
  engagementScore: number;
  values: string[];
};

type MockFlaggedItem = {
  id: string;
  severity: string;
  subjectName: string;
  reason: string;
  excerpt: string | null;
  date: string;
};

// ── Skeleton fallbacks ─────────────────────────────────

function HeaderSkeleton() {
  return (
    <div className="card-enter mb-8 h-32 animate-pulse rounded-2xl bg-stone-100" style={{ boxShadow: "var(--shadow-sm)" }} />
  );
}

function ChartSkeleton() {
  return <div className="h-[300px] animate-pulse rounded-2xl bg-stone-100" />;
}

function SectionSkeleton() {
  return <div className="h-48 animate-pulse rounded-2xl bg-stone-100" />;
}

// ── Async sub-components ───────────────────────────────

async function EmployeeHeader({
  userId,
  managerId,
  isDemo,
}: {
  userId: string;
  managerId: string;
  isDemo: boolean;
}) {
  const mockMember = isDemo
    ? (mockTeamMembers.find((m) => m.id === userId) ?? mockTeamMembers[0])
    : null;

  let employee = mockMember
    ? { id: mockMember.id, name: mockMember.name, role: mockMember.role ?? "employee", email: `${mockMember.name.toLowerCase().replace(" ", ".")}@acmecorp.com` }
    : { id: userId, name: "Team Member", role: "employee", email: "" };
  let engagementScore = mockMember?.engagementScore ?? 0;
  let streak = mockMember?.streak ?? 0;
  let responseRate = isDemo ? 0.85 : 0;

  try {
    const [userResult, engResult] = await Promise.allSettled([
      getUserById(getDb(), userId),
      getEngagementScoresForUser(getDb(), userId),
    ]);

    if (userResult.status === "fulfilled" && userResult.value) {
      const u = userResult.value;
      employee = { id: u.id, name: u.name, role: u.role, email: u.email };
    }

    if (engResult.status === "fulfilled" && engResult.value.length > 0) {
      const data = engResult.value;
      const latest = data[0];
      engagementScore = latest.averageQualityScore;
      streak = latest.streak;
      responseRate = latest.responseRate;
    }
  } catch {
    // use defaults
  }

  const initials = employee.name.split(" ").map((n) => n[0]).join("");

  return (
    <div
      className="card-enter mb-8 flex flex-col items-start gap-6 rounded-2xl border border-stone-200/60 bg-surface p-6 sm:flex-row sm:items-center"
      style={{ boxShadow: "var(--shadow-sm)" }}
    >
      <div className="flex items-center gap-5">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-stone-100 text-lg font-semibold text-stone-600">
          {initials}
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-stone-900">
            {employee.name}
          </h1>
          <p className="text-sm text-stone-500">
            {employee.role} &middot; {employee.email}
          </p>
        </div>
      </div>
      <div className="sm:ml-auto flex items-center gap-8">
        <EngagementRing score={engagementScore} size={100} />
        <div className="space-y-2">
          <div>
            <span className="text-[11px] font-medium uppercase tracking-wider text-stone-400">Streak</span>
            <p className="font-display text-lg font-semibold text-stone-800">{streak}w</p>
          </div>
          <div>
            <span className="text-[11px] font-medium uppercase tracking-wider text-stone-400">Response Rate</span>
            <p className="font-display text-lg font-semibold text-stone-800">{Math.round(responseRate * 100)}%</p>
          </div>
        </div>
      </div>
    </div>
  );
}

async function ChartsRow({
  userId,
  isDemo,
}: {
  userId: string;
  isDemo: boolean;
}) {
  let engagementHistory = isDemo ? mockEngagementHistory : [];
  let valuesScores = isDemo ? mockValuesScores : [];

  try {
    const [engResult, feedbackResult, coreValuesResult] = await Promise.allSettled([
      getEngagementScoresForUser(getDb(), userId),
      getFeedbackForSubject(getDb(), userId),
      getActiveCoreValues(getDb()),
    ]);

    if (engResult.status === "fulfilled" && engResult.value.length > 0) {
      const data = engResult.value;
      engagementHistory = data.map((e) => ({
        week: e.weekStarting,
        score: e.averageQualityScore,
        interactions: e.interactionsCompleted,
      }));
    }

    // Build id→name map for core values
    const valueNameMap = new Map<string, string>();
    if (coreValuesResult.status === "fulfilled") {
      for (const cv of coreValuesResult.value) {
        valueNameMap.set(cv.id, cv.name);
      }
    }

    if (feedbackResult.status === "fulfilled" && feedbackResult.value.length > 0) {
      const scoreMap = new Map<string, { total: number; count: number }>();
      for (const entry of feedbackResult.value) {
        for (const vs of entry.valueScores ?? []) {
          const existing = scoreMap.get(vs.coreValueId) ?? { total: 0, count: 0 };
          existing.total += vs.score;
          existing.count += 1;
          scoreMap.set(vs.coreValueId, existing);
        }
      }
      if (scoreMap.size > 0) {
        valuesScores = [...scoreMap.entries()].map(([id, { total, count }]) => ({
          value: valueNameMap.get(id) ?? id,
          score: Math.round(total / count),
        }));
      }
    }
  } catch {
    // use defaults
  }

  return (
    <div className="mb-8 grid gap-6 lg:grid-cols-2">
      <div
        className="card-enter rounded-2xl border border-stone-200/60 bg-surface p-6"
        style={{ animationDelay: "100ms", boxShadow: "var(--shadow-sm)" }}
      >
        <h3 className="mb-4 font-display text-base font-semibold text-stone-800">Engagement Trend</h3>
        <ChartErrorBoundary>
          <Suspense fallback={<ChartSkeleton />}>
            <EngagementChart data={engagementHistory} />
          </Suspense>
        </ChartErrorBoundary>
      </div>
      <div
        className="card-enter rounded-2xl border border-stone-200/60 bg-surface p-6"
        style={{ animationDelay: "200ms", boxShadow: "var(--shadow-sm)" }}
      >
        <h3 className="mb-4 font-display text-base font-semibold text-stone-800">Values Alignment</h3>
        <ChartErrorBoundary>
          <Suspense fallback={<ChartSkeleton />}>
            <ValuesRadar data={valuesScores} />
          </Suspense>
        </ChartErrorBoundary>
      </div>
    </div>
  );
}

async function FeedbackSection({
  userId,
  isDemo,
}: {
  userId: string;
  isDemo: boolean;
}) {
  let feedback: MockFeedbackEntry[] = isDemo ? (mockFeedback as MockFeedbackEntry[]) : [];

  try {
    const entries = await getFeedbackForSubject(getDb(), userId).catch(() => []);
    if (entries.length > 0) {
      feedback = entries.map((e) => ({
        id: e.id,
        fromName: "Peer",
        date: new Date(e.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        summary: e.aiSummary || e.rawContent.slice(0, 200),
        sentiment: e.sentiment,
        engagementScore: e.engagementScore,
        values: e.valueScores?.map((v) => v.coreValueId) ?? [],
      }));
    }
  } catch {
    // use defaults
  }

  return (
    <div className="card-enter mb-8" style={{ animationDelay: "300ms" }}>
      <h3 className="mb-4 font-display text-base font-semibold text-stone-800">Recent Feedback</h3>
      {feedback.length === 0 ? (
        <p className="text-sm text-stone-400">No feedback entries yet.</p>
      ) : (
        <div className="space-y-3">
          {feedback.map((entry) => {
            const style = sentimentStyles[entry.sentiment] ?? sentimentStyles.neutral;
            return (
              <div
                key={entry.id}
                className="rounded-2xl border border-stone-200/60 bg-surface p-5"
                style={{ boxShadow: "var(--shadow-sm)" }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-stone-800">{entry.fromName}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${style.bg} ${style.text}`}>
                        {entry.sentiment}
                      </span>
                      <span className="text-xs text-stone-400">{entry.date}</span>
                    </div>
                    <p className="mt-2 text-sm text-stone-600">{entry.summary}</p>
                    {entry.values.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {entry.values.map((v) => (
                          <span key={v} className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-500">{v}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className={`shrink-0 font-display text-lg font-semibold tabular-nums ${
                    entry.engagementScore >= 70 ? "text-forest" : entry.engagementScore >= 50 ? "text-warning" : "text-danger"
                  }`}>
                    {entry.engagementScore}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

async function FlaggedSection({
  userId,
  employeeName,
  isDemo,
}: {
  userId: string;
  employeeName: string;
  isDemo: boolean;
}) {
  const mockMember = isDemo ? (mockTeamMembers.find((m) => m.id === userId) ?? mockTeamMembers[0]) : null;
  let flaggedItems: MockFlaggedItem[] = isDemo
    ? (mockFlaggedItems.filter((f) => f.subjectName === mockMember?.name) as MockFlaggedItem[])
    : [];

  try {
    const items = await getFlaggedItemsForReports(getDb(), [userId]).catch(() => []);
    if (items.length > 0) {
      flaggedItems = items.map((item) => ({
        id: item.escalation.id,
        severity: item.escalation.severity,
        subjectName: item.subjectName ?? employeeName,
        reason: item.escalation.reason,
        excerpt: item.escalation.flaggedContent || null,
        date: new Date(item.escalation.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      }));
    }
  } catch {
    // use defaults
  }

  if (flaggedItems.length === 0) return null;

  return (
    <div className="card-enter mb-8" style={{ animationDelay: "400ms" }}>
      <h3 className="mb-4 font-display text-base font-semibold text-stone-800">Flagged Items</h3>
      <div className="space-y-3">
        {flaggedItems.map((item) => {
          const style = severityStyles[item.severity] ?? severityStyles.coaching;
          return (
            <div key={item.id} className={`rounded-2xl border ${style.border} ${style.bg} p-5`}>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${style.text} ${style.bg}`}>
                  {style.label}
                </span>
                <span className="text-xs text-stone-400">{item.date}</span>
              </div>
              <p className="mt-2 text-sm text-stone-600">{item.reason}</p>
              {item.excerpt && (
                <p className="mt-2 rounded-lg bg-surface/60 px-3 py-2 text-xs italic text-stone-500">{item.excerpt}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type SessionRow = {
  id: string;
  managerId: string;
  employeeId: string;
  status: string;
  scheduledAt: Date | string;
  startedAt: Date | string | null;
  endedAt: Date | string | null;
  notes: string;
  summary: string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

async function SessionsSection({
  userId,
  managerId,
  isDemo,
}: {
  userId: string;
  managerId: string;
  isDemo: boolean;
}) {
  let oneOnOneSessions: SessionRow[] = isDemo
    ? (mockOneOnOneSessions as SessionRow[])
    : [];

  try {
    const sessions = await getSessionsForPair(getDb(), managerId, { employeeId: userId }).catch(() => []);
    oneOnOneSessions = sessions;
  } catch {
    // use defaults
  }

  const statusBadge: Record<string, { bg: string; text: string; label: string }> = {
    active: { bg: "bg-positive/10", text: "text-positive", label: "Live Now" },
    scheduled: { bg: "bg-sky-50", text: "text-sky-600", label: "Upcoming" },
    completed: { bg: "bg-stone-100", text: "text-stone-500", label: "Last Session" },
  };

  return (
    <div className="card-enter mb-8" style={{ animationDelay: "500ms" }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-base font-semibold text-stone-800">1:1 Sessions</h3>
        <Link
          href={`/team/members/${userId}/one-on-one`}
          className="text-xs font-medium text-forest hover:text-forest/80"
        >
          View all &rarr;
        </Link>
      </div>
      {oneOnOneSessions.length === 0 ? (
        <Link
          href={`/team/members/${userId}/one-on-one`}
          className="block rounded-2xl border-2 border-dashed border-stone-200 bg-surface/50 p-6 text-center transition-all hover:border-forest/30"
          style={{ boxShadow: "var(--shadow-sm)" }}
        >
          <p className="text-sm text-stone-400">No sessions yet. Click to schedule one.</p>
        </Link>
      ) : (() => {
        const nextSession = oneOnOneSessions.find((s) => s.status === "active" || s.status === "scheduled");
        const lastSession = [...oneOnOneSessions].reverse().find((s) => s.status === "completed");

        return (
          <div className="space-y-3">
            {nextSession && (
              <Link
                href={`/team/members/${userId}/one-on-one/${nextSession.id}`}
                className="block rounded-2xl border border-stone-200/60 border-l-4 border-l-forest bg-surface p-5 transition-all hover:shadow-md"
                style={{ boxShadow: "var(--shadow-sm)" }}
              >
                <div className="flex items-center gap-2.5">
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${statusBadge[nextSession.status].bg} ${statusBadge[nextSession.status].text}`}>
                    {statusBadge[nextSession.status].label}
                  </span>
                  <span className="text-sm font-medium text-stone-800">
                    {new Date(nextSession.scheduledAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  </span>
                  <span className="text-xs text-stone-400">
                    {new Date(nextSession.scheduledAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  </span>
                </div>
                {nextSession.summary && (
                  <p className="mt-2 line-clamp-2 text-sm text-stone-600">{nextSession.summary}</p>
                )}
              </Link>
            )}
            {lastSession && (
              <Link
                href={`/team/members/${userId}/one-on-one/${lastSession.id}`}
                className="block rounded-2xl border border-stone-200/60 bg-surface p-5 transition-all hover:shadow-md"
                style={{ boxShadow: "var(--shadow-sm)" }}
              >
                <div className="flex items-center gap-2.5">
                  <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                    Last Session
                  </span>
                  <span className="text-sm font-medium text-stone-800">
                    {new Date(lastSession.scheduledAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </div>
                {lastSession.summary && (
                  <p className="mt-2 line-clamp-2 text-sm text-stone-600">{lastSession.summary}</p>
                )}
              </Link>
            )}
          </div>
        );
      })()}
    </div>
  );
}

async function NotesWrapper({
  userId,
  managerId,
  isDemo,
}: {
  userId: string;
  managerId: string;
  isDemo: boolean;
}) {
  let notes: ManagerNoteRow[] = [];

  if (!isDemo) {
    try {
      const rows = await getManagerNotes(getDb(), managerId, userId).catch(() => []);
      notes = rows.map((r) => ({
        id: r.id,
        managerId: r.managerId,
        subjectId: r.subjectId,
        content: r.content,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      }));
    } catch {
      // use defaults
    }
  }

  return (
    <div className="card-enter" style={{ animationDelay: "600ms" }}>
      <h3 className="mb-4 font-display text-base font-semibold text-stone-800">Private Notes</h3>
      <p className="mb-4 text-xs text-stone-400">
        Only visible to you. Use these to track 1:1 observations, coaching goals, or follow-ups.
      </p>
      <NotesSection notes={notes} subjectId={userId} />
    </div>
  );
}

// ── Page ───────────────────────────────────────────────

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const session = await auth();
  const isDemo = isDemoSession(session);

  // Enforce direct report access before loading any data
  if (!isDemo) {
    if (!session?.user?.id) {
      redirect("/team/members");
    }
    try {
      const reports = await listActiveUsers(getDb(), { managerId: session.user.id });
      const isDirectReport = reports.some((m) => m.id === userId);
      if (!isDirectReport) {
        redirect("/team/members");
      }
    } catch {
      redirect("/team/members");
    }
  }

  const managerId = session?.user?.id ?? "p2";

  // Resolve employee name eagerly for PathNameProvider — minimal fetch
  let employeeName = "Team Member";
  let usingMockData = false;
  try {
    if (isDemo) {
      const mockMember = mockTeamMembers.find((m) => m.id === userId) ?? mockTeamMembers[0];
      employeeName = mockMember?.name ?? "Team Member";
      usingMockData = true;
    } else {
      const user = await getUserById(getDb(), userId);
      if (user) employeeName = user.name;
    }
  } catch {
    usingMockData = true;
  }

  return (
    <PathNameProvider names={{ [userId]: employeeName }}>
      <div className="max-w-6xl">
        {/* Mock data banner */}
        {usingMockData && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            Unable to reach the API — showing sample data. Some information may not be current.
          </div>
        )}

        {/* Employee header — streams in quickly (just getUser + getEngagementScores) */}
        <Suspense fallback={<HeaderSkeleton />}>
          <EmployeeHeader userId={userId} managerId={managerId} isDemo={isDemo} />
        </Suspense>

        {/* Charts row */}
        <Suspense
          fallback={
            <div className="mb-8 grid gap-6 lg:grid-cols-2">
              <div className="card-enter rounded-2xl border border-stone-200/60 bg-surface p-6" style={{ boxShadow: "var(--shadow-sm)" }}>
                <ChartSkeleton />
              </div>
              <div className="card-enter rounded-2xl border border-stone-200/60 bg-surface p-6" style={{ boxShadow: "var(--shadow-sm)" }}>
                <ChartSkeleton />
              </div>
            </div>
          }
        >
          <ChartsRow userId={userId} isDemo={isDemo} />
        </Suspense>

        {/* Recent feedback */}
        <Suspense fallback={<div className="mb-8"><SectionSkeleton /></div>}>
          <FeedbackSection userId={userId} isDemo={isDemo} />
        </Suspense>

        {/* Flagged items */}
        <Suspense fallback={null}>
          <FlaggedSection userId={userId} employeeName={employeeName} isDemo={isDemo} />
        </Suspense>

        {/* 1:1 Sessions */}
        <Suspense fallback={<div className="mb-8"><SectionSkeleton /></div>}>
          <SessionsSection userId={userId} managerId={managerId} isDemo={isDemo} />
        </Suspense>

        {/* Manager notes */}
        <Suspense fallback={<SectionSkeleton />}>
          <NotesWrapper userId={userId} managerId={managerId} isDemo={isDemo} />
        </Suspense>
      </div>
    </PathNameProvider>
  );
}
