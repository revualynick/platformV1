import Link from "next/link";

export function MarketingNav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-stone-200/40 bg-cream/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest text-white font-display text-base font-semibold">
            R
          </div>
          <span className="font-display text-xl font-semibold tracking-tight text-stone-900">
            Revualy
          </span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          <a
            href="/#how-it-works"
            className="text-sm font-medium text-stone-500 transition-colors hover:text-stone-900"
          >
            How It Works
          </a>
          <Link
            href="/features"
            className="text-sm font-medium text-stone-500 transition-colors hover:text-stone-900"
          >
            Features
          </Link>
          <Link
            href="/pricing"
            className="text-sm font-medium text-stone-500 transition-colors hover:text-stone-900"
          >
            Pricing
          </Link>
          <a
            href="/#faq"
            className="text-sm font-medium text-stone-500 transition-colors hover:text-stone-900"
          >
            FAQ
          </a>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/home"
            className="rounded-xl px-5 py-2.5 text-sm font-medium text-stone-600 transition-colors hover:text-stone-900"
          >
            Try Demo
          </Link>
          <Link
            href="/login"
            className="rounded-xl px-5 py-2.5 text-sm font-medium text-stone-600 transition-colors hover:text-stone-900"
          >
            Sign In
          </Link>
          <Link
            href="/pricing"
            className="rounded-xl bg-forest px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-forest-light hover:shadow-lg hover:shadow-forest/20"
          >
            Request Early Access
          </Link>
        </div>
      </div>
    </nav>
  );
}
