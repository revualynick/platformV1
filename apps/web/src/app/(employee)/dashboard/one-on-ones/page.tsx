import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isDemoSession } from "@/lib/session-utils";
import { getDb } from "@/lib/db";
import { getSessionsForPair, getUserWithManager, getUserById } from "@revualy/db/queries";
import { oneOnOneSessions as mockSessions } from "@/lib/mock-data";
import { SessionList } from "@/components/session-list";

async function loadOneOnOneData(session: Awaited<ReturnType<typeof auth>>, isDemo: boolean) {
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/login");
  }

  try {
    const user = await getUserWithManager(getDb(), userId);
    const managerId = user?.managerId ?? null;

    if (!managerId) {
      return {
        sessions: [],
        managerName: null,
        hasManager: false,
      };
    }

    const [sessionsResult, managerResult] = await Promise.allSettled([
      getSessionsForPair(getDb(), userId),
      getUserById(getDb(), managerId),
    ]);

    return {
      sessions: sessionsResult.status === "fulfilled" ? sessionsResult.value : [],
      managerName: managerResult.status === "fulfilled" && managerResult.value ? managerResult.value.name : "Your Manager",
      hasManager: true,
    };
  } catch {
    return {
      sessions: isDemo ? mockSessions : [],
      managerName: isDemo ? "Jordan Wells" : null,
      hasManager: isDemo,
    };
  }
}

export default async function OneOnOnesPage() {
  const session = await auth();
  const isDemo = isDemoSession(session);
  const data = await loadOneOnOneData(session, isDemo);

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
          /* DB rows have Date objects + wide string status; Next.js serializes
             Dates to strings when passing to client components, matching the expected shape */
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          sessions={data.sessions as any}
          linkPrefix="/dashboard/one-on-ones"
          partnerName={data.managerName ?? "Your Manager"}
        />
      </div>
    </div>
  );
}
