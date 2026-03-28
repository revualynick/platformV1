import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isDemoSession } from "@/lib/session-utils";
import { getOneOnOneSession, getUser, getCurrentUser, getWsToken } from "@/lib/api";
import type { OneOnOneSessionDetail } from "@/lib/api";
import { oneOnOneSessions as mockSessions } from "@/lib/mock-data";
import { SessionViewer } from "@/components/session-viewer";

async function loadSession(sessionId: string, authSession: Awaited<ReturnType<typeof auth>>, isDemo: boolean) {
  const userId = authSession?.user?.id;

  const mockSession = mockSessions.find((s) => s.id === sessionId) ?? mockSessions[0];

  if (!userId) {
    redirect("/login");
  }

  try {
    const [sessionResult, meResult] = await Promise.allSettled([
      getOneOnOneSession(sessionId),
      getCurrentUser(),
    ]);

    const sessionData = sessionResult.status === "fulfilled"
      ? sessionResult.value
      : isDemo ? (mockSession as unknown as OneOnOneSessionDetail) : null;

    let managerName = "Your Manager";
    if (meResult.status === "fulfilled" && meResult.value.managerId) {
      try {
        const manager = await getUser(meResult.value.managerId);
        managerName = manager.name;
      } catch {
        // Keep default
      }
    }

    return { session: sessionData, managerName, currentUserId: userId };
  } catch {
    return {
      session: isDemo ? (mockSession as unknown as OneOnOneSessionDetail) : null,
      managerName: "Your Manager",
      currentUserId: userId ?? "p3",
    };
  }
}

export default async function EmployeeSessionDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const authSession = await auth();
  const isDemo = isDemoSession(authSession);
  const data = await loadSession(sessionId, authSession, isDemo);

  // Redirect if session not found or employee doesn't own it (#6 — frontend auth gap)
  if (!data.session || !data.session.employeeId || data.session.employeeId !== data.currentUserId) {
    redirect("/dashboard/one-on-ones");
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
      // WS unavailable — session viewer will work in read-only mode
    }
  }

  return (
    <div className="max-w-6xl">
      <Link
        href="/dashboard/one-on-ones"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-stone-500 transition-colors hover:text-stone-800"
      >
        <span className="text-base">&larr;</span> All Sessions
      </Link>

      <div className="card-enter">
        <SessionViewer
          session={data.session}
          currentUserId={data.currentUserId}
          managerName={data.managerName}
          wsUrl={wsUrl}
          wsToken={wsToken}
        />
      </div>
    </div>
  );
}
