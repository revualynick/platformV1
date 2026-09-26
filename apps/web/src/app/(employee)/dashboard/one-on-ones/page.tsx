import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isDemoSession } from "@/lib/session-utils";
import { getDb } from "@/lib/db";
import { getSessionsForPair, getUserWithManager, getUserById } from "@revualy/db/queries";
import { oneOnOneSessions as mockSessions } from "@/lib/mock-data";
import { SessionList } from "@/components/session-list";
import { DataUnavailable } from "@/components/data-unavailable";
import { logPageError } from "@/lib/page-errors";
import { getBetweenMeetingGoals, getRecentImports, type BetweenMeetingGoal, type RecentImport } from "@/lib/api";
import { updateGoalAction, uploadNotesAction } from "@/lib/one-on-one-import-actions";
import { BetweenMeetingGoals } from "@/components/one-on-one-imports/between-meeting-goals";
import { UploadNotes } from "@/components/one-on-one-imports/upload-notes";
import { RecentImports } from "@/components/one-on-one-imports/recent-imports";

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
        loadFailed: false,
      };
    }

    const [sessionsResult, managerResult] = await Promise.allSettled([
      getSessionsForPair(getDb(), userId),
      getUserById(getDb(), managerId),
    ]);
    if (sessionsResult.status === "rejected") logPageError("one-on-ones", sessionsResult.reason);
    if (managerResult.status === "rejected") logPageError("one-on-ones", managerResult.reason);

    return {
      sessions: sessionsResult.status === "fulfilled" ? sessionsResult.value : [],
      managerName: managerResult.status === "fulfilled" && managerResult.value ? managerResult.value.name : "Your Manager",
      managerId,
      hasManager: true,
      loadFailed: sessionsResult.status === "rejected",
    };
  } catch (err) {
    logPageError("one-on-ones", err);
    return {
      sessions: isDemo ? mockSessions : [],
      managerName: isDemo ? "Jordan Wells" : null,
      hasManager: isDemo,
      loadFailed: true,
    };
  }
}

export default async function OneOnOnesPage() {
  const session = await auth();
  const isDemo = isDemoSession(session);
  const data = await loadOneOnOneData(session, isDemo);
  const viewerId = session?.user?.id ?? "";
  const managerId = "managerId" in data ? (data.managerId as string | null) : null;

  // Between-meeting goals and imported notes with the manager (API-enforced
  // to the two people in the 1:1).
  let goals: BetweenMeetingGoal[] = [];
  let recent: RecentImport[] = [];
  if (!isDemo && managerId) {
    const [goalsR, recentR] = await Promise.allSettled([
      getBetweenMeetingGoals({ withUserId: managerId }),
      getRecentImports(),
    ]);
    if (goalsR.status === "fulfilled") goals = goalsR.value.data;
    else logPageError("one-on-ones", goalsR.reason);
    if (recentR.status === "fulfilled") recent = recentR.value.data;
    else logPageError("one-on-ones", recentR.reason);
  }
  const managerNames: Record<string, string> = managerId ? { [managerId]: data.managerName ?? "Your manager" } : {};

  if (data.loadFailed && !isDemo) {
    return (
      <div className="max-w-3xl">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-stone-900">
            1:1 Sessions
          </h1>
        </div>
        <DataUnavailable what="your 1:1 sessions" />
      </div>
    );
  }

  if (!data.hasManager) {
    return (
      <div className="max-w-3xl">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-stone-900">
            1:1 Sessions
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Shared live notes from your manager check-ins — you both edit
            them in real time, and action items carry forward
          </p>
        </div>
        <div
          className="rounded-2xl border border-stone-200/60 bg-surface p-8 text-center"
          style={{ boxShadow: "var(--shadow-sm)" }}
        >
          <p className="text-sm font-medium text-stone-600">
            No manager assigned yet.
          </p>
          <p className="mt-1 text-sm text-stone-400">
            Once your admin sets your reporting line, 1:1 sessions with your
            manager appear here — synced from your calendar. If you just
            joined, this may still be in progress; check back soon.
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
          Shared live notes with {data.managerName} — you both edit them in
          real time
        </p>
      </div>

      {managerId && (
        <div className="mb-6 space-y-5">
          <div className="card-enter">
            <BetweenMeetingGoals
              goals={goals}
              names={managerNames}
              viewerId={viewerId}
              updateAction={updateGoalAction}
              showPerson={false}
            />
          </div>
          <div className="card-enter" style={{ animationDelay: "60ms" }}>
            <UploadNotes
              counterparts={[{ id: managerId, name: data.managerName ?? "Your manager" }]}
              uploadAction={uploadNotesAction}
            />
          </div>
          {recent.length > 0 && (
            <div className="card-enter" style={{ animationDelay: "120ms" }}>
              <RecentImports imports={recent} viewerId={viewerId} names={managerNames} />
            </div>
          )}
        </div>
      )}

      {managerId && (
        <h2 className="mb-4 font-display text-base font-semibold text-stone-800">Live sessions</h2>
      )}
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
