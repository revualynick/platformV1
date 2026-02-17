import Link from "next/link";
import { auth } from "@/lib/auth";
import { getOneOnOneSession, getUser, getCurrentUser } from "@/lib/api";
import type { OneOnOneSessionDetail } from "@/lib/api";
import { oneOnOneSessions as mockSessions } from "@/lib/mock-data";
import { SessionViewer } from "@/components/session-viewer";

async function loadSession(sessionId: string) {
  const session = await auth();
  const userId = session?.user?.id;

  const mockSession = mockSessions.find((s) => s.id === sessionId) ?? mockSessions[0];

  if (!userId) {
    return {
      session: mockSession as unknown as OneOnOneSessionDetail,
      managerName: "Jordan Wells",
      currentUserId: "p3",
    };
  }

  try {
    const [sessionResult, meResult] = await Promise.allSettled([
      getOneOnOneSession(sessionId),
      getCurrentUser(),
    ]);

    const sessionData = sessionResult.status === "fulfilled"
      ? sessionResult.value
      : mockSession as unknown as OneOnOneSessionDetail;

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
      session: mockSession as unknown as OneOnOneSessionDetail,
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
  const data = await loadSession(sessionId);

  const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3000";
  const wsUrl = data.session.status === "active"
    ? `${WS_BASE}/ws/one-on-one/${sessionId}?userId=${data.currentUserId}&orgId=dev-org`
    : null;

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
        />
      </div>
    </div>
  );
}
