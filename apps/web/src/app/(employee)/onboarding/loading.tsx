export default function OnboardingLoading() {
  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="w-full max-w-lg animate-pulse">
        <div className="rounded-2xl border border-stone-200/60 bg-surface p-8">
          <div className="mb-2 h-4 w-20 rounded bg-stone-100" />
          <div className="h-7 w-48 rounded bg-stone-200" />
          <div className="mt-2 h-4 w-64 rounded bg-stone-100" />
          <div className="mt-8 space-y-4">
            <div className="h-10 rounded-xl bg-stone-100" />
            <div className="h-10 rounded-xl bg-stone-100" />
            <div className="h-10 rounded-xl bg-stone-100" />
          </div>
          <div className="mt-6 h-10 rounded-xl bg-stone-200" />
        </div>
      </div>
    </div>
  );
}
