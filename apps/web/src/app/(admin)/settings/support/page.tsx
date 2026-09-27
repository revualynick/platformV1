import { requireAdminPage } from "@/lib/page-guards";
import { auth } from "@/lib/auth";
import { isDemoSession } from "@/lib/session-utils";
import { getSupportSettings } from "@/lib/api";
import type { SupportSettings } from "@/lib/api";
import { DataUnavailable } from "@/components/data-unavailable";
import { logPageError } from "@/lib/page-errors";
import { SupportForm } from "./support-form";
import { WordingForm, SignOffForm } from "./wording-form";

/**
 * Support signposting (docs/bot/concerns-playbook.md). Who the bot points
 * people to, the organisation's own support details, and how often each
 * signpost was shown. No streaming boundaries: this page saves in place.
 */

const monthName = (m: string) => new Date(`${m}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

export default async function SupportSettingsPage() {
  await requireAdminPage();
  const session = await auth();
  const isDemo = isDemoSession(session);

  let settings: SupportSettings | null = null;
  let loadFailed = false;
  if (!isDemo) {
    try {
      settings = (await getSupportSettings()).data;
    } catch (err) {
      logPageError("admin-support", err);
      loadFailed = true;
    }
  }
  const min = settings?.minShownCount ?? 3;
  const count = (n: number | null) => (n === null ? `under ${min}` : String(n));

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-stone-900">Support</h1>
        <p className="mt-1 text-sm text-stone-500">
          If someone&apos;s check-in suggests they may be struggling, or at risk, the bot says it&apos;s only a feedback
          assistant and points them to the person below, who is better placed to support them, with your support
          details. It doesn&apos;t pass anything on or tell anyone, and the conversation isn&apos;t used as feedback. If
          someone reports a colleague&apos;s behaviour, the bot tells them they can raise it with the same person.
        </p>
      </div>

      {!isDemo && settings && !settings.supportContact && (
        <div className="card-enter mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          No one is set to reach out to, so the bot can only say &quot;Your HR team can tell you what support is
          available&quot;. Set a person or team before people start using check-ins.
        </div>
      )}

      <div className="card-enter mb-8 rounded-2xl border border-stone-200/60 bg-surface p-6" style={{ boxShadow: "var(--shadow-sm)" }}>
        {isDemo ? (
          <p className="text-sm text-stone-400">Not available in the demo.</p>
        ) : loadFailed || !settings ? (
          <DataUnavailable what="the support settings" />
        ) : (
          <SupportForm
            initial={{ supportContact: settings.supportContact, supportDetails: settings.supportDetails, supportOutside: settings.supportOutside }}
          />
        )}
      </div>

      {!isDemo && settings && (
        <div className="card-enter mb-8 rounded-2xl border border-stone-200/60 bg-surface p-6" style={{ boxShadow: "var(--shadow-sm)" }}>
          <h2 className="font-display text-base font-semibold text-stone-800">Wording</h2>
          <p className="mt-1 text-sm text-stone-500">
            The bot writes a short acknowledgement of its own, then sends this wording exactly as it is here. Your HR
            team should read it and sign it off, and can change it to fit your policy and tone.
          </p>
          <div className={`mt-4 rounded-xl px-4 py-3 text-sm ${settings.signoff?.current ? "bg-forest/10 text-forest" : "bg-amber-50 text-amber-900"}`}>
            {settings.signoff?.current
              ? `Signed off by ${settings.signoff.name} (${settings.signoff.role}) on ${new Date(settings.signoff.at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.`
              : settings.signoff
                ? `Changed since ${settings.signoff.name} (${settings.signoff.role}) signed it off. Please have it signed off again.`
                : "Not signed off yet. Until it is, the bot uses the wording below as it stands."}
          </div>
          <div className="mt-6">
            <WordingForm wording={settings.wording} defaults={settings.defaults} placeholders={settings.placeholders} />
          </div>
          <h3 className="mt-8 text-xs font-medium uppercase tracking-wider text-stone-400">What people will see</h3>
          <dl className="mt-2 space-y-3 text-sm">
            {([
              ["Struggling", settings.previews.wellbeing],
              ["Possible risk", settings.previews.safety],
              ["Conduct", settings.previews.conduct],
            ] as const).map(([name, text]) => (
              <div key={name} className="rounded-xl bg-stone-50 px-4 py-3">
                <dt className="text-xs font-medium text-stone-500">{name}</dt>
                <dd className="mt-1 text-stone-700">{text}</dd>
              </div>
            ))}
          </dl>
          <h3 className="mt-8 text-xs font-medium uppercase tracking-wider text-stone-400">Record your HR team&apos;s sign-off of the wording above</h3>
          <div className="mt-2">
            <SignOffForm />
          </div>
        </div>
      )}

      <div className="card-enter rounded-2xl border border-stone-200/60 bg-surface p-6" style={{ boxShadow: "var(--shadow-sm)" }}>
        <h2 className="font-display text-base font-semibold text-stone-800">How often the bot pointed people to support</h2>
        <p className="mt-1 text-xs text-stone-400">
          Counts only, by month. Nothing about who, which team or when is kept. Numbers under {min} are hidden so no one
          can be picked out.
        </p>
        {!settings || settings.months.length === 0 ? (
          <p className="mt-4 text-sm text-stone-400">Nothing yet.</p>
        ) : (
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-stone-400">
                <th className="py-1 font-medium">Month</th>
                <th className="py-1 font-medium">Struggling</th>
                <th className="py-1 font-medium">Possible risk</th>
                <th className="py-1 font-medium">Conduct</th>
              </tr>
            </thead>
            <tbody>
              {settings.months.map((m) => (
                <tr key={m.month} className="border-t border-stone-100 text-stone-700">
                  <td className="py-2">{monthName(m.month)}</td>
                  <td className="py-2">{count(m.wellbeing)}</td>
                  <td className="py-2">{count(m.safety)}</td>
                  <td className="py-2">{count(m.conduct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
