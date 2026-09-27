import { requireAdminPage } from "@/lib/page-guards";
import { auth } from "@/lib/auth";
import { isDemoSession } from "@/lib/session-utils";
import { getSupportSettings, getUsers } from "@/lib/api";
import type { SupportSettings, UserRow } from "@/lib/api";
import { DataUnavailable } from "@/components/data-unavailable";
import { logPageError } from "@/lib/page-errors";
import { SupportForm } from "./support-form";

/**
 * Support settings (docs/bot/concerns-playbook.md). Who the bot can offer to
 * put people in touch with, the organisation's own support details, and
 * monthly counts only. No streaming boundaries: this page saves in place.
 */

const monthName = (m: string) => new Date(`${m}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

export default async function SupportSettingsPage() {
  await requireAdminPage();
  const session = await auth();
  const isDemo = isDemoSession(session);

  let settings: SupportSettings | null = null;
  let people: UserRow[] = [];
  let loadFailed = false;
  if (!isDemo) {
    const [s, u] = await Promise.allSettled([getSupportSettings(), getUsers()]);
    if (s.status === "fulfilled") settings = s.value.data;
    else {
      logPageError("admin-support:settings", s.reason);
      loadFailed = true;
    }
    if (u.status === "fulfilled") people = u.value.data.filter((p) => p.isActive);
    else logPageError("admin-support:users", u.reason);
  }
  const min = settings?.minShownCount ?? 3;
  const count = (n: number | null) => (n === null ? `fewer than ${min}` : String(n));

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-stone-900">Support</h1>
        <p className="mt-1 text-sm text-stone-500">
          When a check-in suggests someone may need support, the bot says it&apos;s only a feedback assistant, shares
          your support details, and offers to ask your support contact to get in touch. Their name is passed on only if
          they say yes, and never what they wrote. The conversation isn&apos;t used as feedback.
        </p>
      </div>

      {!isDemo && settings && !settings.supportContactActive && (
        <div className="card-enter mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          No active support contact is set, so the bot can&apos;t offer to put anyone in touch. It will only share your
          support details. Set one before people start using check-ins.
        </div>
      )}

      <div className="card-enter mb-8 rounded-2xl border border-stone-200/60 bg-surface p-6" style={{ boxShadow: "var(--shadow-sm)" }}>
        {isDemo ? (
          <p className="text-sm text-stone-400">Not available in the demo.</p>
        ) : loadFailed || !settings ? (
          <DataUnavailable what="the support settings" />
        ) : (
          <SupportForm
            people={people.map((p) => ({ id: p.id, name: p.name, email: p.email }))}
            initial={{
              supportContactId: settings.supportContactId,
              supportBackupId: settings.supportBackupId,
              supportDetails: settings.supportDetails,
              supportOutside: settings.supportOutside,
            }}
          />
        )}
      </div>

      <div className="card-enter rounded-2xl border border-stone-200/60 bg-surface p-6" style={{ boxShadow: "var(--shadow-sm)" }}>
        <h2 className="font-display text-base font-semibold text-stone-800">How often support came up</h2>
        <p className="mt-1 text-xs text-stone-400">
          Counts only, by month, with no names or teams. Numbers below {min} are hidden so no one can be picked out.
        </p>
        {!settings || settings.months.length === 0 ? (
          <p className="mt-4 text-sm text-stone-400">Nothing yet.</p>
        ) : (
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-stone-400">
                <th className="py-1 font-medium">Month</th>
                <th className="py-1 font-medium">Support offered</th>
                <th className="py-1 font-medium">Asked to be contacted</th>
              </tr>
            </thead>
            <tbody>
              {settings.months.map((m) => (
                <tr key={m.month} className="border-t border-stone-100 text-stone-700">
                  <td className="py-2">{monthName(m.month)}</td>
                  <td className="py-2">{count(m.offers)}</td>
                  <td className="py-2">{count(m.accepted)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
