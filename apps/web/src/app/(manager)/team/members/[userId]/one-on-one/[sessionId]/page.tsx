import Link from "next/link";
import { auth } from "@/lib/auth";
import { getOneOnOneSession, getUser } from "@/lib/api";
import type { OneOnOneSessionDetail } from "@/lib/api";
import { oneOnOneSessions as mockSessions } from "@/lib/mock-data";
import { SessionEditor } from "@/components/session-editor";
import {
  startSession,
  endSession,
  saveNotes,
  addActionItemAction,
  toggleActionItemAction,
  deleteActionItemAction,
  addAgendaItemAction,
  toggleAgendaItemAction,
  generateAgendaAction,
} from "../actions";

async function loadSession(userId: string, sessionId: string) {
  const session = await auth();
  const managerId = session?.user?.id;

  const mockSession = mockSessions.find((s) => s.id === sessionId) ?? mockSessions[0];

  if (!managerId) {
    return {
      session: mockSession as unknown as OneOnOneSessionDetail,
      employeeName: "Sarah Chen",
      currentUserId: "p2",
    };
  }

  try {
    const [sessionResult, employeeResult] = await Promise.allSettled([
      getOneOnOneSession(sessionId),
      getUser(userId),
    ]);

    return {
      session: sessionResult.status === "fulfilled"
        ? sessionResult.value
        : mockSession as unknown as OneOnOneSessionDetail,
      employeeName: employeeResult.status === "fulfilled" ? employeeResult.value.name : "Team Member",
      currentUserId: managerId,
    };
  } catch {
    return {
      session: mockSession as unknown as OneOnOneSessionDetail,
      employeeName: "Team Member",
      currentUserId: managerId ?? "p2",
    };
  }
}

export default async function ManagerSessionDetailPage({
  params,
}: {
  params: Promise<{ userId: string; sessionId: string }>;
}) {
  const { userId, sessionId } = await params;
  const data = await loadSession(userId, sessionId);

  const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3000";
  const wsUrl = data.session.status === "active"
    ? `${WS_BASE}/ws/one-on-one/${sessionId}?userId=${data.currentUserId}&orgId=dev-org`
    : null;

  return (
    <div className="max-w-6xl">
      <Link
        href={`/team/members/${userId}/one-on-one`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-stone-500 transition-colors hover:text-stone-800"
      >
        <span className="text-base">&larr;</span> All Sessions
      </Link>

      <div className="card-enter">
        <SessionEditor
          session={data.session}
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
    </div>
  );
}
