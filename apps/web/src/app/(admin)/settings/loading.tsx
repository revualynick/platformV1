export default function SettingsLoading() {
  return (
    <div className="max-w-6xl animate-pulse">
      {/* Header skeleton */}
      <div className="mb-10">
        <div className="h-4 w-28 rounded bg-stone-200" />
        <div className="mt-2 h-8 w-44 rounded bg-stone-200" />
      </div>

      {/* Settings sections */}
      <div className="space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-stone-200/60 bg-surface p-6">
            <div className="h-5 w-36 rounded bg-stone-200" />
            <div className="mt-1 h-3 w-56 rounded bg-stone-100" />
            <div className="mt-6 space-y-4">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="flex items-center justify-between rounded-xl bg-stone-50 px-4 py-3">
                  <div>
                    <div className="h-3.5 w-32 rounded bg-stone-200" />
                    <div className="mt-1.5 h-3 w-48 rounded bg-stone-100" />
                  </div>
                  <div className="h-6 w-10 rounded-full bg-stone-200" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
