"use client";

import { useTransition } from "react";
import { togglePreference } from "./actions";

interface PrefItem {
  type: string;
  label: string;
  description: string;
  enabled: boolean;
  channel: string;
}

export function PreferenceToggles({ items }: { items: PrefItem[] }) {
  return (
    <div className="divide-y divide-stone-100">
      {items.map((item) => (
        <ToggleRow key={item.type} item={item} />
      ))}
    </div>
  );
}

function ToggleRow({ item }: { item: PrefItem }) {
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    startTransition(async () => {
      await togglePreference(item.type, !item.enabled, item.channel);
    });
  }

  return (
    <div className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1 pr-4">
        <p className="text-sm font-medium text-stone-800">{item.label}</p>
        <p className="mt-0.5 text-xs text-stone-500">{item.description}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-stone-400">Email</span>
        <button
          type="button"
          role="switch"
          aria-checked={item.enabled}
          disabled={isPending}
          onClick={handleToggle}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-forest/30 focus:ring-offset-2 disabled:opacity-50 ${
            item.enabled ? "bg-forest" : "bg-stone-200"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
              item.enabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    </div>
  );
}
