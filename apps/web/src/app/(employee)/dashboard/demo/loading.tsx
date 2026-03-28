export default function DemoLoading() {
  return (
    <div className="max-w-5xl animate-pulse">
      <div className="mb-10">
        <div className="h-4 w-24 rounded bg-stone-200" />
        <div className="mt-2 h-8 w-40 rounded bg-stone-200" />
      </div>
      <div className="space-y-4">
        <div className="h-48 rounded-2xl bg-stone-100" />
        <div className="h-32 rounded-2xl bg-stone-100" />
      </div>
    </div>
  );
}
