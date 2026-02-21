"use client";

import { useState, useTransition } from "react";

interface ScheduleSessionFormProps {
  employeeId: string;
  createAction: (formData: FormData) => Promise<{ error?: string; success?: boolean }>;
}

export function ScheduleSessionForm({ employeeId, createAction }: ScheduleSessionFormProps) {
  const [showForm, setShowForm] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!scheduledAt) return;
    setError(null);
    const fd = new FormData();
    fd.set("employeeId", employeeId);
    fd.set("scheduledAt", new Date(scheduledAt).toISOString());
    startTransition(async () => {
      const result = await createAction(fd);
      if (result.error) {
        setError(result.error);
      } else {
        setShowForm(false);
        setScheduledAt("");
      }
    });
  };

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="w-full rounded-2xl border-2 border-dashed border-stone-200 bg-surface/50 py-4 text-sm font-medium text-stone-400 transition-all hover:border-forest/30 hover:text-forest"
      >
        + Schedule New Session
      </button>
    );
  }

  return (
    <div
      className="rounded-2xl border border-stone-200/60 bg-surface p-5"
      style={{ boxShadow: "var(--shadow-sm)" }}
    >
      <h3 className="mb-3 text-sm font-medium text-stone-700">Schedule a new 1:1</h3>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-xs text-stone-500">Date &amp; Time</label>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-700 focus:border-forest/50 focus:outline-none"
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={!scheduledAt || isPending}
          className="rounded-lg bg-forest shadow-[0_8px_20px_rgba(61,24,55,0.25)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-forest/90 disabled:opacity-50"
        >
          Schedule
        </button>
        <button
          onClick={() => { setShowForm(false); setError(null); }}
          className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium text-stone-500 transition-colors hover:bg-stone-50"
        >
          Cancel
        </button>
      </div>
      {error && (
        <p className="mt-2 text-xs text-danger">{error}</p>
      )}
    </div>
  );
}
