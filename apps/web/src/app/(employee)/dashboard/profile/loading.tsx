export default function ProfileLoading() {
  return (
    <div className="max-w-5xl animate-pulse">
      <div className="mb-10">
        <div className="h-4 w-24 rounded bg-stone-200" />
        <div className="mt-2 h-8 w-32 rounded bg-stone-200" />
        <div className="mt-3 h-4 w-80 rounded bg-stone-100" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-72 rounded-2xl border border-stone-200/60 bg-surface" />
        <div className="h-72 rounded-2xl border border-stone-200/60 bg-surface" />
      </div>
    </div>
  );
}
