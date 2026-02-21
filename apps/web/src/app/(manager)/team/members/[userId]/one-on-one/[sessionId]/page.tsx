import { auth } from "@/lib/auth";
import { PathNameProvider } from "@/lib/path-context";
import { getOneOnOneSession, getUser, getWsToken } from "@/lib/api";
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

  const WS_BASE = process.env.NEXT_PUBLIC_WS_URL;
  let wsUrl: string | null = null;
  let wsToken: string | null = null;
  if (data.session.status === "active" && WS_BASE) {
    try {
      const { token } = await getWsToken(sessionId);
      wsUrl = `${WS_BASE}/ws/one-on-one/${sessionId}`;
      wsToken = token;
    } catch {
      // WS unavailable
    }
  }

  const sessionLabel = new Date(data.session.scheduledAt).toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric" },
  );

  return (
    <PathNameProvider names={{ [userId]: data.employeeName, [sessionId]: sessionLabel }}>
    <div className="max-w-6xl">
      <div className="card-enter">
        <SessionEditor
          session={data.session}
          currentUserId={data.currentUserId}
          employeeName={data.employeeName}
          wsUrl={wsUrl}
          wsToken={wsToken}
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
    </PathNameProvider>
  );
}
