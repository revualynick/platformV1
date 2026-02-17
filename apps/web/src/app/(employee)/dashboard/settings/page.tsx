import { getNotificationPreferences } from "@/lib/api";
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
  leaderboard_update: {
    label: "Leaderboard Updates",
    description:
      "Weekly notification when the engagement leaderboard is updated.",
  },
};

export default async function SettingsPage() {
  let preferences;
  try {
    const result = await getNotificationPreferences();
    preferences = result.data;
  } catch {
    preferences = mockPreferences;
  }

  const items = preferences.map((pref) => ({
    type: pref.type,
    enabled: pref.enabled,
    channel: pref.channel ?? "email",
    ...PREF_LABELS[pref.type],
  }));

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm">
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
    </div>
  );
}
