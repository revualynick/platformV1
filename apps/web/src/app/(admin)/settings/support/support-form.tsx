"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSupportSettingsAction } from "./actions";

const input = "mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 focus:border-forest focus:outline-none";
const label = "block text-xs font-medium uppercase tracking-wider text-stone-400";

export function SupportForm({ initial }: { initial: { supportContact: string; supportDetails: string; supportOutside: string } }) {
  const router = useRouter();
  const [contact, setContact] = useState(initial.supportContact);
  const [details, setDetails] = useState(initial.supportDetails);
  const [outside, setOutside] = useState(initial.supportOutside);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveSupportSettingsAction({
        supportContact: contact.trim(),
        supportDetails: details.trim(),
        supportOutside: outside.trim(),
      });
      if (!result.ok) return setError(result.error);
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="sp-contact" className={label}>Who to reach out to</label>
        <input
          id="sp-contact"
          value={contact}
          maxLength={300}
          onChange={(e) => setContact(e.target.value)}
          placeholder="A person or team, with how to reach them, e.g. Jo Patel in the People Team (jo@acme.com)"
          className={input}
        />
      </div>
      <div>
        <label htmlFor="sp-details" className={label}>Where to get support</label>
        <textarea
          id="sp-details"
          rows={3}
          maxLength={1000}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="In your own words, in line with your policy: your Employee Assistance Programme, mental health first aiders."
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
        <p className="mt-1 text-xs text-stone-400">Only shown when there may be a risk of harm. Revualy never adds a helpline of its own.</p>
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
