interface GoalProgressBarProps {
  percent: number;
  status?: string;
  /** Optional secondary marker, e.g. children's alignment aggregate. */
  alignmentPercent?: number | null;
}

function barColor(status?: string): string {
  switch (status) {
    case "at_risk":
      return "bg-warning";
    case "behind":
      return "bg-danger";
    case "achieved":
      return "bg-forest";
    case "draft":
    case "archived":
      return "bg-stone-300";
    default:
      return "bg-forest-muted";
  }
}

export function GoalProgressBar({
  percent,
  status,
  alignmentPercent,
}: GoalProgressBarProps) {
  const clamped = Math.min(Math.max(percent, 0), 100);
  return (
    <div className="flex items-center gap-3">
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-stone-200"
      >
        <div
          className={`h-full rounded-full transition-all ${barColor(status)}`}
          style={{ width: `${clamped}%` }}
        />
        {alignmentPercent !== null && alignmentPercent !== undefined && (
          <div
            role="img"
            aria-label={`Alignment ${alignmentPercent}%`}
            className="absolute top-0 h-full w-0.5 bg-forest-light"
            style={{ left: `${Math.min(Math.max(alignmentPercent, 0), 100)}%` }}
            title={`Alignment: ${alignmentPercent}%`}
          />
        )}
      </div>
      <span className="w-9 text-right text-xs font-semibold tabular-nums text-stone-600">
        {clamped}%
      </span>
    </div>
  );
}
