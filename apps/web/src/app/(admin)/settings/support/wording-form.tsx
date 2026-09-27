"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSupportWordingAction, signOffSupportWordingAction } from "./actions";

const input = "mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 focus:border-forest focus:outline-none";
const label = "block text-xs font-medium uppercase tracking-wider text-stone-400";
const button = "rounded-xl bg-forest px-4 py-2.5 text-sm font-medium text-white hover:bg-forest-light disabled:opacity-50";

type Result = { ok: true } | { ok: false; error: string };

export function WordingForm({
  wording,
  defaults,
  placeholders,
}: {
  wording: { support: string; conduct: string };
  defaults: { support: string; conduct: string };
  placeholders: string[];
}) {
  const router = useRouter();
  const [support, setSupport] = useState(wording.support || defaults.support);
  const [conduct, setConduct] = useState(wording.conduct || defaults.conduct);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function run(data: { support: string; conduct: string }) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      // Text identical to the default is stored as "use the default", so later default improvements still reach it.
      const result: Result = await saveSupportWordingAction({
        support: data.support.trim() === defaults.support ? "" : data.support.trim(),
        conduct: data.conduct.trim() === defaults.conduct ? "" : data.conduct.trim(),
      });
      if (!result.ok) return setError(result.error);
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-stone-500">
        Placeholders: {placeholders.join(", ")}. {"{outside}"} only appears when there may be a risk of harm.
      </p>
      <div>
        <label htmlFor="wd-support" className={label}>When someone may be struggling or at risk</label>
        <textarea id="wd-support" rows={4} maxLength={1200} value={support} onChange={(e) => setSupport(e.target.value)} className={input} />
      </div>
      <div>
        <label htmlFor="wd-conduct" className={label}>When someone reports a colleague&apos;s behaviour</label>
        <textarea id="wd-conduct" rows={3} maxLength={1200} value={conduct} onChange={(e) => setConduct(e.target.value)} className={input} />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={isPending} onClick={() => run({ support, conduct })} className={button}>
          {isPending ? "Saving…" : "Save wording"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            setSupport(defaults.support);
            setConduct(defaults.conduct);
            run({ support: defaults.support, conduct: defaults.conduct });
          }}
          className="text-sm font-medium text-stone-500 hover:text-stone-700 disabled:opacity-50"
        >
          Use Revualy&apos;s defaults
        </button>
        {saved && <span className="text-sm text-forest">Saved</span>}
      </div>
    </div>
  );
}

/** `hash` fingerprints the previews on the page: the sign-off covers exactly those. */
export function SignOffForm({ hash }: { hash: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    if (name.trim().length < 2 || role.trim().length < 2) return setError("Give the name and role of the person who signed it off");
    startTransition(async () => {
      const result = await signOffSupportWordingAction({ name: name.trim(), role: role.trim(), hash });
      if (!result.ok) return setError(result.error);
      setName("");
      setRole("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="so-name" className={label}>Signed off by</label>
          <input id="so-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className={input} />
        </div>
        <div>
          <label htmlFor="so-role" className={label}>Their role</label>
          <input id="so-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Head of People" className={input} />
        </div>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button type="button" disabled={isPending} onClick={submit} className={button}>
        {isPending ? "Recording…" : "Record sign-off"}
      </button>
    </div>
  );
}
