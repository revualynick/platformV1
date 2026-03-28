export default function QuestionsLoading() {
  return (
    <div className="max-w-5xl animate-pulse">
      <div className="mb-10 flex items-start justify-between">
        <div>
          <div className="h-4 w-28 rounded bg-stone-200" />
          <div className="mt-2 h-8 w-36 rounded bg-stone-200" />
        </div>
        <div className="h-9 w-36 rounded-xl bg-stone-100" />
      </div>

      <div className="mb-10">
        <div className="mb-4 h-5 w-44 rounded bg-stone-200" />
        <div className="rounded-2xl border border-dashed border-stone-200 p-8">
          <div className="mx-auto h-4 w-64 rounded bg-stone-100" />
        </div>
      </div>

      <div>
        <div className="mb-4 h-5 w-40 rounded bg-stone-200" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-stone-200/60 bg-surface p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <div className="h-4 w-32 rounded bg-stone-200" />
                    <div className="h-5 w-20 rounded-full bg-stone-100" />
                  </div>
                  <div className="mt-2 h-3 w-16 rounded bg-stone-100" />
                  <div className="mt-3 space-y-1.5">
                    <div className="h-3 w-full rounded bg-stone-100" />
                    <div className="h-3 w-5/6 rounded bg-stone-100" />
                  </div>
                </div>
                <div className="h-5 w-14 rounded-full bg-stone-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
