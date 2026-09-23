import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isDemoSession } from "@/lib/session-utils";
import { getDb } from "@/lib/db";
import { getNotificationPreferences as queryNotifPrefs } from "@revualy/db/queries";
import { getGoogleIntegrationStatus } from "@/lib/api";
import { notificationPreferences as mockPreferences } from "@/lib/mock-data";
import { PreferenceToggles } from "./preference-toggles";

const PREF_LABELS: Record<string, { label: string; description: string }> = {
  weekly_digest: {
    label: "Weekly Digest",
    description:
      "Receive a summary of your engagement, feedback, and team activity every Monday.",
  },
  flag_alert: {
    label: "Flag Alerts",
    description:
      "Get notified immediately when feedback is flagged for review or escalation.",
  },
  nudge: {
    label: "Nudge Reminders",
    description:
      "Gentle reminders when you have pending interactions or overdue action items.",
  },
};

export default async function SettingsPage() {
  const session = await auth();
  const isDemo = isDemoSession(session);

  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  let preferences;
  try {
    preferences = await queryNotifPrefs(getDb(), userId);
  } catch {
    preferences = isDemo ? mockPreferences : [];
  }

  const items = preferences.map((pref) => ({
    type: pref.type,
    enabled: pref.enabled,
    channel: pref.channel ?? "email",
    ...PREF_LABELS[pref.type],
  }));

  let google: { connected: boolean; hasDriveScope: boolean } | null = null;
  if (!isDemo) {
    try {
      google = await getGoogleIntegrationStatus();
    } catch {
      google = null;
    }
  }

  const connectHref =
    "/api/integrations/google/authorize?returnTo=/dashboard/settings";

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-stone-200/80 bg-surface p-6 shadow-sm">
        <h2 className="text-base font-semibold text-stone-900">
          Notification Preferences
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          Choose which notifications you receive and how.
        </p>
        <div className="mt-6">
          <PreferenceToggles items={items} />
        </div>
      </div>

      <div className="rounded-2xl border border-stone-200/80 bg-surface p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-stone-900">
              Google Calendar &amp; Meet
            </h2>
            <ul className="mt-2 space-y-1 text-sm text-stone-500">
              <li>
                <span className="font-medium text-stone-600">Calendar sync</span>{" "}
                — finds your meetings to schedule around and map who you work
                with.
              </li>
              <li>
                <span className="font-medium text-stone-600">
                  Check-in suggestions
                </span>{" "}
                — transcripts from your goal check-in calls become suggested
                goal updates. You always review before anything is applied.
              </li>
            </ul>
            {google?.connected && !google.hasDriveScope && (
              <p className="mt-2 text-sm text-warning">
                Connected, but transcript access is missing — reconnect to
                enable check-in suggestions.
              </p>
            )}
          </div>
          <div className="shrink-0">
            {!google?.connected ? (
              <a
                href={connectHref}
                className="rounded-xl bg-forest px-4 py-2.5 text-sm font-medium text-white shadow-[0_8px_20px_rgba(61,24,55,0.25)] hover:bg-forest-light"
              >
                Connect Google
              </a>
            ) : !google.hasDriveScope ? (
              <a
                href={connectHref}
                className="rounded-xl border border-warning px-4 py-2.5 text-sm font-medium text-warning hover:bg-warning/10"
              >
                Reconnect
              </a>
            ) : (
              <span className="rounded-full bg-positive/10 px-3 py-1 text-xs font-medium text-positive">
                Connected ✓
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
