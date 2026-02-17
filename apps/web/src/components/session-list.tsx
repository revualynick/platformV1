"use client";

import Link from "next/link";
import type { OneOnOneSession, OneOnOneActionItem } from "@/lib/api";

interface SessionWithItems extends OneOnOneSession {
  agendaItems?: Array<{ id: string; text: string; covered: boolean }>;
  actionItems?: OneOnOneActionItem[];
}

interface SessionListProps {
  sessions: SessionWithItems[];
  linkPrefix: string; // e.g. "/dashboard/one-on-ones" or "/team/members/[userId]/one-on-one"
  partnerName: string;
}

const statusStyles: Record<string, { bg: string; text: string; label: string }> = {
  active: { bg: "bg-positive/10", text: "text-positive", label: "Live" },
  scheduled: { bg: "bg-sky-50", text: "text-sky-600", label: "Scheduled" },
  completed: { bg: "bg-stone-100", text: "text-stone-500", label: "Completed" },
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function SessionList({ sessions, linkPrefix, partnerName }: SessionListProps) {
  // Group: active first, then scheduled, then completed
  const active = sessions.filter((s) => s.status === "active");
  const scheduled = sessions.filter((s) => s.status === "scheduled");
  const completed = sessions.filter((s) => s.status === "completed");
  const sorted = [...active, ...scheduled, ...completed];

  if (sorted.length === 0) {
    return (
      <div
        className="rounded-2xl border border-stone-200/60 bg-white p-8 text-center"
        style={{ boxShadow: "var(--shadow-sm)" }}
      >
        <p className="text-sm text-stone-400">
          No 1:1 sessions yet with {partnerName}.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sorted.map((session) => {
        const style = statusStyles[session.status] ?? statusStyles.scheduled;
        const openActions = session.actionItems?.filter((a) => !a.completed).length ?? 0;
        const href = session.status === "completed"
          ? `${linkPrefix}/${session.id}`
          : `${linkPrefix}/${session.id}`;

        return (
          <Link
            key={session.id}
            href={href}
            className="block rounded-2xl border border-stone-200/60 bg-white p-5 transition-all hover:border-stone-300/60 hover:shadow-md"
            style={{ boxShadow: "var(--shadow-sm)" }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${style.bg} ${style.text}`}
                  >
                    {style.label}
                  </span>
                  <span className="text-sm font-medium text-stone-800">
                    {formatDate(session.scheduledAt)}
                  </span>
                  <span className="text-xs text-stone-400">
                    {formatTime(session.scheduledAt)}
                  </span>
                </div>

                {session.summary ? (
                  <p className="mt-2 line-clamp-2 text-sm text-stone-600">
                    {session.summary}
                  </p>
                ) : session.status === "scheduled" ? (
                  <p className="mt-2 text-sm text-stone-400 italic">
                    Upcoming session
                  </p>
                ) : null}

                {openActions > 0 && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-terracotta" />
                    <span className="text-xs text-stone-500">
                      {openActions} open action item{openActions !== 1 ? "s" : ""}
                    </span>
                  </div>
                )}
              </div>

              <span className="text-stone-300">&rarr;</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
