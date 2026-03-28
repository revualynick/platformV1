export default function TeamFeedbackLoading() {
  return (
    <div className="max-w-6xl animate-pulse">
      <div className="mb-10">
        <div className="h-4 w-28 rounded bg-stone-200" />
        <div className="mt-2 h-8 w-40 rounded bg-stone-200" />
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-stone-200/60 bg-surface p-5">
            <div className="h-3 w-20 rounded bg-stone-100" />
            <div className="mt-3 h-6 w-12 rounded bg-stone-200" />
            <div className="mt-3 h-3 w-24 rounded bg-stone-100" />
          </div>
        ))}
      </div>

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-stone-200/60 bg-surface p-6">
          <div className="mb-4 h-4 w-32 rounded bg-stone-200" />
          <div className="h-48 rounded bg-stone-50" />
        </div>
        <div className="rounded-2xl border border-stone-200/60 bg-surface p-6">
          <div className="mb-4 h-4 w-36 rounded bg-stone-200" />
          <div className="h-48 rounded bg-stone-50" />
        </div>
      </div>

      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-stone-200/60 bg-surface p-6">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-stone-100" />
              <div className="h-4 w-32 rounded bg-stone-200" />
            </div>
            <div className="mt-4 h-3 w-full rounded bg-stone-100" />
            <div className="mt-2 h-3 w-3/4 rounded bg-stone-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
