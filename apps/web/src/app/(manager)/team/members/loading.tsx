export default function TeamMembersLoading() {
  return (
    <div className="max-w-6xl animate-pulse">
      <div className="mb-10">
        <div className="h-4 w-20 rounded bg-stone-200" />
        <div className="mt-2 h-8 w-40 rounded bg-stone-200" />
        <div className="mt-1 h-4 w-48 rounded bg-stone-100" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-stone-200/60 bg-surface p-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-stone-100" />
              <div>
                <div className="h-4 w-28 rounded bg-stone-200" />
                <div className="mt-1 h-3 w-24 rounded bg-stone-100" />
              </div>
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <div className="h-3 w-20 rounded bg-stone-100" />
                <div className="mt-1.5 h-6 w-10 rounded bg-stone-200" />
              </div>
              <div className="h-1.5 w-24 rounded-full bg-stone-100" />
            </div>
            <div className="mt-3 flex justify-end">
              <div className="h-3 w-20 rounded bg-stone-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
