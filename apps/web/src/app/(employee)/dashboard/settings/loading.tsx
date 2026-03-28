export default function DashboardSettingsLoading() {
  return (
    <div className="animate-pulse">
      <div className="rounded-2xl border border-stone-200/80 bg-surface p-6 shadow-sm">
        <div className="h-5 w-48 rounded bg-stone-200" />
        <div className="mt-1 h-4 w-64 rounded bg-stone-100" />
        <div className="mt-6 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between rounded-xl bg-stone-50 px-4 py-3">
              <div>
                <div className="h-3.5 w-32 rounded bg-stone-200" />
                <div className="mt-1.5 h-3 w-56 rounded bg-stone-100" />
              </div>
              <div className="h-6 w-10 rounded-full bg-stone-200" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
