"use client";

import { useRef, useState, useTransition } from "react";
import type { UploadOutcome } from "@/lib/api";
import { card, cardShadow } from "./labels";

type UploadResult = { ok: true; outcome: UploadOutcome } | { ok: false; error: string };

const ACCEPT = ".docx,.txt,.md,.pdf,.vtt,.html";

export function UploadNotes({
  counterparts,
  uploadAction,
}: {
  /** The people the uploader has 1:1s with (their reports, or their manager). */
  counterparts: Array<{ id: string; name: string }>;
  uploadAction: (formData: FormData) => Promise<UploadResult>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [counterpartId, setCounterpartId] = useState(counterparts.length === 1 ? counterparts[0].id : "");
  const [meetingDate, setMeetingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dragging, setDragging] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<UploadOutcome | null>(null);

  if (counterparts.length === 0) return null;

  function submit() {
    if (!file || !counterpartId) return;
    // Checked here too: over the server action body limit the server's own
    // check never runs and the upload fails silently (review finding 2026-09-28).
    if (file.size > 5 * 1024 * 1024) {
      setError("File is too large (5 MB limit)");
      return;
    }
    setError(null);
    setOutcome(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("counterpartId", counterpartId);
    fd.set("meetingDate", meetingDate);
    startTransition(async () => {
      const result = await uploadAction(fd);
      if (!result.ok) setError(result.error);
      else {
        setOutcome(result.outcome);
        setFile(null);
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  }

  return (
    <div className={card} style={cardShadow}>
      <h2 className="font-display text-base font-semibold text-stone-800">Upload 1:1 notes</h2>
      <p className="mt-1 text-sm text-stone-500">
        A Gemini notes export, a transcript or your own notes. The file is read once and not kept, and neither is its
        name. Only what's extracted is saved.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {counterparts.length > 1 && (
          <label className="text-xs text-stone-500">
            1:1 with
            <select
              value={counterpartId}
              onChange={(e) => setCounterpartId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-200 bg-surface px-3 py-2 text-sm text-stone-700 focus:border-forest/50 focus:outline-none"
            >
              <option value="">Choose a person</option>
              {counterparts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-xs text-stone-500">
          Date of the 1:1
          <input
            type="date"
            value={meetingDate}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setMeetingDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-200 bg-surface px-3 py-2 text-sm text-stone-700 focus:border-forest/50 focus:outline-none"
          />
        </label>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const dropped = e.dataTransfer.files[0];
          if (dropped) setFile(dropped);
        }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        role="button"
        tabIndex={0}
        className={`mt-3 cursor-pointer rounded-xl border-2 border-dashed px-4 py-6 text-center text-sm transition-colors ${
          dragging ? "border-forest bg-forest/5 text-forest" : "border-stone-200 text-stone-400 hover:border-forest/40"
        }`}
      >
        {file ? (
          <span className="text-stone-700">{file.name}</span>
        ) : (
          <span>Drop a file here, or click to choose (.docx, .txt, .pdf, .vtt, .html, up to 5 MB)</span>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={!file || !counterpartId || isPending}
          className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-white hover:bg-forest/90 disabled:opacity-50"
        >
          {isPending ? "Reading the notes..." : "Upload"}
        </button>
        {isPending && <span className="text-xs text-stone-400">This can take up to a minute.</span>}
      </div>

      {outcome && (
        <p className="mt-3 rounded-lg bg-forest/5 px-3 py-2 text-xs text-stone-700">
          Done: {outcome.tasks} task{outcome.tasks === 1 ? "" : "s"}, {outcome.focusAreas} between-meeting goal
          {outcome.focusAreas === 1 ? "" : "s"}, {outcome.suggestions} goal suggestion
          {outcome.suggestions === 1 ? "" : "s"}.
          {outcome.withheld > 0 &&
            ` ${outcome.withheld} item${outcome.withheld === 1 ? " was" : "s were"} held back as personal or sensitive.`}
        </p>
      )}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
