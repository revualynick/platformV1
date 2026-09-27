import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isDemoSession } from "@/lib/session-utils";
import { getSupportMe, getSupportRequests } from "@/lib/api";
import type { SupportRequestRow } from "@/lib/api";
import { DataUnavailable } from "@/components/data-unavailable";
import { logPageError } from "@/lib/page-errors";
import { RequestActions } from "./request-actions";

/**
 * The support contacts' queue (docs/bot/concerns-playbook.md): people who
 * said yes when the bot offered to put them in touch. Who and how soon,
 * never what they wrote. Opening this page is audited. No streaming
 * boundaries: it saves in place (see CLAUDE.md).
 */

const fmt = (d: string) =>
  new Date(d).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function SupportRequestsPage() {
  const session = await auth();
  if (!session || isDemoSession(session)) redirect("/dashboard");

  let isContact = false;
  try {
    isContact = (await getSupportMe()).isContact;
  } catch (err) {
    logPageError("support-requests:me", err);
  }
  if (!isContact) redirect("/dashboard");

  let rows: SupportRequestRow[] = [];
  let loadFailed = false;
  try {
    rows = (await getSupportRequests()).data;
  } catch (err) {
    logPageError("support-requests", err);
    loadFailed = true;
  }
  const now = Date.now();
  const active = rows.filter((r) => r.status !== "closed");
  const done = rows.filter((r) => r.status === "closed");

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-stone-900">Support requests</h1>
        <p className="mt-1 text-sm text-stone-500">
          People who asked, during a check-in, for someone to get in touch. They agreed to their name being passed to you,
          and nothing else: Revualy doesn&apos;t share what they wrote. Please contact them by the time shown, which is what
          they were told. Opening this page is recorded.
        </p>
      </div>
      {loadFailed ? (
        <DataUnavailable what="support requests" />
      ) : (
        <>
          <h2 className="mb-3 font-display text-base font-semibold text-stone-800">To do</h2>
          {active.length === 0 ? (
            <p className="mb-8 text-sm text-stone-400">Nothing waiting.</p>
          ) : (
            <div className="mb-8 space-y-3">
              {active.map((r) => {
                const overdue = r.status === "open" && new Date(r.dueAt).getTime() < now;
                return (
                  <div key={r.id} className="rounded-2xl border border-stone-200/60 bg-surface p-5" style={{ boxShadow: "var(--shadow-sm)" }}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-stone-800">{r.name}</span>
                      <span className="text-xs text-stone-400">{r.email}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${r.urgency === "today" ? "bg-amber-50 text-amber-700" : "bg-stone-100 text-stone-500"}`}>
                        {r.urgency === "today" ? "today" : "within 2 working days"}
                      </span>
                      {overdue && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-danger">overdue</span>}
                      {r.status === "acknowledged" && <span className="rounded-full bg-forest/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-forest">in hand</span>}
                    </div>
                    <p className="mt-1 text-xs text-stone-400">
                      Asked {fmt(r.createdAt)}. Contact by {fmt(r.dueAt)}.
                    </p>
                    <div className="mt-3">
                      <RequestActions id={r.id} status={r.status} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <h2 className="mb-3 font-display text-base font-semibold text-stone-800">Done in the last 30 days</h2>
          {done.length === 0 ? (
            <p className="text-sm text-stone-400">None.</p>
          ) : (
            <ul className="space-y-1 text-sm text-stone-600">
              {done.map((r) => (
                <li key={r.id}>
                  {r.name}, asked {fmt(r.createdAt)}, done {r.closedAt ? fmt(r.closedAt) : ""}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
