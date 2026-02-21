"use client";

import { useState, useTransition } from "react";
import { confirmProfile, saveNotificationPrefs, finishOnboarding } from "./actions";
import Link from "next/link";

interface InitialData {
  name: string;
  email: string;
  role: string;
  timezone: string;
}

const STEPS = ["Welcome", "Notifications", "Connect"] as const;

const NOTIFICATION_TYPES = [
  { type: "weekly_digest", label: "Weekly Digest", description: "Monday engagement summary" },
  { type: "flag_alert", label: "Flag Alerts", description: "Immediate escalation notifications" },
  { type: "nudge", label: "Nudge Reminders", description: "Pending interaction reminders" },
  { type: "leaderboard_update", label: "Leaderboard Updates", description: "Weekly leaderboard results" },
];

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
  "UTC",
];

export function OnboardingWizard({ initialData }: { initialData: InitialData }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initialData.name);
  const [timezone, setTimezone] = useState(initialData.timezone);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({
    weekly_digest: true,
    flag_alert: true,
    nudge: true,
    leaderboard_update: true,
  });
  const [isPending, startTransition] = useTransition();

  function handleNext() {
    if (step === 0) {
      startTransition(async () => {
        await confirmProfile({ name, timezone });
        setStep(1);
      });
    } else if (step === 1) {
      startTransition(async () => {
        await saveNotificationPrefs(prefs);
        setStep(2);
      });
    } else {
      startTransition(async () => {
        await finishOnboarding();
      });
    }
  }

  return (
    <div className="rounded-2xl border border-stone-200/80 bg-white p-8 shadow-sm">
      {/* Step indicator */}
      <div className="mb-8 flex items-center justify-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                i <= step
                  ? "bg-forest text-white"
                  : "bg-stone-100 text-stone-400"
              }`}
            >
              {i + 1}
            </div>
            <span
              className={`text-xs font-medium ${
                i <= step ? "text-stone-700" : "text-stone-400"
              }`}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <div
                className={`h-px w-8 ${
                  i < step ? "bg-forest" : "bg-stone-200"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Welcome */}
      {step === 0 && (
        <div className="space-y-6">
          <div className="text-center">
            <h2 className="font-display text-xl font-semibold text-stone-900">
              Welcome to Revualy
            </h2>
            <p className="mt-2 text-sm text-stone-500">
              Let&apos;s get you set up. Confirm your details below.
            </p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-700">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full rounded-xl border border-stone-200 px-4 py-2.5 text-sm text-stone-800 focus:border-forest focus:outline-none focus:ring-1 focus:ring-forest"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700">
                Email
              </label>
              <input
                type="email"
                value={initialData.email}
                disabled
                className="mt-1 block w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700">
                Timezone
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="mt-1 block w-full rounded-xl border border-stone-200 px-4 py-2.5 text-sm text-stone-800 focus:border-forest focus:outline-none focus:ring-1 focus:ring-forest"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Notification Preferences */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="text-center">
            <h2 className="font-display text-xl font-semibold text-stone-900">
              Notification Preferences
            </h2>
            <p className="mt-2 text-sm text-stone-500">
              Choose which notifications you&apos;d like to receive.
            </p>
          </div>
          <div className="divide-y divide-stone-100">
            {NOTIFICATION_TYPES.map(({ type, label, description }) => (
              <div
                key={type}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <p className="text-sm font-medium text-stone-800">{label}</p>
                  <p className="text-xs text-stone-500">{description}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={prefs[type]}
                  onClick={() =>
                    setPrefs((p) => ({ ...p, [type]: !p[type] }))
                  }
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-forest/30 focus:ring-offset-2 ${
                    prefs[type] ? "bg-forest" : "bg-stone-200"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
                      prefs[type] ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Connect Calendar */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="text-center">
            <h2 className="font-display text-xl font-semibold text-stone-900">
              Connect Your Calendar
            </h2>
            <p className="mt-2 text-sm text-stone-500">
              Connect Google Calendar to sync 1:1 meetings and discover
              collaboration patterns.
            </p>
          </div>
          <div className="rounded-xl border border-stone-200 p-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-stone-100 text-xl">
              G
            </div>
            <p className="text-sm font-medium text-stone-800">
              Google Calendar
            </p>
            <p className="mt-1 text-xs text-stone-500">
              Automatically sync meeting schedules
            </p>
            <Link
              href="/dashboard/settings"
              className="mt-4 inline-block rounded-xl bg-stone-100 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-200 transition-colors"
            >
              Connect in Settings
            </Link>
          </div>
          <p className="text-center text-xs text-stone-400">
            You can always connect your calendar later from Settings.
          </p>
        </div>
      )}

      {/* Navigation buttons */}
      <div className="mt-8 flex items-center justify-between">
        {step > 0 ? (
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-stone-500 hover:text-stone-700 transition-colors"
          >
            Back
          </button>
        ) : (
          <div />
        )}
        <button
          type="button"
          onClick={handleNext}
          disabled={isPending || (step === 0 && !name.trim())}
          className="rounded-xl bg-forest shadow-[0_8px_20px_rgba(61,24,55,0.25)] px-6 py-2.5 text-sm font-semibold text-white hover:bg-forest-light transition-colors disabled:opacity-50"
        >
          {isPending
            ? "Saving..."
            : step === STEPS.length - 1
              ? "Get Started"
              : "Continue"}
        </button>
      </div>
    </div>
  );
}
