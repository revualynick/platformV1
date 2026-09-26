/**
 * Marks feedback from a conversation that ended before every question was
 * answered (it went quiet, or the person said "stop"). Shown so nobody
 * over-reads it; partial feedback is also kept out of quality averages.
 */
export function PartialBadge() {
  return (
    <span
      className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-stone-500"
      title="The conversation ended before every question was answered"
    >
      Partial
    </span>
  );
}
