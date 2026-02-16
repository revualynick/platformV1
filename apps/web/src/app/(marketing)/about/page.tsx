import type { Metadata } from "next";
import Link from "next/link";
import { ScrollReveal } from "@/components/scroll-reveal";

export const metadata: Metadata = {
  title: "About",
  description:
    "We're building the future of team feedback. Revualy replaces annual reviews with continuous, chat-native micro-interactions mapped to your company values.",
  openGraph: {
    title: "About | Revualy",
    description:
      "We're building the future of team feedback — continuous, chat-native, and values-aligned.",
    url: "https://revualy.com/about",
    siteName: "Revualy",
    locale: "en_US",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "About | Revualy",
    description:
      "We're building the future of team feedback — continuous, chat-native, and values-aligned.",
    images: ["/og-image.png"],
  },
  alternates: {
    canonical: "https://revualy.com/about",
  },
  robots: { index: true, follow: true },
};

const principles = [
  {
    title: "Values-first",
    description:
      "Every feature traces back to one question: does this help teams live their values? Feedback without cultural context is just noise. We map every interaction to the principles your organization actually cares about — so insights are meaningful, not generic.",
    accent: "forest" as const,
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
      </svg>
    ),
  },
  {
    title: "Chat-native, not chat-bolted",
    description:
      "We didn't build a dashboard and then add a Slack integration. We started in chat — where work and relationships already happen — and built outward. The result is feedback that flows as naturally as a direct message, because that's exactly what it is.",
    accent: "terracotta" as const,
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
      </svg>
    ),
  },
  {
    title: "Signal over noise",
    description:
      "Most feedback tools generate more data without generating more understanding. We focus on signal — the patterns, trends, and insights that actually help managers coach and help employees grow. Less dashboard clutter, more actionable intelligence.",
    accent: "amber" as const,
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
      </svg>
    ),
  },
];

const accentClasses = {
  forest: { bg: "bg-forest/[0.06]", text: "text-forest", border: "border-forest/10" },
  terracotta: { bg: "bg-terracotta/[0.06]", text: "text-terracotta", border: "border-terracotta/10" },
  amber: { bg: "bg-amber/[0.06]", text: "text-amber", border: "border-amber/10" },
};

export default function AboutPage() {
  return (
    <>
      {/* ========== HERO ========== */}
      <section className="relative overflow-hidden py-24 md:py-32">
        <div className="absolute inset-0 bg-gradient-to-b from-cream via-cream to-cream-dark/40" />
        <div className="absolute inset-0 dot-grid opacity-20" />

        {/* Decorative shapes */}
        <div className="pointer-events-none absolute -left-16 top-20 h-72 w-72 rounded-full bg-forest/[0.04]" />
        <div className="pointer-events-none absolute -right-12 bottom-10 h-56 w-56 rounded-full bg-terracotta/[0.03]" />

        <div className="relative z-10 mx-auto max-w-6xl px-6">
          <div className="max-w-3xl">
            <div
              className="hero-enter mb-6 inline-flex items-center gap-2.5 rounded-full border border-forest/10 bg-forest/[0.04] px-5 py-2"
              style={{ animationDelay: "0ms" }}
            >
              <span className="text-xs font-semibold tracking-wider text-forest uppercase">
                Our story
              </span>
            </div>

            <h1
              className="hero-enter font-display text-4xl font-semibold leading-[1.1] tracking-tight text-stone-900 sm:text-5xl md:text-7xl md:leading-[1.06]"
              style={{ animationDelay: "80ms" }}
            >
              We&apos;re building the future of team{" "}
              <span className="text-terracotta">feedback</span>
            </h1>

            <p
              className="hero-enter mt-6 max-w-xl text-lg leading-relaxed text-stone-500 md:text-xl md:leading-relaxed"
              style={{ animationDelay: "180ms" }}
            >
              Because annual reviews were designed for a world that no longer
              exists — and your team deserves better.
            </p>
          </div>
        </div>
      </section>

      {/* ========== PROBLEM / BELIEF ========== */}
      <section className="bg-forest py-24 md:py-32">
        <div className="mx-auto max-w-4xl px-6">
          <div className="grid gap-12 md:grid-cols-2">
            <div>
              <p className="text-xs font-semibold tracking-wider text-terracotta-light uppercase">
                The problem
              </p>
              <h2 className="mt-3 font-display text-2xl font-semibold text-white md:text-3xl">
                Annual reviews are broken
              </h2>
              <p className="mt-4 leading-relaxed text-white/70">
                They compress twelve months of work into a single, high-stakes
                conversation. Recency bias dominates. Feedback arrives too late
                to be actionable. Managers dread writing them. Employees dread
                reading them. And by the time anyone acts on the insights, the
                team has already changed.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold tracking-wider text-amber-light uppercase">
                Our belief
              </p>
              <h2 className="mt-3 font-display text-2xl font-semibold text-white md:text-3xl">
                Feedback should be continuous
              </h2>
              <p className="mt-4 leading-relaxed text-white/70">
                Great teams don&apos;t wait a year to talk about how things are
                going. Feedback should be continuous, contextual, and
                actionable — woven into the daily rhythm of work, not bolted on
                as an annual obligation. When feedback flows naturally, culture
                stops being a poster on the wall and becomes something you can
                actually measure.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ========== THREE PRINCIPLES ========== */}
      <section className="bg-cream py-24 md:py-32">
        <div className="mx-auto max-w-6xl px-6">
          <ScrollReveal>
            <div className="text-center">
              <p className="text-xs font-semibold tracking-wider text-forest uppercase">
                How we build
              </p>
              <h2 className="mt-3 font-display text-3xl font-semibold text-stone-900 md:text-5xl">
                Three principles guide everything
              </h2>
            </div>
          </ScrollReveal>

          <div className="mt-16 grid gap-6 md:grid-cols-3">
            {principles.map((principle, i) => {
              const colors = accentClasses[principle.accent];
              return (
                <ScrollReveal key={principle.title} delay={i * 100}>
                  <div className="relative h-full rounded-2xl border border-stone-200/60 bg-white/60 p-8 backdrop-blur-sm">
                    <div
                      className={`inline-flex h-12 w-12 items-center justify-center rounded-xl border ${colors.border} ${colors.bg} ${colors.text}`}
                    >
                      {principle.icon}
                    </div>
                    <h3 className="mt-5 font-display text-xl font-semibold text-stone-900">
                      {principle.title}
                    </h3>
                    <p className="mt-3 text-sm leading-relaxed text-stone-500">
                      {principle.description}
                    </p>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ========== CTA ========== */}
      <section className="bg-cream-dark/30 py-24 md:py-32">
        <div className="mx-auto max-w-3xl px-6">
          <ScrollReveal>
            <div className="relative rounded-3xl border border-forest/10 bg-gradient-to-b from-forest/[0.03] to-transparent p-10 text-center md:p-16">
              <h2 className="font-display text-3xl font-semibold text-stone-900 md:text-5xl">
                Ready to rethink feedback?
              </h2>
              <p className="mx-auto mt-5 max-w-lg text-stone-500 leading-relaxed">
                Join a small group of founding teams shaping the future of
                peer review — or explore the platform in our interactive demo.
              </p>
              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <a
                  href="mailto:nick@revualy.com?subject=Early%20Access%20Request"
                  className="group inline-flex items-center gap-2.5 rounded-2xl bg-forest px-8 py-4 text-sm font-semibold text-white transition-all hover:bg-forest-light hover:shadow-xl hover:shadow-forest/20"
                >
                  Request Early Access
                  <svg
                    className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                    />
                  </svg>
                </a>
                <Link
                  href="/home"
                  className="rounded-2xl border border-stone-200 bg-white/60 px-8 py-4 text-sm font-semibold text-stone-700 backdrop-blur-sm transition-all hover:border-stone-300 hover:bg-white hover:shadow-md"
                >
                  Explore the Demo
                </Link>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
