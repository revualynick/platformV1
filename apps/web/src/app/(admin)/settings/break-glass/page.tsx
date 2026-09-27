import Link from "next/link";
import { requireAdminPage } from "@/lib/page-guards";
import { auth } from "@/lib/auth";
import { isDemoSession } from "@/lib/session-utils";
import { getAccessGrants, getUsers } from "@/lib/api";
import type { AccessGrantRow, UserRow } from "@/lib/api";
import { DataUnavailable } from "@/components/data-unavailable";
import { logPageError } from "@/lib/page-errors";
import { GrantForm } from "./grant-form";
import { GrantActions } from "./grant-actions";

/**
 * Break-glass access (docs/design/privacy-and-agent-access.md): an admin
 * opens read-only access to one person's content for a formal process.
 * No streaming boundaries: this page saves in place (see CLAUDE.md).
 */

const fmt = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const statusStyle: Record<AccessGrantRow["status"], string> = {
  active: "bg-forest/10 text-forest",
  expired: "bg-stone-100 text-stone-500",
  revoked: "bg-stone-100 text-stone-500",
};

export default async function BreakGlassPage() {
  await requireAdminPage();
  const session = await auth();
  const isDemo = isDemoSession(session);
  const me = session?.user?.id;

  let grants: AccessGrantRow[] = [];
  let people: UserRow[] = [];
  let loadFailed = false;
  if (!isDemo) {
    const [g, u] = await Promise.allSettled([getAccessGrants(), getUsers()]);
    if (g.status === "fulfilled") grants = g.value.data;
    else {
      logPageError("admin-break-glass:grants", g.reason);
      loadFailed = true;
    }
    if (u.status === "fulfilled") people = u.value.data.filter((p) => p.id !== me);
    else logPageError("admin-break-glass:users", u.reason);
  }

  const today = new Date().toISOString().slice(0, 10);
  const defaultStart = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const active = grants.filter((g) => g.status === "active");
  const past = grants.filter((g) => g.status !== "active");

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-stone-900">Break-glass access</h1>
        <p className="mt-1 text-sm text-stone-500">
          Admins see signals about people, not what they or their manager wrote. When a formal process (a grievance, a
          formal performance process, a conduct report) needs a person&apos;s content, open access here. You get a
          read-only view of what their direct manager sees for the period you choose, without the manager&apos;s
          private notes. Your reason, every view and every change go into the audit log, and the person is told.
        </p>
      </div>

      <div className="card-enter mb-8 rounded-2xl border border-stone-200/60 bg-surface p-6" style={{ boxShadow: "var(--shadow-sm)" }}>
        <h2 className="mb-4 font-display text-base font-semibold text-stone-800">Open access</h2>
        {isDemo ? (
          <p className="text-sm text-stone-400">Not available in the demo.</p>
        ) : (
          <GrantForm people={people.map((p) => ({ id: p.id, name: p.name, email: p.email }))} today={today} defaultStart={defaultStart} />
        )}
      </div>

      {loadFailed ? (
        <DataUnavailable what="access grants" />
      ) : (
        <>
          <GrantList title="Active" grants={active} me={me} showActions />
          <GrantList title="Ended" grants={past} me={me} />
        </>
      )}
    </div>
  );
}

function GrantList({ title, grants, me, showActions }: { title: string; grants: AccessGrantRow[]; me?: string; showActions?: boolean }) {
  return (
    <div className="mb-8">
      <h2 className="mb-3 font-display text-base font-semibold text-stone-800">{title}</h2>
      {grants.length === 0 ? (
        <p className="text-sm text-stone-400">None.</p>
      ) : (
        <div className="space-y-3">
          {grants.map((g) => (
            <div key={g.id} className="rounded-2xl border border-stone-200/60 bg-surface p-5" style={{ boxShadow: "var(--shadow-sm)" }}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${statusStyle[g.status]}`}>{g.status}</span>
                {g.onHold && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700">on hold</span>
                )}
                <span className="text-sm font-medium text-stone-800">{g.subjectName}</span>
                {g.granteeId !== me && <span className="text-xs text-stone-400">opened by {g.granteeName}</span>}
              </div>
              <p className="mt-2 text-sm text-stone-600">{g.reason}</p>
              <p className="mt-1 text-xs text-stone-400">
                Covers {fmt(g.periodStart)} to {fmt(g.periodEnd)}. Opened {fmt(g.createdAt)},{" "}
                {g.status === "revoked" && g.revokedAt ? `ended ${fmt(g.revokedAt)}` : `${g.status === "active" ? "ends" : "ended"} ${fmt(g.expiresAt)}`}.
              </p>
              {showActions && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  {g.granteeId === me ? (
                    <Link href={`/team/members/${g.subjectId}`} className="text-xs font-medium text-forest hover:text-forest/80">
                      View {g.subjectName} &rarr;
                    </Link>
                  ) : <span />}
                  <GrantActions id={g.id} onHold={g.onHold} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
