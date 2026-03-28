export default function ReflectionsLoading() {
  return (
    <div className="max-w-5xl animate-pulse">
      <div className="mb-10">
        <div className="h-4 w-28 rounded bg-stone-200" />
        <div className="mt-2 h-8 w-36 rounded bg-stone-200" />
        <div className="mt-2 h-3 w-80 rounded bg-stone-100" />
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-stone-200/60 bg-surface p-5">
            <div className="h-3 w-20 rounded bg-stone-100" />
            <div className="mt-3 h-6 w-12 rounded bg-stone-200" />
            <div className="mt-3 h-3 w-16 rounded bg-stone-100" />
          </div>
        ))}
      </div>

      <div className="mb-8 rounded-2xl border border-stone-200/60 bg-surface p-6">
        <div className="mb-4 h-4 w-32 rounded bg-stone-200" />
        <div className="flex gap-1">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-2">
              <div className="h-10 w-10 rounded-xl bg-stone-100" />
              <div className="h-3 w-8 rounded bg-stone-100" />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-stone-200/60 bg-surface">
            <div className="flex items-center justify-between border-b border-stone-100 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="h-4 w-32 rounded bg-stone-200" />
                <div className="h-5 w-20 rounded-full bg-stone-100" />
              </div>
              <div className="h-4 w-16 rounded bg-stone-100" />
            </div>
            <div className="grid gap-0 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="border-b border-stone-100 p-6 last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0">
                  <div className="mb-2 h-3 w-16 rounded bg-stone-100" />
                  <div className="h-3 w-full rounded bg-stone-100" />
                  <div className="mt-1.5 h-3 w-3/4 rounded bg-stone-100" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
