import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getOneOnOneSessions, getCurrentUser, getUser } from "@/lib/api";
import type { OneOnOneSession } from "@/lib/api";
import { oneOnOneSessions as mockSessions } from "@/lib/mock-data";
import { SessionList } from "@/components/session-list";

async function loadOneOnOneData() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/login");
  }

  try {
    const user = await getCurrentUser();
    const managerId = user.managerId;

    if (!managerId) {
      return {
        sessions: [] as OneOnOneSession[],
        managerName: null,
        hasManager: false,
      };
    }

    const [sessionsResult, managerResult] = await Promise.allSettled([
      getOneOnOneSessions({ employeeId: userId }),
      getUser(managerId),
    ]);

    return {
      sessions: sessionsResult.status === "fulfilled" ? sessionsResult.value.data : [],
      managerName: managerResult.status === "fulfilled" ? managerResult.value.name : "Your Manager",
      hasManager: true,
    };
  } catch {
    return {
      sessions: mockSessions as (OneOnOneSession & { agendaItems: unknown[]; actionItems: unknown[] })[],
      managerName: "Jordan Wells",
      hasManager: true,
    };
  }
}

export default async function OneOnOnesPage() {
  const data = await loadOneOnOneData();

  if (!data.hasManager) {
    return (
      <div className="max-w-3xl">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-stone-900">
            1:1 Sessions
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Live meeting notes with your manager
          </p>
        </div>
        <div
          className="rounded-2xl border border-stone-200/60 bg-surface p-8 text-center"
          style={{ boxShadow: "var(--shadow-sm)" }}
        >
          <p className="text-sm text-stone-400">
            No manager assigned. Contact your admin to set up your reporting
            line.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-stone-900">
          1:1 Sessions
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Live meeting notes with {data.managerName}
        </p>
      </div>

      <div className="card-enter">
        <SessionList
          sessions={data.sessions}
          linkPrefix="/dashboard/one-on-ones"
          partnerName={data.managerName ?? "Your Manager"}
        />
      </div>
    </div>
  );
}
