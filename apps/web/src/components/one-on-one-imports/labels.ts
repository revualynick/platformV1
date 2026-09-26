import type { IngestionMode } from "@/lib/api";

export const MODE_LABEL: Record<IngestionMode, string> = {
  manual: "Manual",
  semi_automatic: "Semi-automatic",
  automatic: "Automatic",
};

export const MODE_DESCRIPTION: Record<IngestionMode, string> = {
  manual: "Nothing is read from your calendar. You upload notes or a transcript after a 1:1.",
  semi_automatic:
    "Revualy finds your 1:1s in Google Calendar and asks before reading anything. Once you approve, it reads the Gemini notes with your own Google access.",
  automatic:
    "Revualy reads Gemini notes from every 1:1 without asking, through an organisation-wide connection.",
};

export const STATUS_LABEL: Record<string, string> = {
  awaiting_approval: "Waiting for approval",
  declined: "Declined",
  pending_transcript: "Approved, waiting for Gemini notes",
  processing: "Processing",
  processed: "Done",
  transcript_missing: "No notes found",
  no_subject_match: "Couldn't match the other person",
  no_goals: "Nothing to extract",
  failed: "Failed",
};

export const SOURCE_LABEL: Record<string, string> = {
  calendar: "Calendar",
  automatic: "Automatic",
  upload: "Upload",
};

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export const card = "rounded-2xl border border-stone-200/60 bg-surface p-5";
export const cardShadow = { boxShadow: "var(--shadow-sm)" } as const;
