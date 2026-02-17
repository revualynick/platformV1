import Link from "next/link";
import { auth } from "@/lib/auth";
import { getOneOnOneSessions, getOneOnOneSession, getUser } from "@/lib/api";
import type { OneOnOneSession, OneOnOneSessionDetail } from "@/lib/api";
import { oneOnOneSessions as mockSessions } from "@/lib/mock-data";
import { SessionList } from "@/components/session-list";
import { SessionEditor } from "@/components/session-editor";
import {
  createSession,
  startSession,
  endSession,
  saveNotes,
  addActionItemAction,
  toggleActionItemAction,
  deleteActionItemAction,
  addAgendaItemAction,
  toggleAgendaItemAction,
  generateAgendaAction,
} from "./actions";
import { ScheduleSessionForm } from "./schedule-form";

async function loadData(userId: string) {
  const session = await auth();
  const managerId = session?.user?.id;

  const defaults = {
    sessions: mockSessions as (OneOnOneSession & { agendaItems: unknown[]; actionItems: unknown[] })[],
    activeSession: null as OneOnOneSessionDetail | null,
    employeeName: "Team Member",
    currentUserId: managerId ?? "p2",
  };

  if (!managerId) return defaults;

  try {
    const [sessionsResult, employeeResult] = await Promise.allSettled([
      getOneOnOneSessions({ employeeId: userId }),
      getUser(userId),
    ]);

    const sessions = sessionsResult.status === "fulfilled" ? sessionsResult.value.data : [];
    const employeeName = employeeResult.status === "fulfilled" ? employeeResult.value.name : "Team Member";

    // Load the active session in detail if one exists
    const active = sessions.find((s) => s.status === "active");
    let activeSession: OneOnOneSessionDetail | null = null;
    if (active) {
      try {
        activeSession = await getOneOnOneSession(active.id);
      } catch {
        // Keep null
      }
    }

    return { sessions, activeSession, employeeName, currentUserId: managerId };
  } catch {
    return defaults;
  }
}

export default async function ManagerOneOnOnePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const data = await loadData(userId);

  const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3000";
  const wsUrl = data.activeSession
    ? `${WS_BASE}/ws/one-on-one/${data.activeSession.id}?userId=${data.currentUserId}&orgId=dev-org`
    : null;

  return (
    <div className="max-w-6xl">
      {/* Back link */}
      <Link
        href={`/team/members/${userId}`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-stone-500 transition-colors hover:text-stone-800"
      >
        <span className="text-base">&larr;</span> Back to {data.employeeName}
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-stone-900">
            1:1 Sessions
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Live meeting notes with {data.employeeName}
          </p>
        </div>
      </div>

      {/* Active session editor */}
      {data.activeSession && (
        <div className="card-enter mb-8">
          <SessionEditor
            session={data.activeSession}
            currentUserId={data.currentUserId}
            employeeName={data.employeeName}
            wsUrl={wsUrl}
            startAction={startSession}
            endAction={endSession}
            addActionItemAction={addActionItemAction}
            toggleActionItemAction={toggleActionItemAction}
            deleteActionItemAction={deleteActionItemAction}
            addAgendaItemAction={addAgendaItemAction}
            toggleAgendaItemAction={toggleAgendaItemAction}
            generateAgendaAction={generateAgendaAction}
            saveNotesAction={saveNotes}
          />
        </div>
      )}

      {/* Schedule new session */}
      <div className="card-enter mb-6" style={{ animationDelay: "100ms" }}>
        <ScheduleSessionForm employeeId={userId} createAction={createSession} />
      </div>

      {/* Session list */}
      <div className="card-enter" style={{ animationDelay: "200ms" }}>
        <h3 className="mb-4 font-display text-base font-semibold text-stone-800">
          All Sessions
        </h3>
        <SessionList
          sessions={data.sessions as any}
          linkPrefix={`/team/members/${userId}/one-on-one`}
          partnerName={data.employeeName}
        />
      </div>
    </div>
  );
}
