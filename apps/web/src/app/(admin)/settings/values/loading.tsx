export default function ValuesLoading() {
  return (
    <div className="max-w-5xl animate-pulse">
      <div className="mb-10 flex items-start justify-between">
        <div>
          <div className="h-4 w-24 rounded bg-stone-200" />
          <div className="mt-2 h-8 w-36 rounded bg-stone-200" />
        </div>
        <div className="h-9 w-28 rounded-xl bg-stone-100" />
      </div>

      <div className="mb-8 grid gap-6 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-7">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-stone-200/60 bg-surface p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <div className="h-4 w-32 rounded bg-stone-200" />
                    <div className="h-5 w-14 rounded-full bg-stone-100" />
                  </div>
                  <div className="mt-2 h-3 w-64 rounded bg-stone-100" />
                </div>
                <div className="flex gap-2">
                  <div className="h-7 w-14 rounded-lg bg-stone-100" />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="lg:col-span-5">
          <div className="rounded-2xl border border-stone-200/60 bg-surface p-6">
            <div className="mb-4 h-4 w-28 rounded bg-stone-200" />
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i}>
                  <div className="flex justify-between">
                    <div className="h-3 w-20 rounded bg-stone-200" />
                    <div className="h-3 w-8 rounded bg-stone-100" />
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-stone-100" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
