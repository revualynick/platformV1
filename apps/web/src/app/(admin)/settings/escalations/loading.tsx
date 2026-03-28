export default function EscalationsLoading() {
  return (
    <div className="max-w-5xl animate-pulse">
      <div className="mb-10">
        <div className="h-4 w-24 rounded bg-stone-200" />
        <div className="mt-2 h-8 w-44 rounded bg-stone-200" />
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-stone-200/60 bg-surface p-5">
            <div className="h-3 w-16 rounded bg-stone-100" />
            <div className="mt-3 h-6 w-8 rounded bg-stone-200" />
            <div className="mt-3 h-3 w-20 rounded bg-stone-100" />
          </div>
        ))}
      </div>

      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-stone-200/60 bg-surface p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-stone-200" />
                  <div className="h-3 w-16 rounded bg-stone-200" />
                  <div className="h-3 w-20 rounded bg-stone-100" />
                  <div className="h-5 w-16 rounded-full bg-stone-100" />
                </div>
                <div className="mt-3 h-4 w-40 rounded bg-stone-200" />
                <div className="mt-2 h-3 w-full rounded bg-stone-100" />
                <div className="mt-4 rounded-lg bg-stone-50 p-3">
                  <div className="h-3 w-full rounded bg-stone-100" />
                  <div className="mt-1.5 h-3 w-3/4 rounded bg-stone-100" />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <div className="h-7 w-24 rounded-lg bg-stone-100" />
                <div className="h-7 w-24 rounded-lg bg-stone-100" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
