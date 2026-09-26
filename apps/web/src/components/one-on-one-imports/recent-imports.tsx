import type { RecentImport } from "@/lib/api";
import { SOURCE_LABEL, STATUS_LABEL, card, cardShadow, formatDate } from "./labels";

/** Recent imports the viewer took part in: status only, never content. */
export function RecentImports({
  imports,
  viewerId,
  names,
}: {
  imports: RecentImport[];
  viewerId: string;
  /** id -> name for the other person when the viewer is the report. */
  names: Record<string, string>;
}) {
  return (
    <div className={card} style={cardShadow}>
      <h2 className="font-display text-base font-semibold text-stone-800">Recent imports</h2>
      {imports.length === 0 ? (
        <p className="mt-3 text-sm text-stone-400">No 1:1 notes imported yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-stone-100">
          {imports.map((imp) => {
            const other =
              imp.organizerId === viewerId ? imp.subjectName ?? "Unmatched" : names[imp.organizerId] ?? "Your manager";
            return (
              <li key={imp.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span className="text-stone-700">
                  {other} <span className="text-stone-400">· {formatDate(imp.eventStart)}</span>
                </span>
                <span className="flex items-center gap-2 text-xs">
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-500">
                    {SOURCE_LABEL[imp.source] ?? imp.source}
                  </span>
                  <span className={imp.status === "failed" ? "text-danger" : "text-stone-500"}>
                    {STATUS_LABEL[imp.status] ?? imp.status}
                  </span>
                  {imp.withheldCount > 0 && (
                    <span className="text-stone-400" title="Items held back as wellbeing, conduct or safety">
                      {imp.withheldCount} held back
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
