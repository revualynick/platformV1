export default function PeopleLoading() {
  return (
    <div className="max-w-6xl animate-pulse">
      <div className="mb-10 flex items-start justify-between">
        <div>
          <div className="h-4 w-20 rounded bg-stone-200" />
          <div className="mt-2 h-8 w-36 rounded bg-stone-200" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-28 rounded-xl bg-stone-100" />
          <div className="h-9 w-28 rounded-xl bg-stone-100" />
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-stone-200/60 bg-surface p-5">
            <div className="h-3 w-16 rounded bg-stone-100" />
            <div className="mt-3 h-6 w-8 rounded bg-stone-200" />
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-stone-200/60 bg-surface p-6">
        <div className="space-y-3">
          <div className="grid grid-cols-5 gap-4 border-b border-stone-100 pb-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-3 w-16 rounded bg-stone-100" />
            ))}
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="grid grid-cols-5 items-center gap-4 border-b border-stone-50 py-3 last:border-b-0">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-stone-100" />
                <div className="h-4 w-24 rounded bg-stone-200" />
              </div>
              <div className="h-3 w-36 rounded bg-stone-100" />
              <div className="h-5 w-20 rounded-full bg-stone-100" />
              <div className="h-3 w-24 rounded bg-stone-100" />
              <div className="flex gap-2">
                <div className="h-7 w-16 rounded-lg bg-stone-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
