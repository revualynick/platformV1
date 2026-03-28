export default function IntegrationsLoading() {
  return (
    <div className="max-w-5xl animate-pulse">
      <div className="mb-10">
        <div className="h-4 w-24 rounded bg-stone-200" />
        <div className="mt-2 h-8 w-44 rounded bg-stone-200" />
        <div className="mt-2 h-4 w-72 rounded bg-stone-100" />
      </div>

      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-stone-200/60 bg-surface p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-xl bg-stone-100" />
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <div className="h-4 w-24 rounded bg-stone-200" />
                    <div className="h-5 w-20 rounded-full bg-stone-100" />
                  </div>
                  <div className="mt-2 h-3 w-80 rounded bg-stone-100" />
                  <div className="mt-1.5 h-3 w-64 rounded bg-stone-100" />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="h-8 w-24 rounded-xl bg-stone-100" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
