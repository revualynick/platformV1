"use client";

import { useState, useTransition } from "react";
import type { BetweenMeetingGoal } from "@/lib/api";
import type { ActionResult } from "@/lib/one-on-one-import-actions";
import { card, cardShadow, formatDate } from "./labels";

type Status = BetweenMeetingGoal["status"];

/**
 * Between-meeting goals: ongoing focus agreed in a 1:1, until the next one.
 * Only the two people in the 1:1 see these (the API enforces it).
 */
export function BetweenMeetingGoals({
  goals,
  names,
  viewerId,
  updateAction,
  title = "Between-meeting goals",
  showPerson = true,
}: {
  goals: BetweenMeetingGoal[];
  /** id -> name, to label whose 1:1 a goal came from. */
  names: Record<string, string>;
  viewerId: string;
  updateAction: (id: string, change: { text?: string; status?: Status }) => Promise<ActionResult>;
  title?: string;
  showPerson?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  const active = goals.filter((g) => g.status === "active");
  const closed = goals.filter((g) => g.status !== "active");

  function run(id: string, change: { text?: string; status?: Status }) {
    setError(null);
    startTransition(async () => {
      const result = await updateAction(id, change);
      if (!result.ok) setError(result.error);
      else setEditing(null);
    });
  }

  function other(g: BetweenMeetingGoal): string {
    const id = g.ownerId === viewerId ? g.counterpartId : g.ownerId;
    return names[id] ?? "";
  }

  function row(g: BetweenMeetingGoal) {
    const isEditing = editing === g.id;
    return (
      <li key={g.id} className="py-3">
        {isEditing ? (
          <div className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={500}
              className="flex-1 rounded-lg border border-stone-200 bg-surface px-3 py-1.5 text-sm text-stone-800 focus:border-forest/50 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => run(g.id, { text: draft })}
              disabled={isPending}
              className="rounded-lg bg-forest px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs text-stone-500"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className={`text-sm ${g.status === "active" ? "text-stone-800" : "text-stone-400 line-through"}`}>
                {g.text}
              </p>
              <p className="mt-0.5 text-xs text-stone-400">
                {showPerson && other(g) ? `With ${other(g)} · ` : ""}
                from {formatDate(g.createdAt)}
                {g.status === "done" ? " · done" : g.status === "dropped" ? " · dropped" : ""}
              </p>
            </div>
            <div className="flex gap-1.5 text-xs">
              {g.status === "active" ? (
                <>
                  <button type="button" disabled={isPending} onClick={() => run(g.id, { status: "done" })}
                    className="rounded-md border border-stone-200 px-2 py-1 text-forest hover:bg-forest/5 disabled:opacity-50">
                    Done
                  </button>
                  <button type="button" disabled={isPending} onClick={() => { setEditing(g.id); setDraft(g.text); }}
                    className="rounded-md border border-stone-200 px-2 py-1 text-stone-500 hover:bg-stone-50 disabled:opacity-50">
                    Edit
                  </button>
                  <button type="button" disabled={isPending} onClick={() => run(g.id, { status: "dropped" })}
                    className="rounded-md border border-stone-200 px-2 py-1 text-stone-500 hover:bg-stone-50 disabled:opacity-50">
                    Drop
                  </button>
                </>
              ) : (
                <button type="button" disabled={isPending} onClick={() => run(g.id, { status: "active" })}
                  className="rounded-md border border-stone-200 px-2 py-1 text-stone-500 hover:bg-stone-50 disabled:opacity-50">
                  Reopen
                </button>
              )}
            </div>
          </div>
        )}
      </li>
    );
  }

  return (
    <div className={card} style={cardShadow}>
      <h2 className="font-display text-base font-semibold text-stone-800">{title}</h2>
      <p className="mt-1 text-sm text-stone-500">
        Ongoing focus agreed in a 1:1, to work on until the next one. Only the two of you see these.
      </p>
      {active.length === 0 ? (
        <p className="mt-3 text-sm text-stone-400">No active goals.</p>
      ) : (
        <ul className="mt-2 divide-y divide-stone-100">{active.map(row)}</ul>
      )}
      {closed.length > 0 && (
        <div className="mt-2">
          <button type="button" onClick={() => setShowClosed((v) => !v)} className="text-xs text-stone-400 hover:text-stone-600">
            {showClosed ? "Hide" : "Show"} {closed.length} finished
          </button>
          {showClosed && <ul className="divide-y divide-stone-100">{closed.map(row)}</ul>}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
