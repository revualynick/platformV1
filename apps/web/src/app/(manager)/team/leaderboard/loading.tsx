export default function LeaderboardLoading() {
  return (
    <div className="max-w-5xl animate-pulse">
      <div className="mb-10">
        <div className="h-4 w-36 rounded bg-stone-200" />
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

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <div className="rounded-2xl border border-stone-200/60 bg-surface p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="h-4 w-20 rounded bg-stone-200" />
              <div className="h-3 w-24 rounded bg-stone-100" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 rounded-xl px-4 py-4">
                  <div className="h-8 w-8 rounded-full bg-stone-100" />
                  <div className="h-9 w-9 rounded-full bg-stone-100" />
                  <div className="flex-1">
                    <div className="h-4 w-28 rounded bg-stone-200" />
                    <div className="mt-1.5 h-3 w-40 rounded bg-stone-100" />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-1.5 w-16 rounded-full bg-stone-100" />
                    <div className="h-5 w-8 rounded bg-stone-200" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="rounded-2xl border border-stone-200/60 bg-surface p-6">
            <div className="mb-4 h-4 w-32 rounded bg-stone-200" />
            <div className="space-y-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i}>
                  <div className="mb-2 h-3 w-24 rounded bg-stone-100" />
                  <div className="space-y-1.5">
                    {Array.from({ length: 3 }).map((_, j) => (
                      <div key={j} className="flex items-center gap-3 rounded-lg px-3 py-2">
                        <div className="h-6 w-6 rounded-full bg-stone-100" />
                        <div className="flex-1 h-3 rounded bg-stone-100" />
                        <div className="h-4 w-8 rounded bg-stone-200" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
