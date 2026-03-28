import { auth } from "@/lib/auth";
import { PathNameProvider } from "@/lib/path-context";
import { getOneOnOneSession, getUser, getUsers, getWsToken } from "@/lib/api";
import type { OneOnOneSessionDetail } from "@/lib/api";
import { oneOnOneSessions as mockSessions } from "@/lib/mock-data";
import { isDemoSession } from "@/lib/session-utils";
import { redirect } from "next/navigation";
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

async function loadSession(userId: string, sessionId: string, managerId: string | undefined, isDemo: boolean) {

  const mockSession = isDemo
    ? (mockSessions.find((s) => s.id === sessionId) ?? mockSessions[0])
    : null;

  if (!managerId) {
    return {
      session: isDemo && mockSession
        ? (mockSession as unknown as OneOnOneSessionDetail)
        : null,
      employeeName: isDemo ? "Sarah Chen" : "Team Member",
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
        : isDemo && mockSession
          ? (mockSession as unknown as OneOnOneSessionDetail)
          : null,
      employeeName: employeeResult.status === "fulfilled" ? employeeResult.value.name : "Team Member",
      currentUserId: managerId,
    };
  } catch {
    return {
      session: isDemo && mockSession
        ? (mockSession as unknown as OneOnOneSessionDetail)
        : null,
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
  const session = await auth();
  const isDemo = isDemoSession(session);

  // Verify the target user is a direct report of current manager (before loading data)
  if (!isDemo) {
    if (!session?.user?.id) {
      redirect("/team/members");
    }
    try {
      const reports = await getUsers({ managerId: session.user.id });
      const isDirectReport = reports.data.some((m) => m.id === userId);
      if (!isDirectReport) {
        redirect("/team/members");
      }
    } catch {
      redirect("/team/members");
    }
  }

  const data = await loadSession(userId, sessionId, session?.user?.id, isDemo);

  // Verify the loaded session belongs to this employee/manager pair
  if (data.session && !isDemo) {
    if (data.session.employeeId !== userId || data.session.managerId !== session?.user?.id) {
      redirect("/team/members");
    }
  }

  if (!data.session) {
    return (
      <div className="max-w-6xl">
        <p className="text-sm text-stone-400">Session not found.</p>
      </div>
    );
  }

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
