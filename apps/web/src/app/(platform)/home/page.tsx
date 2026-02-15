import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Home",
};

const roles = [
  {
    role: "Employee",
    href: "/dashboard",
    description:
      "See your engagement score, feedback history, values radar, and upcoming interactions. Track how you're growing week over week.",
    color: "border-forest/15",
    gradient: "from-forest/[0.04] to-transparent",
    accent: "text-forest",
    badge: "bg-forest/[0.07] text-forest",
    icon: "M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z",
    features: ["Engagement score", "Feedback history", "Values radar", "Kudos"],
  },
  {
    role: "Manager",
    href: "/team",
    description:
      "Monitor team health and engagement trends. Review flagged interactions, see the leaderboard, and find coaching opportunities before they become problems.",
    color: "border-forest-light/15",
    gradient: "from-forest-light/[0.04] to-transparent",
    accent: "text-forest-light",
    badge: "bg-forest-light/[0.07] text-forest-light",
    icon: "M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z",
    features: ["Team health", "Flagged interactions", "Leaderboard", "Coaching"],
  },
  {
    role: "Admin",
    href: "/settings",
    description:
      "Configure your organization's core values and question bank. Manage people, oversee escalations, and connect chat platform integrations.",
    color: "border-terracotta/15",
    gradient: "from-terracotta/[0.04] to-transparent",
    accent: "text-terracotta",
    badge: "bg-terracotta/[0.07] text-terracotta",
    icon: "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
    features: ["Core values", "Question bank", "People", "Integrations"],
  },
];

export default async function HomePage() {
  const session = await auth();
  const isLoggedIn = !!session?.user;
  const firstName = session?.user?.name?.split(" ")[0];

  return (
    <div className="min-h-screen bg-cream">
      {/* Top bar */}
      <nav className="border-b border-stone-200/40 bg-cream/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest text-white font-display text-base font-semibold">
              R
            </div>
            <span className="font-display text-xl font-semibold tracking-tight text-stone-900">
              Revualy
            </span>
          </Link>
          <div className="flex items-center gap-3">
            {isLoggedIn ? (
              <div className="flex items-center gap-2 text-sm text-stone-500">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-forest/[0.07] text-xs font-medium text-forest">
                  {session.user?.name
                    ?.split(" ")
                    .map((n) => n[0])
                    .join("") ?? "U"}
                </div>
                <span className="font-medium text-stone-700">
                  {session.user?.name}
                </span>
              </div>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-xl px-5 py-2.5 text-sm font-medium text-stone-600 transition-colors hover:text-stone-900"
                >
                  Sign In
                </Link>
                <Link
                  href="/#pricing"
                  className="rounded-xl bg-forest px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-forest-light hover:shadow-lg hover:shadow-forest/20"
                >
                  Request Access
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-5xl px-6 py-16 md:py-24">
        {/* Welcome */}
        <div className="mb-16 max-w-2xl">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900 md:text-4xl">
            {isLoggedIn ? (
              <>Welcome back, {firstName}</>
            ) : (
              <>Explore Revualy</>
            )}
          </h1>
          <p className="mt-3 text-lg text-stone-500 leading-relaxed">
            {isLoggedIn
              ? "Pick up where you left off. Choose a view below to jump into your dashboards."
              : "See how continuous, chat-native feedback works in practice. Every dashboard below is fully interactive with sample data."}
          </p>
          {!isLoggedIn && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-forest/10 bg-forest/[0.04] px-4 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-forest-light animate-pulse" />
              <span className="text-xs font-medium text-forest">
                You&apos;re viewing demo data &mdash; no account needed
              </span>
            </div>
          )}
        </div>

        {/* Role cards */}
        <div className="grid gap-6 md:grid-cols-3">
          {roles.map((r, i) => (
            <Link
              key={r.role}
              href={r.href}
              className={`card-enter group relative flex flex-col rounded-2xl border ${r.color} bg-gradient-to-b ${r.gradient} p-8 transition-all hover:-translate-y-1 hover:shadow-xl`}
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl ${r.badge}`}
                >
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d={r.icon}
                    />
                  </svg>
                </div>
                <h2 className={`font-display text-xl font-semibold ${r.accent}`}>
                  {r.role}
                </h2>
              </div>

              <p className="mt-4 flex-1 text-sm leading-relaxed text-stone-500">
                {r.description}
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                {r.features.map((f) => (
                  <span
                    key={f}
                    className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-medium text-stone-500 border border-stone-200/60"
                  >
                    {f}
                  </span>
                ))}
              </div>

              <div
                className={`mt-6 inline-flex items-center gap-1.5 text-sm font-medium ${r.accent} transition-colors`}
              >
                {isLoggedIn ? "Open dashboard" : "Explore"}
                <svg
                  className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2.5}
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                  />
                </svg>
              </div>
            </Link>
          ))}
        </div>

        {/* Platform summary — bottom strip */}
        <div className="mt-16 rounded-2xl border border-stone-200/60 bg-white/60 p-8 backdrop-blur-sm">
          <div className="grid gap-8 md:grid-cols-4">
            {[
              { value: "2-3", label: "Interactions / week", sub: "Quick, chat-based" },
              { value: "<2min", label: "Per interaction", sub: "Respect for your time" },
              { value: "3", label: "Dashboard views", sub: "Employee, Manager, Admin" },
              { value: "AI", label: "Powered analysis", sub: "Values-mapped insights" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="font-display text-2xl font-semibold text-stone-900">
                  {stat.value}
                </p>
                <p className="mt-1 text-sm font-medium text-stone-600">
                  {stat.label}
                </p>
                <p className="text-xs text-stone-400">{stat.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
