import Link from "next/link";

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Background layers */}
      <div className="absolute inset-0 bg-gradient-to-br from-cream via-cream to-cream-dark" />
      <div className="absolute inset-0 dot-grid opacity-40" />

      {/* Decorative shapes */}
      <div className="absolute -right-32 -top-32 h-[500px] w-[500px] rounded-full bg-forest/[0.03] blur-3xl" />
      <div className="absolute -left-20 top-1/2 h-[400px] w-[400px] rounded-full bg-terracotta/[0.04] blur-3xl" />
      <div className="absolute -bottom-40 right-1/4 h-[600px] w-[600px] rounded-full bg-amber/[0.05] blur-3xl" />

      {/* Navigation */}
      <nav className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest text-white font-display text-base font-semibold">
            R
          </div>
          <span className="font-display text-xl font-semibold tracking-tight text-stone-900">
            Revualy
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard"
            className="rounded-xl px-5 py-2.5 text-sm font-medium text-stone-600 transition-colors hover:text-stone-900"
          >
            Demo
          </Link>
          <Link
            href="/dashboard"
            className="rounded-xl bg-forest px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-forest-light hover:shadow-lg hover:shadow-forest/20"
          >
            Sign In
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="relative z-10 mx-auto max-w-6xl px-6">
        <div className="pb-20 pt-24 md:pt-32">
          {/* Eyebrow */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-forest/10 bg-forest/[0.04] px-4 py-1.5">
            <span className="h-2 w-2 rounded-full bg-forest-light animate-pulse" />
            <span className="text-xs font-medium tracking-wide text-forest">
              Peer review, reimagined
            </span>
          </div>

          {/* Headline */}
          <h1 className="max-w-3xl font-display text-5xl font-semibold leading-[1.12] tracking-tight text-stone-900 md:text-7xl md:leading-[1.08]">
            Feedback that{" "}
            <span className="relative">
              actually
              <svg
                className="absolute -bottom-1 left-0 w-full"
                viewBox="0 0 200 12"
                preserveAspectRatio="none"
              >
                <path
                  d="M2 8 C 40 2, 80 2, 100 6 S 160 12, 198 4"
                  stroke="#EA580C"
                  strokeWidth="3"
                  fill="none"
                  strokeLinecap="round"
                  opacity="0.6"
                />
              </svg>
            </span>{" "}
            maps to your values
          </h1>

          {/* Subheadline */}
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-stone-500 md:text-xl md:leading-relaxed">
            2&ndash;3 micro-interactions per week, delivered through the chat
            tools your team already uses. AI-powered analysis surfaces what
            matters — no annual reviews, no awkward forms.
          </p>

          {/* CTA */}
          <div className="mt-10 flex items-center gap-4">
            <Link
              href="/dashboard"
              className="group relative inline-flex items-center gap-2 rounded-2xl bg-forest px-7 py-4 text-sm font-semibold text-white transition-all hover:bg-forest-light hover:shadow-xl hover:shadow-forest/20"
            >
              Explore the Dashboard
              <svg
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
            <Link
              href="/team"
              className="rounded-2xl border border-stone-200 bg-white/60 px-7 py-4 text-sm font-semibold text-stone-700 backdrop-blur-sm transition-all hover:border-stone-300 hover:bg-white hover:shadow-md"
            >
              Manager View
            </Link>
          </div>

          {/* Stats strip */}
          <div className="mt-20 grid grid-cols-2 gap-x-12 gap-y-8 md:grid-cols-4">
            {[
              { value: "2-3", label: "Interactions per week", sub: "micro, not marathon" },
              { value: "1-5", label: "Messages each", sub: "quick and painless" },
              { value: "87%", label: "Response rate", sub: "because it's in chat" },
              { value: "<2min", label: "Time per interaction", sub: "respect for your time" },
            ].map((stat, i) => (
              <div
                key={stat.label}
                className="card-enter"
                style={{ animationDelay: `${i * 100 + 400}ms` }}
              >
                <p className="font-display text-3xl font-semibold text-stone-900 md:text-4xl">
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

        {/* Feature cards */}
        <section className="pb-32">
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                icon: "💬",
                title: "Chat-Native",
                description:
                  "Feedback happens in Slack, Google Chat, or Teams. No context switching, no new tools to learn. Conversations feel natural.",
                accent: "border-forest/20 bg-forest/[0.03]",
              },
              {
                icon: "🧠",
                title: "AI-Analyzed",
                description:
                  "Every interaction is scored for engagement quality, mapped to your company values, and checked for problematic patterns — automatically.",
                accent: "border-terracotta/20 bg-terracotta/[0.03]",
              },
              {
                icon: "📊",
                title: "Role-Based Insights",
                description:
                  "Employees see their growth. Managers see team health and coaching opportunities. HR sees the full picture with escalation feeds.",
                accent: "border-amber/20 bg-amber/[0.03]",
              },
            ].map((card, i) => (
              <div
                key={card.title}
                className={`card-enter rounded-2xl border p-8 ${card.accent} transition-shadow hover:shadow-lg`}
                style={{ animationDelay: `${i * 120 + 800}ms` }}
              >
                <span className="text-3xl">{card.icon}</span>
                <h3 className="mt-4 font-display text-xl font-semibold text-stone-900">
                  {card.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-500">
                  {card.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Dashboard preview section */}
        <section className="pb-32">
          <div className="text-center">
            <h2 className="font-display text-3xl font-semibold text-stone-900 md:text-4xl">
              Three dashboards, one platform
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-stone-500">
              Every role gets the view they need — no noise, no clutter.
            </p>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {[
              {
                role: "Employee",
                href: "/dashboard",
                description: "Track your engagement, review feedback you've received, celebrate kudos, and see your values radar.",
                color: "from-forest/10 to-forest/[0.02]",
                border: "border-forest/15",
              },
              {
                role: "Manager",
                href: "/team",
                description: "Monitor team health, review flagged interactions, see the leaderboard, and coach underperformers.",
                color: "from-forest-light/10 to-forest-light/[0.02]",
                border: "border-forest-light/15",
              },
              {
                role: "Admin / HR",
                href: "/settings",
                description: "Configure core values, manage the question bank, oversee escalations, and connect integrations.",
                color: "from-terracotta/10 to-terracotta/[0.02]",
                border: "border-terracotta/15",
              },
            ].map((dash) => (
              <Link
                key={dash.role}
                href={dash.href}
                className={`group rounded-2xl border ${dash.border} bg-gradient-to-b ${dash.color} p-8 transition-all hover:-translate-y-1 hover:shadow-xl`}
              >
                <h3 className="font-display text-lg font-semibold text-stone-900">
                  {dash.role}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-500">
                  {dash.description}
                </p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-forest-light transition-colors group-hover:text-forest">
                  Open dashboard
                  <svg
                    className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2.5}
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </span>
              </Link>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-stone-200/60 bg-white/40 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <span className="text-xs text-stone-400">
            Revualy &copy; 2026. Built for teams that value feedback.
          </span>
          <span className="text-xs text-stone-400">
            Phase 1 &mdash; Foundation
          </span>
        </div>
      </footer>
    </div>
  );
}
