export default function OneOnOnesLoading() {
  return (
    <div className="max-w-3xl animate-pulse">
      <div className="mb-8">
        <div className="h-7 w-36 rounded bg-stone-200" />
        <div className="mt-1 h-4 w-48 rounded bg-stone-100" />
      </div>

      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-stone-200/60 bg-surface p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="h-4 w-24 rounded bg-stone-200" />
                <div className="mt-1.5 h-3 w-32 rounded bg-stone-100" />
              </div>
              <div className="h-6 w-16 rounded-full bg-stone-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
