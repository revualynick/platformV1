export default function HomeLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-10 text-center">
        <div className="mx-auto h-4 w-32 rounded bg-stone-200" />
        <div className="mx-auto mt-3 h-9 w-64 rounded bg-stone-200" />
        <div className="mx-auto mt-2 h-4 w-80 rounded bg-stone-100" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-stone-200/60 bg-surface p-6">
            <div className="h-5 w-20 rounded bg-stone-200" />
            <div className="mt-2 h-3 w-full rounded bg-stone-100" />
            <div className="mt-1.5 h-3 w-4/5 rounded bg-stone-100" />
            <div className="mt-6 space-y-2">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="h-3 w-28 rounded bg-stone-100" />
              ))}
            </div>
            <div className="mt-6 h-9 w-full rounded-xl bg-stone-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
