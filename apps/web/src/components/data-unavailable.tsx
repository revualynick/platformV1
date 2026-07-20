interface DataUnavailableProps {
  /** What failed, e.g. "your goals" — keeps the message specific. */
  what?: string;
}

/**
 * Rendered when a section's data failed to LOAD — deliberately distinct
 * from empty states, so an outage never masquerades as "no data yet".
 */
export function DataUnavailable({ what = "this section" }: DataUnavailableProps) {
  return (
    <div className="rounded-2xl border border-warning/30 bg-warning/[0.06] p-5 text-center">
      <p className="text-sm font-medium text-stone-700">
        We couldn't load {what} right now.
      </p>
      <p className="mt-1 text-xs text-stone-500">
        Refresh the page to try again — if this keeps happening, let your
        admin know.
      </p>
    </div>
  );
}
