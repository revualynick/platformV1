export default function TeamProfilesLoading() {
  return (
    <div className="max-w-6xl animate-pulse">
      <div className="mb-10">
        <div className="h-4 w-24 rounded bg-stone-200" />
        <div className="mt-2 h-8 w-40 rounded bg-stone-200" />
        <div className="mt-3 h-4 w-72 rounded bg-stone-100" />
      </div>

      <div className="space-y-8">
        <div className="h-64 rounded-2xl border border-stone-200/60 bg-surface" />
        <div className="h-80 rounded-2xl border border-stone-200/60 bg-surface" />
      </div>
    </div>
  );
}
