import { auth } from "@/lib/auth";
import { getOneOnOneNotes, getCurrentUser } from "@/lib/api";
import { OneOnOneTimeline } from "@/components/one-on-one-timeline";
import { oneOnOneEntries as mockEntries } from "@/lib/mock-data";
import type { OneOnOneEntryRow } from "@/lib/api";
import {
  addOneOnOneEntry,
  editOneOnOneEntry,
  fetchOneOnOneHistory,
} from "./actions";

async function loadOneOnOneData() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      entries: mockEntries as OneOnOneEntryRow[],
      currentUserId: "p3",
      managerId: "p2",
      managerName: "Jordan Wells",
    };
  }

  try {
    const user = await getCurrentUser();
    const managerId = user.managerId;

    if (!managerId) {
      return {
        entries: [] as OneOnOneEntryRow[],
        currentUserId: userId,
        managerId: null,
        managerName: null,
      };
    }

    const result = await getOneOnOneNotes(managerId);
    return {
      entries: result.data,
      currentUserId: userId,
      managerId,
      managerName: null as string | null, // Name comes from entry data
    };
  } catch {
    return {
      entries: mockEntries as OneOnOneEntryRow[],
      currentUserId: "p3",
      managerId: "p2",
      managerName: "Jordan Wells",
    };
  }
}

export default async function OneOnOnesPage() {
  const data = await loadOneOnOneData();

  // Derive manager name from entries if available
  const managerName =
    data.managerName ??
    data.entries.find((e) => e.authorId === e.managerId)?.authorName ??
    "Your Manager";

  if (!data.managerId) {
    return (
      <div className="max-w-3xl">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-stone-900">
            1:1 Notes
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Shared notes between you and your manager
          </p>
        </div>
        <div
          className="rounded-2xl border border-stone-200/60 bg-white p-8 text-center"
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
          1:1 Notes
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Shared notes with {managerName} — both of you can add entries, but
          only edit your own
        </p>
      </div>

      <div
        className="card-enter rounded-2xl border border-stone-200/60 bg-white p-6"
        style={{ boxShadow: "var(--shadow-sm)" }}
      >
        <OneOnOneTimeline
          entries={data.entries}
          currentUserId={data.currentUserId}
          partnerId={data.managerId}
          partnerName={managerName}
          addAction={addOneOnOneEntry}
          editAction={editOneOnOneEntry}
          getHistoryAction={fetchOneOnOneHistory}
        />
      </div>
    </div>
  );
}
