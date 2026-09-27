import Link from "next/link";
import { getAccessGrantsAboutMe } from "@/lib/api";
import type { GrantAboutMe } from "@/lib/api";
import { logPageError } from "@/lib/page-errors";

/**
 * Break-glass transparency (docs/design/privacy-and-agent-access.md): a
 * person is told when an admin opens their content for a formal process,
 * unless the admin set a hold, which ends when lifted or when access ends.
 * The reason stays in the audit log.
 */

const fmt = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

async function load(): Promise<GrantAboutMe[] | null> {
  try {
    return (await getAccessGrantsAboutMe()).data;
  } catch (err) {
    logPageError("record-access", err);
    return null;
  }
}

/** Dashboard notice while someone has access to the person's record. */
export async function RecordAccessNotice() {
  const grants = await load();
  const active = grants?.filter((g) => g.status === "active") ?? [];
  if (active.length === 0) return null;
  return (
    <div className="card-enter mb-8 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
      {active.map((g) => (
        <p key={g.id}>
          {g.granteeName} has read-only access to your feedback and 1:1 record from {fmt(g.periodStart)} to{" "}
          {fmt(g.periodEnd)}, for a formal process, until {fmt(g.expiresAt)}.
        </p>
      ))}
      <Link href="/dashboard/settings#record-access" className="mt-2 inline-block text-xs font-medium underline">
        What this means
      </Link>
    </div>
  );
}

/** Settings section: everyone who has had access, and what it means. */
export async function RecordAccessList() {
  const grants = await load();
  return (
    <div id="record-access" className="rounded-2xl border border-stone-200/80 bg-surface p-6 shadow-sm">
      <h2 className="text-base font-semibold text-stone-900">Access to your record</h2>
      <p className="mt-1 text-sm text-stone-500">
        Your feedback, profiles and 1:1 content are seen by you and your direct manager. An admin can open read-only
        access for a formal process (a grievance, a formal performance process or a conduct report). They have to give
        a reason, access ends within 30 days, and every view is recorded. You&apos;re told here, sometimes only once
        the process allows it.
      </p>
      {grants === null ? (
        <p className="mt-4 text-sm text-stone-400">We couldn&apos;t load this right now.</p>
      ) : grants.length === 0 ? (
        <p className="mt-4 text-sm text-stone-400">No one else has had access.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {grants.map((g) => (
            <li key={g.id} className="text-sm text-stone-600">
              <span className="font-medium text-stone-800">{g.granteeName}</span>, covering {fmt(g.periodStart)} to{" "}
              {fmt(g.periodEnd)}. Opened {fmt(g.createdAt)},{" "}
              {g.status === "active" ? `ends ${fmt(g.expiresAt)}` : `ended ${fmt(g.revokedAt ?? g.expiresAt)}`}.
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
