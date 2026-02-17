import Link from "next/link";
import { auth } from "@/lib/auth";
import {
  getUser,
  getEngagementScores,
  getFeedback,
  getFlaggedItems,
  getManagerNotes,
  getUsers,
  getOneOnOneSessions,
} from "@/lib/api";
import type {
  UserRow,
  EngagementScoreRow,
  FeedbackEntryRow,
  ManagerNoteRow,
  OneOnOneSession,
} from "@/lib/api";
import { EngagementRing } from "@/components/engagement-ring";
import { EngagementChart } from "@/components/charts/engagement-chart";
import { ValuesRadar } from "@/components/charts/values-radar";
import { NotesSection } from "./notes-section";
import {
  teamMembers as mockTeamMembers,
  engagementHistory as mockEngagementHistory,
  valuesScores as mockValuesScores,
  recentFeedback as mockFeedback,
  flaggedItems as mockFlaggedItems,
  oneOnOneSessions as mockOneOnOneSessions,
} from "@/lib/mock-data";

const sentimentStyles: Record<string, { bg: string; text: string }> = {
  positive: { bg: "bg-forest/10", text: "text-forest" },
  neutral: { bg: "bg-stone-100", text: "text-stone-600" },
  negative: { bg: "bg-danger/10", text: "text-danger" },
};

const severityStyles: Record<string, { bg: string; text: string; border: string; label: string }> = {
  coaching: { bg: "bg-amber/10", text: "text-warning", border: "border-amber/20", label: "Coaching" },
  warning: { bg: "bg-terracotta/10", text: "text-terracotta", border: "border-terracotta/20", label: "Warning" },
  critical: { bg: "bg-danger/10", text: "text-danger", border: "border-danger/20", label: "Critical" },
};

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

async function loadEmployeeData(userId: string) {
  const session = await auth();
  const managerId = session?.user?.id;

  // Default mock data
  const mockMember = mockTeamMembers.find((m) => m.id === userId) ?? mockTeamMembers[0];
  const defaults = {
    employee: {
      id: mockMember.id,
      name: mockMember.name,
      role: mockMember.role ?? "employee",
      email: `${mockMember.name.toLowerCase().replace(" ", ".")}@acmecorp.com`,
    },
    engagementScore: mockMember.engagementScore,
    streak: mockMember.streak ?? 0,
    responseRate: 0.85,
    engagementHistory: mockEngagementHistory,
    valuesScores: mockValuesScores,
    feedback: mockFeedback as MockFeedbackEntry[],
    flaggedItems: mockFlaggedItems.filter(
      (f) => f.subjectName === mockMember.name,
    ) as MockFlaggedItem[],
    notes: [] as ManagerNoteRow[],
    oneOnOneSessions: mockOneOnOneSessions as (OneOnOneSession & { agendaItems: unknown[]; actionItems: unknown[] })[],
    currentUserId: managerId ?? "p2",
    isDirectReport: true,
  };

  if (!managerId) return defaults;

  try {
    const [
      userResult,
      engResult,
      feedbackResult,
      flaggedResult,
      notesResult,
      reportsResult,
      oneOnOneResult,
    ] = await Promise.allSettled([
      getUser(userId),
      getEngagementScores(userId),
      getFeedback(userId),
      getFlaggedItems(),
      getManagerNotes(userId),
      getUsers({ managerId }),
      getOneOnOneSessions({ employeeId: userId }),
    ]);

    // Employee profile
    let employee = defaults.employee;
    if (userResult.status === "fulfilled") {
      const u = userResult.value;
      employee = { id: u.id, name: u.name, role: u.role, email: u.email };
    }

    // Engagement
    let engagementScore = defaults.engagementScore;
    let streak = defaults.streak;
    let responseRate = defaults.responseRate;
    let engagementHistory = defaults.engagementHistory;

    if (engResult.status === "fulfilled" && engResult.value.data.length > 0) {
      const data = engResult.value.data;
      const latest = data[data.length - 1];
      engagementScore = latest.averageQualityScore;
      streak = latest.streak;
      responseRate = latest.responseRate;
      engagementHistory = data.map((e) => ({
        week: e.weekStarting,
        score: e.averageQualityScore,
        interactions: e.interactionsCompleted,
      }));
    }

    // Values scores from feedback
    let valuesScores = defaults.valuesScores;
    let feedback: MockFeedbackEntry[] = defaults.feedback;

    if (feedbackResult.status === "fulfilled" && feedbackResult.value.data.length > 0) {
      const entries = feedbackResult.value.data;
      feedback = entries.map((e) => ({
        id: e.id,
        fromName: e.reviewerId,
        date: new Date(e.createdAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        summary: e.aiSummary || e.rawContent.slice(0, 200),
        sentiment: e.sentiment,
        engagementScore: e.engagementScore,
        values: e.valueScores?.map((v) => v.coreValueId) ?? [],
      }));

      // Aggregate value scores across all feedback
      const scoreMap = new Map<string, { total: number; count: number }>();
      for (const entry of entries) {
        for (const vs of entry.valueScores ?? []) {
          const existing = scoreMap.get(vs.coreValueId) ?? { total: 0, count: 0 };
          existing.total += vs.score;
          existing.count += 1;
          scoreMap.set(vs.coreValueId, existing);
        }
      }
      if (scoreMap.size > 0) {
        valuesScores = [...scoreMap.entries()].map(([value, { total, count }]) => ({
          value,
          score: Math.round(total / count),
        }));
      }
    }

    // Flagged items filtered to this employee
    let flaggedItems: MockFlaggedItem[] = defaults.flaggedItems;
    if (flaggedResult.status === "fulfilled") {
      const relevant = flaggedResult.value.data.filter(
        (item) => item.feedback.subjectId === userId,
      );
      if (relevant.length > 0) {
        flaggedItems = relevant.map((item) => ({
          id: item.escalation.id,
          severity: item.escalation.severity,
          subjectName: employee.name,
          reason: item.escalation.reason,
          excerpt: item.escalation.flaggedContent || null,
          date: new Date(item.escalation.createdAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          }),
        }));
      }
    }

    // Notes
    let notes: ManagerNoteRow[] = [];
    if (notesResult.status === "fulfilled") {
      notes = notesResult.value.data;
    }

    // One-on-one sessions
    let oneOnOneSessions: OneOnOneSession[] = defaults.oneOnOneSessions as OneOnOneSession[];
    if (oneOnOneResult.status === "fulfilled") {
      oneOnOneSessions = oneOnOneResult.value.data;
    }

    // Verify this is a direct report
    let isDirectReport = true;
    if (reportsResult.status === "fulfilled") {
      isDirectReport = reportsResult.value.data.some((m) => m.id === userId);
    }

    return {
      employee,
      engagementScore,
      streak,
      responseRate,
      engagementHistory,
      valuesScores,
      feedback,
      flaggedItems,
      notes,
      oneOnOneSessions,
      currentUserId: managerId,
      isDirectReport,
    };
  } catch {
    return defaults;
  }
}

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const data = await loadEmployeeData(userId);
  const { employee, engagementScore, streak, responseRate, engagementHistory, valuesScores, feedback, flaggedItems, notes, oneOnOneSessions, currentUserId } = data;

  const initials = employee.name
    .split(" ")
    .map((n) => n[0])
    .join("");

  return (
    <div className="max-w-6xl">
      {/* Back link */}
      <Link
        href="/team/members"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-stone-500 transition-colors hover:text-stone-800"
      >
        <span className="text-base">&larr;</span> Team Members
      </Link>

      {/* Employee header */}
      <div
        className="card-enter mb-8 flex flex-col items-start gap-6 rounded-2xl border border-stone-200/60 bg-white p-6 sm:flex-row sm:items-center"
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
              <span className="text-[11px] font-medium uppercase tracking-wider text-stone-400">
                Streak
              </span>
              <p className="font-display text-lg font-semibold text-stone-800">
                {streak}w
              </p>
            </div>
            <div>
              <span className="text-[11px] font-medium uppercase tracking-wider text-stone-400">
                Response Rate
              </span>
              <p className="font-display text-lg font-semibold text-stone-800">
                {Math.round(responseRate * 100)}%
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts row: Engagement trend + Values radar */}
      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <div
          className="card-enter rounded-2xl border border-stone-200/60 bg-white p-6"
          style={{ animationDelay: "100ms", boxShadow: "var(--shadow-sm)" }}
        >
          <h3 className="mb-4 font-display text-base font-semibold text-stone-800">
            Engagement Trend
          </h3>
          <EngagementChart data={engagementHistory} />
        </div>
        <div
          className="card-enter rounded-2xl border border-stone-200/60 bg-white p-6"
          style={{ animationDelay: "200ms", boxShadow: "var(--shadow-sm)" }}
        >
          <h3 className="mb-4 font-display text-base font-semibold text-stone-800">
            Values Alignment
          </h3>
          <ValuesRadar data={valuesScores} />
        </div>
      </div>

      {/* Recent feedback */}
      <div
        className="card-enter mb-8"
        style={{ animationDelay: "300ms" }}
      >
        <h3 className="mb-4 font-display text-base font-semibold text-stone-800">
          Recent Feedback
        </h3>
        {feedback.length === 0 ? (
          <p className="text-sm text-stone-400">No feedback entries yet.</p>
        ) : (
          <div className="space-y-3">
            {feedback.map((entry) => {
              const style = sentimentStyles[entry.sentiment] ?? sentimentStyles.neutral;
              return (
                <div
                  key={entry.id}
                  className="rounded-2xl border border-stone-200/60 bg-white p-5"
                  style={{ boxShadow: "var(--shadow-sm)" }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-stone-800">
                          {entry.fromName}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${style.bg} ${style.text}`}
                        >
                          {entry.sentiment}
                        </span>
                        <span className="text-xs text-stone-400">
                          {entry.date}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-stone-600">
                        {entry.summary}
                      </p>
                      {entry.values.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {entry.values.map((v) => (
                            <span
                              key={v}
                              className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-500"
                            >
                              {v}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <span
                      className={`shrink-0 font-display text-lg font-semibold tabular-nums ${
                        entry.engagementScore >= 70
                          ? "text-forest"
                          : entry.engagementScore >= 50
                            ? "text-warning"
                            : "text-danger"
                      }`}
                    >
                      {entry.engagementScore}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Flagged items */}
      {flaggedItems.length > 0 && (
        <div
          className="card-enter mb-8"
          style={{ animationDelay: "400ms" }}
        >
          <h3 className="mb-4 font-display text-base font-semibold text-stone-800">
            Flagged Items
          </h3>
          <div className="space-y-3">
            {flaggedItems.map((item) => {
              const style = severityStyles[item.severity] ?? severityStyles.coaching;
              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border ${style.border} ${style.bg} p-5`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${style.text} ${style.bg}`}
                    >
                      {style.label}
                    </span>
                    <span className="text-xs text-stone-400">{item.date}</span>
                  </div>
                  <p className="mt-2 text-sm text-stone-600">{item.reason}</p>
                  {item.excerpt && (
                    <p className="mt-2 rounded-lg bg-white/60 px-3 py-2 text-xs italic text-stone-500">
                      {item.excerpt}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 1:1 Sessions */}
      <div
        className="card-enter mb-8"
        style={{ animationDelay: "500ms" }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-base font-semibold text-stone-800">
            1:1 Sessions
          </h3>
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
            className="block rounded-2xl border-2 border-dashed border-stone-200 bg-white/50 p-6 text-center transition-all hover:border-forest/30"
            style={{ boxShadow: "var(--shadow-sm)" }}
          >
            <p className="text-sm text-stone-400">No sessions yet. Click to schedule one.</p>
          </Link>
        ) : (() => {
          const nextSession = oneOnOneSessions.find((s) => s.status === "active" || s.status === "scheduled");
          const lastSession = [...oneOnOneSessions].reverse().find((s) => s.status === "completed");
          const statusBadge: Record<string, { bg: string; text: string; label: string }> = {
            active: { bg: "bg-positive/10", text: "text-positive", label: "Live Now" },
            scheduled: { bg: "bg-sky-50", text: "text-sky-600", label: "Upcoming" },
            completed: { bg: "bg-stone-100", text: "text-stone-500", label: "Last Session" },
          };

          return (
            <div className="space-y-3">
              {nextSession && (
                <Link
                  href={`/team/members/${userId}/one-on-one/${nextSession.id}`}
                  className="block rounded-2xl border border-stone-200/60 border-l-4 border-l-forest bg-white p-5 transition-all hover:shadow-md"
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
                  className="block rounded-2xl border border-stone-200/60 bg-white p-5 transition-all hover:shadow-md"
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

      {/* Manager notes */}
      <div
        className="card-enter"
        style={{ animationDelay: "600ms" }}
      >
        <h3 className="mb-4 font-display text-base font-semibold text-stone-800">
          Private Notes
        </h3>
        <p className="mb-4 text-xs text-stone-400">
          Only visible to you. Use these to track 1:1 observations, coaching goals, or follow-ups.
        </p>
        <NotesSection notes={notes} subjectId={userId} />
      </div>
    </div>
  );
}
