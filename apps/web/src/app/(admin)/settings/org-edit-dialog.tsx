"use client";

import { useState, useTransition } from "react";
import { updateOrg } from "./actions";

const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Vancouver",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
];

interface Props {
  initialName: string;
  initialTimezone: string;
  initialAllowedDomains: string[];
}

export function OrgEditDialog({ initialName, initialTimezone, initialAllowedDomains }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateOrg(formData);
      if (!result.ok) {
        setError(result.error);
      } else {
        setOpen(false);
      }
    });
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); setError(null); }}
        className="rounded-xl border border-stone-200 bg-surface px-4 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50"
      >
        Edit
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl p-6 shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto mx-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-lg font-semibold text-stone-900">
                Edit Organization
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-stone-600">
                  Organization Name
                </label>
                <input
                  name="name"
                  type="text"
                  required
                  defaultValue={initialName}
                  placeholder="Acme Corp"
                  className="w-full rounded-xl border border-stone-200 px-4 py-2.5 text-sm focus:border-forest focus:outline-none focus:ring-1 focus:ring-forest"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-stone-600">
                  Timezone
                </label>
                <select
                  name="timezone"
                  defaultValue={initialTimezone}
                  className="w-full rounded-xl border border-stone-200 px-4 py-2.5 text-sm focus:border-forest focus:outline-none focus:ring-1 focus:ring-forest"
                >
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-stone-600">
                  Allowed Email Domains
                </label>
                <input
                  name="allowedDomains"
                  type="text"
                  defaultValue={initialAllowedDomains.join(", ")}
                  placeholder="company.com, subsidiary.com"
                  className="w-full rounded-xl border border-stone-200 px-4 py-2.5 text-sm focus:border-forest focus:outline-none focus:ring-1 focus:ring-forest"
                />
                <p className="mt-1 text-[11px] text-stone-400">
                  Comma-separated list of domains allowed to sign in.
                </p>
              </div>

              {error && (
                <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">
                  {error}
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-xl bg-stone-100 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 rounded-xl bg-forest px-4 py-2 text-sm font-semibold text-white hover:bg-forest-light disabled:opacity-60"
                >
                  {isPending ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
