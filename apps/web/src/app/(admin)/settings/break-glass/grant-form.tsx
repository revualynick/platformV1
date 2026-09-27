"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createGrantAction } from "./actions";

const input = "mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 focus:border-forest focus:outline-none";
const label = "block text-xs font-medium uppercase tracking-wider text-stone-400";

export function GrantForm({ people, today, defaultStart }: { people: Array<{ id: string; name: string; email: string }>; today: string; defaultStart: string }) {
  const router = useRouter();
  const [subjectId, setSubjectId] = useState("");
  const [reason, setReason] = useState("");
  const [periodStart, setPeriodStart] = useState(defaultStart);
  const [periodEnd, setPeriodEnd] = useState(today);
  const [days, setDays] = useState(14);
  const [hold, setHold] = useState(false);
  const [holdReason, setHoldReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    if (!subjectId) return setError("Choose a person");
    if (reason.trim().length < 20) return setError("Give a reason of at least 20 characters");
    if (hold && holdReason.trim().length < 20) return setError("Give a hold reason of at least 20 characters");
    startTransition(async () => {
      const result = await createGrantAction({
        subjectId,
        reason: reason.trim(),
        periodStart,
        periodEnd,
        days,
        holdReason: hold ? holdReason.trim() : undefined,
      });
      if (!result.ok) return setError(result.error);
      setSubjectId("");
      setReason("");
      setHold(false);
      setHoldReason("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="bg-subject" className={label}>Person</label>
        <select id="bg-subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className={input}>
          <option value="">Choose a person</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.email})</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="bg-reason" className={label}>Reason</label>
        <textarea
          id="bg-reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="The formal process this is for, with its reference (for example a grievance or conduct case number)"
          className={input}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="bg-start" className={label}>Period from</label>
          <input id="bg-start" type="date" value={periodStart} max={periodEnd} onChange={(e) => setPeriodStart(e.target.value)} className={input} />
        </div>
        <div>
          <label htmlFor="bg-end" className={label}>Period to</label>
          <input id="bg-end" type="date" value={periodEnd} max={today} onChange={(e) => setPeriodEnd(e.target.value)} className={input} />
        </div>
        <div>
          <label htmlFor="bg-days" className={label}>Access for</label>
          <select id="bg-days" value={days} onChange={(e) => setDays(Number(e.target.value))} className={input}>
            {[1, 7, 14, 30].map((d) => (
              <option key={d} value={d}>{d === 1 ? "1 day" : `${d} days`}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="flex items-center gap-2 text-sm text-stone-600">
          <input type="checkbox" checked={hold} onChange={(e) => setHold(e.target.checked)} />
          Don&apos;t tell the person yet (hold)
        </label>
        {hold && (
          <textarea
            aria-label="Hold reason"
            rows={2}
            value={holdReason}
            onChange={(e) => setHoldReason(e.target.value)}
            placeholder="Why telling them now would harm the process"
            className={input}
          />
        )}
        <p className="mt-1 text-xs text-stone-400">
          A hold ends when you lift it or when access ends. The person is always told in the end.
        </p>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={isPending}
        className="rounded-xl bg-forest px-4 py-2.5 text-sm font-medium text-white hover:bg-forest-light disabled:opacity-50"
      >
        {isPending ? "Opening…" : "Open access"}
      </button>
    </div>
  );
}
