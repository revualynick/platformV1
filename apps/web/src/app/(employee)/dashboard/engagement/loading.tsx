export default function EngagementLoading() {
  return (
    <div className="max-w-5xl animate-pulse">
      <div className="mb-10">
        <div className="h-4 w-32 rounded bg-stone-200" />
        <div className="mt-2 h-8 w-48 rounded bg-stone-200" />
      </div>

      <div className="mb-8 grid gap-6 lg:grid-cols-12">
        <div className="flex flex-col items-center justify-center rounded-2xl border border-stone-200/60 bg-surface p-8 lg:col-span-4">
          <div className="h-28 w-28 rounded-full bg-stone-100" />
          <div className="mt-4 h-5 w-16 rounded-full bg-stone-100" />
          <div className="mt-3 h-3 w-20 rounded bg-stone-100" />
        </div>
        <div className="grid grid-cols-2 gap-4 lg:col-span-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-stone-200/60 bg-surface p-5">
              <div className="h-3 w-20 rounded bg-stone-100" />
              <div className="mt-3 h-6 w-12 rounded bg-stone-200" />
              <div className="mt-3 h-3 w-24 rounded bg-stone-100" />
            </div>
          ))}
        </div>
      </div>

      <div className="mb-8 rounded-2xl border border-stone-200/60 bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="h-4 w-24 rounded bg-stone-200" />
          <div className="h-3 w-16 rounded bg-stone-100" />
        </div>
        <div className="h-[300px] rounded-2xl bg-stone-50" />
      </div>

      <div className="rounded-2xl border border-stone-200/60 bg-surface p-6">
        <div className="mb-4 h-4 w-36 rounded bg-stone-200" />
        <div className="border-b border-stone-100 pb-3">
          <div className="grid grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-3 w-12 rounded bg-stone-100" />
            ))}
          </div>
        </div>
        <div className="space-y-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="grid grid-cols-6 items-center gap-4 border-b border-stone-50 py-3.5 last:border-b-0">
              {Array.from({ length: 6 }).map((_, j) => (
                <div key={j} className="h-4 w-14 rounded bg-stone-100" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
