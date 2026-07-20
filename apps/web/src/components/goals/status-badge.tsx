const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-stone-100 text-stone-500" },
  on_track: { label: "On track", className: "bg-positive/10 text-positive" },
  at_risk: { label: "At risk", className: "bg-warning/10 text-warning" },
  behind: { label: "Behind", className: "bg-danger/10 text-danger" },
  achieved: { label: "Achieved", className: "bg-forest/10 text-forest" },
  archived: { label: "Archived", className: "bg-stone-100 text-stone-400" },
};

export function GoalStatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.draft;
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${style.className}`}
    >
      {style.label}
    </span>
  );
}
