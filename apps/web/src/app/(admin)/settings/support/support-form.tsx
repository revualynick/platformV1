"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSupportSettingsAction } from "./actions";

const input = "mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 focus:border-forest focus:outline-none";
const label = "block text-xs font-medium uppercase tracking-wider text-stone-400";

export function SupportForm({
  people,
  initial,
}: {
  people: Array<{ id: string; name: string; email: string }>;
  initial: { supportContactId: string | null; supportBackupId: string | null; supportDetails: string; supportOutside: string };
}) {
  const router = useRouter();
  const [contact, setContact] = useState(initial.supportContactId ?? "");
  const [backup, setBackup] = useState(initial.supportBackupId ?? "");
  const [details, setDetails] = useState(initial.supportDetails);
  const [outside, setOutside] = useState(initial.supportOutside);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    if (backup && backup === contact) return setError("The backup must be a different person");
    if (backup && !contact) return setError("Choose a support contact before a backup");
    startTransition(async () => {
      const result = await saveSupportSettingsAction({
        supportContactId: contact || null,
        supportBackupId: backup || null,
        supportDetails: details.trim(),
        supportOutside: outside.trim(),
      });
      if (!result.ok) return setError(result.error);
      setSaved(true);
      router.refresh();
    });
  }

  const options = (
    <>
      <option value="">No one</option>
      {people.map((p) => (
        <option key={p.id} value={p.id}>{p.name} ({p.email})</option>
      ))}
    </>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="sp-contact" className={label}>Support contact</label>
          <select id="sp-contact" value={contact} onChange={(e) => setContact(e.target.value)} className={input}>{options}</select>
        </div>
        <div>
          <label htmlFor="sp-backup" className={label}>Backup</label>
          <select id="sp-backup" value={backup} onChange={(e) => setBackup(e.target.value)} className={input}>{options}</select>
        </div>
      </div>
      <div>
        <label htmlFor="sp-details" className={label}>Where to get support</label>
        <textarea
          id="sp-details"
          rows={3}
          maxLength={1000}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="In your own words, in line with your policy: your Employee Assistance Programme, mental health first aiders, HR."
          className={input}
        />
      </div>
      <div>
        <label htmlFor="sp-outside" className={label}>Support outside work (optional)</label>
        <textarea
          id="sp-outside"
          rows={2}
          maxLength={500}
          value={outside}
          onChange={(e) => setOutside(e.target.value)}
          placeholder="A line your safeguarding policy wants people to see when there may be a risk of harm, for example a helpline."
          className={input}
        />
        <p className="mt-1 text-xs text-stone-400">Only shown when the bot thinks someone may be at risk. Revualy never adds a helpline of its own.</p>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={isPending} className="rounded-xl bg-forest px-4 py-2.5 text-sm font-medium text-white hover:bg-forest-light disabled:opacity-50">
          {isPending ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-sm text-forest">Saved</span>}
      </div>
    </div>
  );
}
