import Link from "next/link";

export function MarketingFooter() {
  return (
    <footer className="bg-stone-900 text-stone-300">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-12 md:grid-cols-4">
          {/* Brand */}
          <div className="md:col-span-1">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 font-display text-sm font-semibold text-white">
                R
              </div>
              <span className="font-display text-lg font-semibold text-white">
                Revualy
              </span>
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-stone-400">
              AI-powered peer review that maps feedback to your company
              values. Built for teams that care about culture.
            </p>
          </div>

          {/* Product */}
          <div>
            <p className="text-xs font-semibold tracking-wider text-stone-500 uppercase">
              Product
            </p>
            <ul className="mt-4 space-y-3">
              {[
                { label: "How It Works", href: "/#how-it-works" },
                { label: "Features", href: "/features" },
                { label: "Early Access", href: "/pricing" },
                { label: "FAQ", href: "/#faq" },
                { label: "Changelog", href: "#" },
              ].map((link) => (
                <li key={link.label}>
                  {link.href.startsWith("/") ? (
                    <Link
                      href={link.href}
                      className="text-sm text-stone-400 transition-colors hover:text-white"
                    >
                      {link.label}
                    </Link>
                  ) : (
                    <a
                      href={link.href}
                      className="text-sm text-stone-400 transition-colors hover:text-white"
                    >
                      {link.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <p className="text-xs font-semibold tracking-wider text-stone-500 uppercase">
              Company
            </p>
            <ul className="mt-4 space-y-3">
              {[
                { label: "About", href: "/about" },
                { label: "Blog", href: "#" },
                { label: "Careers", href: "#" },
                { label: "Contact", href: "mailto:nick@revualy.com" },
              ].map((link) => (
                <li key={link.label}>
                  {link.href.startsWith("/") ? (
                    <Link
                      href={link.href}
                      className="text-sm text-stone-400 transition-colors hover:text-white"
                    >
                      {link.label}
                    </Link>
                  ) : (
                    <a
                      href={link.href}
                      className="text-sm text-stone-400 transition-colors hover:text-white"
                    >
                      {link.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <p className="text-xs font-semibold tracking-wider text-stone-500 uppercase">
              Legal
            </p>
            <ul className="mt-4 space-y-3">
              {[
                { label: "Privacy Policy", href: "/privacy" },
                { label: "Terms of Service", href: "/terms" },
                { label: "Security", href: "#" },
              ].map((link) => (
                <li key={link.label}>
                  {link.href.startsWith("/") ? (
                    <Link
                      href={link.href}
                      className="text-sm text-stone-400 transition-colors hover:text-white"
                    >
                      {link.label}
                    </Link>
                  ) : (
                    <a
                      href={link.href}
                      className="text-sm text-stone-400 transition-colors hover:text-white"
                    >
                      {link.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-stone-800 pt-8 md:flex-row">
          <p className="text-xs text-stone-500">
            &copy; 2026 Revualy. All rights reserved.
          </p>
          <p className="text-xs text-stone-600">
            Built for teams that value feedback.
          </p>
        </div>
      </div>
    </footer>
  );
}
