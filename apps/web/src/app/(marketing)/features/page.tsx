import type { Metadata } from "next";
import Link from "next/link";
import { ScrollReveal } from "@/components/scroll-reveal";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Chat-native feedback, AI-powered analysis, values mapping, calendar-aware scheduling, kudos, and role-based dashboards — everything you need for continuous team insight.",
  openGraph: {
    title: "Features | Revualy",
    description:
      "Chat-native feedback, AI analysis, values mapping, and role-based dashboards for continuous team insight.",
    url: "https://revualy.com/features",
    siteName: "Revualy",
    locale: "en_US",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Features | Revualy",
    description:
      "Chat-native feedback, AI analysis, values mapping, and role-based dashboards for continuous team insight.",
    images: ["/og-image.png"],
  },
  alternates: {
    canonical: "https://revualy.com/features",
  },
  robots: { index: true, follow: true },
};

const features = [
  {
    title: "Chat-Native Feedback",
    description:
      "Feedback delivered through Slack, Google Chat, or Teams. No new tools to learn, no context switching.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
      </svg>
    ),
    accent: "forest",
  },
  {
    title: "AI Analysis",
    description:
      "Every interaction scored for engagement quality, sentiment, and values alignment — automatically.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
      </svg>
    ),
    accent: "terracotta",
  },
  {
    title: "Values Mapping",
    description:
      "Map feedback to your company\u2019s defined values automatically. See how every interaction reinforces culture.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
      </svg>
    ),
    accent: "amber",
  },
  {
    title: "Calendar-Aware Scheduling",
    description:
      "AI picks the right time based on calendar availability and personal preferences. No meeting conflicts.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5m-9-6h.008v.008H12v-.008ZM12 15h.008v.008H12V15Zm0 2.25h.008v.008H12v-.008ZM9.75 15h.008v.008H9.75V15Zm0 2.25h.008v.008H9.75v-.008ZM7.5 15h.008v.008H7.5V15Zm0 2.25h.008v.008H7.5v-.008Zm6.75-4.5h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V15Zm0 2.25h.008v.008h-.008v-.008Zm2.25-4.5h.008v.008H16.5v-.008Zm0 2.25h.008v.008H16.5V15Z" />
      </svg>
    ),
    accent: "forest",
  },
  {
    title: "Kudos & Recognition",
    description:
      "Public and private recognition that reinforces positive behaviors and builds team morale.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
      </svg>
    ),
    accent: "terracotta",
  },
  {
    title: "Manager Question Bank",
    description:
      "Custom and team-scoped questions for targeted feedback. Build question sets that match your team\u2019s needs.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
      </svg>
    ),
    accent: "amber",
  },
  {
    title: "Org Chart & Relationships",
    description:
      "Visualize reporting lines and peer relationships. Understand how feedback flows across your organization.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
      </svg>
    ),
    accent: "forest",
  },
  {
    title: "Smart Notifications",
    description:
      "Digest emails, flag alerts, and nudges — configurable per user. Stay informed without the noise.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
      </svg>
    ),
    accent: "terracotta",
  },
  {
    title: "Role-Based Dashboards",
    description:
      "Employee, manager, and admin views with the right data for each role. Everyone sees what matters to them.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
      </svg>
    ),
    accent: "amber",
  },
];

const accentClasses: Record<string, { bg: string; text: string; border: string }> = {
  forest: { bg: "bg-forest/[0.06]", text: "text-forest", border: "border-forest/10" },
  terracotta: { bg: "bg-terracotta/[0.06]", text: "text-terracotta", border: "border-terracotta/10" },
  amber: { bg: "bg-amber/[0.06]", text: "text-amber", border: "border-amber/10" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Revualy",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "AI-powered peer review platform with continuous chat-native feedback mapped to company values.",
  offers: {
    "@type": "Offer",
    availability: "https://schema.org/LimitedAvailability",
    description: "Early access — founding teams only",
  },
  featureList: [
    "Chat-native feedback via Slack, Google Chat, and Microsoft Teams",
    "AI-powered engagement scoring, sentiment analysis, and values alignment",
    "Automatic values mapping to company-defined culture pillars",
    "Calendar-aware scheduling with Google Calendar integration",
    "Public and private kudos and peer recognition",
    "Manager question bank with team-scoped custom questions",
    "Org chart visualization with reporting lines and peer relationships",
    "Smart notifications with digest emails, flag alerts, and configurable nudges",
    "Role-based dashboards for employees, managers, and administrators",
  ],
};

export default function FeaturesPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* ========== HERO ========== */}
      <section className="relative overflow-hidden py-24 md:py-32">
        <div className="absolute inset-0 bg-gradient-to-b from-cream via-cream to-cream-dark/40" />
        <div className="absolute inset-0 dot-grid opacity-20" />

        {/* Decorative shapes */}
        <div className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-forest/[0.04]" />
        <div className="pointer-events-none absolute -left-10 bottom-0 h-64 w-64 rounded-full bg-terracotta/[0.03]" />

        <div className="relative z-10 mx-auto max-w-6xl px-6">
          <div className="max-w-3xl">
            <div
              className="hero-enter mb-6 inline-flex items-center gap-2.5 rounded-full border border-forest/10 bg-forest/[0.04] px-5 py-2"
              style={{ animationDelay: "0ms" }}
            >
              <span className="h-2 w-2 rounded-full bg-forest-light animate-pulse" />
              <span className="text-xs font-semibold tracking-wider text-forest uppercase">
                Platform
              </span>
            </div>

            <h1
              className="hero-enter font-display text-4xl font-semibold leading-[1.1] tracking-tight text-stone-900 sm:text-5xl md:text-7xl md:leading-[1.06]"
              style={{ animationDelay: "80ms" }}
            >
              Everything you need for{" "}
              <span className="relative inline-block text-terracotta">
                continuous insight
                <svg
                  className="absolute -bottom-1 left-0 w-full md:-bottom-2"
                  viewBox="0 0 300 12"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path
                    d="M2 8 C 60 2, 120 2, 150 6 S 240 12, 298 4"
                    stroke="currentColor"
                    strokeWidth="3"
                    fill="none"
                    strokeLinecap="round"
                    className="stroke-draw"
                  />
                </svg>
              </span>
            </h1>

            <p
              className="hero-enter mt-6 max-w-xl text-lg leading-relaxed text-stone-500 md:text-xl md:leading-relaxed"
              style={{ animationDelay: "180ms" }}
            >
              See what&apos;s happening, not what happened. Nine integrated tools
              that turn everyday chat into a continuous signal of team health,
              individual growth, and cultural alignment.
            </p>
          </div>
        </div>
      </section>

      {/* ========== FEATURE GRID ========== */}
      <section className="bg-cream-dark/30 py-24 md:py-32">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, i) => {
              const colors = accentClasses[feature.accent];
              return (
                <ScrollReveal key={feature.title} delay={i * 60}>
                  <div className="group relative h-full rounded-2xl border border-stone-200/60 bg-white/60 p-7 backdrop-blur-sm transition-all hover:border-stone-200 hover:bg-white hover:shadow-md">
                    {/* Icon */}
                    <div
                      className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${colors.border} ${colors.bg} ${colors.text} transition-colors`}
                    >
                      {feature.icon}
                    </div>

                    <h3 className="mt-4 font-display text-lg font-semibold text-stone-900">
                      {feature.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-stone-500">
                      {feature.description}
                    </p>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ========== DEEP DIVES ========== */}
      <section className="bg-cream py-24 md:py-32">
        <div className="mx-auto max-w-6xl px-6">
          {/* Deep Dive 1: Continuous Signal */}
          <ScrollReveal className="scroll-reveal-left">
            <div className="grid items-center gap-12 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold tracking-wider text-forest uppercase">
                  Micro-interactions
                </p>
                <h2 className="mt-3 font-display text-2xl font-semibold text-stone-900 md:text-4xl">
                  Continuous signal, not annual noise
                </h2>
                <p className="mt-4 leading-relaxed text-stone-500">
                  Annual reviews compress twelve months into a single, high-stakes
                  conversation. Revualy flips the model: 2&ndash;3 quick feedback
                  exchanges per week, delivered through chat, building a continuous
                  signal of team health and individual growth. Each interaction
                  takes under two minutes — but over time, the pattern is
                  unmistakable.
                </p>
                <ul className="mt-6 space-y-3">
                  {[
                    "2\u20133 micro-interactions per week, per person",
                    "Under two minutes each — no forms, no friction",
                    "Patterns emerge in weeks, not quarters",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <svg
                        className="mt-0.5 h-4 w-4 shrink-0 text-forest-light"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2.5}
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      <span className="text-sm text-stone-600">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {/* Visual: Signal bars */}
              <div className="flex justify-center">
                <div className="w-72 space-y-2.5">
                  {[
                    { label: "Wk 1", w: "w-[35%]", color: "bg-forest/20" },
                    { label: "Wk 2", w: "w-[48%]", color: "bg-forest/30" },
                    { label: "Wk 3", w: "w-[42%]", color: "bg-forest/25" },
                    { label: "Wk 4", w: "w-[55%]", color: "bg-forest/35" },
                    { label: "Wk 5", w: "w-[62%]", color: "bg-forest/40" },
                    { label: "Wk 6", w: "w-[58%]", color: "bg-forest/45" },
                    { label: "Wk 7", w: "w-[71%]", color: "bg-forest/50" },
                    { label: "Wk 8", w: "w-[78%]", color: "bg-forest/60" },
                  ].map((bar) => (
                    <div key={bar.label} className="flex items-center gap-3">
                      <span className="w-8 text-right text-[11px] font-medium text-stone-400 shrink-0">
                        {bar.label}
                      </span>
                      <div className="flex-1 rounded-full bg-stone-100 h-3">
                        <div className={`h-3 rounded-full ${bar.color} ${bar.w} transition-all`} />
                      </div>
                    </div>
                  ))}
                  <p className="mt-3 text-center text-xs text-stone-400">
                    Engagement signal strengthens over time
                  </p>
                </div>
              </div>
            </div>
          </ScrollReveal>

          {/* Deep Dive 2: Intelligence */}
          <ScrollReveal className="scroll-reveal-right mt-24 md:mt-32">
            <div className="grid items-center gap-12 md:grid-cols-2">
              {/* Visual: Score card */}
              <div className="order-2 flex justify-center md:order-1">
                <div className="w-72 rounded-2xl border border-stone-200/60 bg-white/80 p-6 backdrop-blur-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider">
                      AI Analysis
                    </p>
                    <span className="inline-flex h-5 items-center rounded-full bg-forest/10 px-2 text-[10px] font-semibold text-forest">
                      Live
                    </span>
                  </div>

                  <div className="mt-5 flex items-end gap-4">
                    <div className="relative flex h-20 w-20 items-center justify-center">
                      <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
                        <circle cx="50" cy="50" r="40" fill="none" stroke="#E7E5E4" strokeWidth="8" />
                        <circle cx="50" cy="50" r="40" fill="none" stroke="#064E3B" strokeWidth="8" strokeDasharray="251" strokeDashoffset="45" strokeLinecap="round" />
                      </svg>
                      <span className="font-display text-xl font-bold text-forest">82%</span>
                    </div>
                    <div className="mb-1">
                      <p className="text-sm font-semibold text-stone-900">Engagement</p>
                      <p className="text-xs text-stone-400">+6% from last week</p>
                    </div>
                  </div>

                  <div className="mt-5 border-t border-stone-100 pt-4">
                    <p className="text-xs font-medium text-stone-500 mb-2">Sentiment</p>
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 rounded-full bg-stone-100">
                        <div className="h-2 w-[72%] rounded-full bg-gradient-to-r from-forest to-forest-light" />
                      </div>
                      <span className="text-xs font-medium text-forest">Positive</span>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-stone-100 pt-4">
                    <p className="text-xs font-medium text-stone-500 mb-2">Values detected</p>
                    <div className="flex flex-wrap gap-1.5">
                      {["Ownership", "Collaboration", "Growth"].map((tag) => (
                        <span key={tag} className="inline-flex items-center rounded-md border border-stone-200 bg-stone-50 px-2 py-0.5 text-[11px] font-medium text-stone-600">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="order-1 md:order-2">
                <p className="text-xs font-semibold tracking-wider text-terracotta uppercase">
                  AI-powered
                </p>
                <h2 className="mt-3 font-display text-2xl font-semibold text-stone-900 md:text-4xl">
                  Intelligence you can act on
                </h2>
                <p className="mt-4 leading-relaxed text-stone-500">
                  Every feedback interaction is automatically analyzed for
                  engagement quality, sentiment, and alignment with your company
                  values. The AI identifies trends week over week, flags
                  potential issues before they escalate, and highlights top
                  contributors — so managers can coach proactively, not
                  reactively.
                </p>
                <ul className="mt-6 space-y-3">
                  {[
                    "Engagement scoring with week-over-week trends",
                    "Sentiment analysis flags concerns early",
                    "Automatic values tagging from natural language",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <svg
                        className="mt-0.5 h-4 w-4 shrink-0 text-terracotta"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2.5}
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      <span className="text-sm text-stone-600">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </ScrollReveal>

          {/* Deep Dive 3: Role-Based */}
          <ScrollReveal className="scroll-reveal-left mt-24 md:mt-32">
            <div className="grid items-center gap-12 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold tracking-wider text-amber uppercase">
                  Role-based views
                </p>
                <h2 className="mt-3 font-display text-2xl font-semibold text-stone-900 md:text-4xl">
                  Built for every role
                </h2>
                <p className="mt-4 leading-relaxed text-stone-500">
                  Employees see their growth trajectory, values radar, and feedback
                  history. Managers get team health metrics, coaching opportunities,
                  and engagement trends. Admins see the full picture — org-wide
                  analytics, escalation feeds, and configuration tools. Everyone
                  sees exactly what they need.
                </p>
                <ul className="mt-6 space-y-3">
                  {[
                    "Employee: personal growth, values radar, feedback history",
                    "Manager: team health, coaching signals, engagement trends",
                    "Admin: org analytics, escalations, full configuration",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <svg
                        className="mt-0.5 h-4 w-4 shrink-0 text-amber"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2.5}
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      <span className="text-sm text-stone-600">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {/* Visual: Overlapping dashboard cards */}
              <div className="flex justify-center">
                <div className="relative w-72 h-48">
                  <div className="absolute top-0 left-0 w-52 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                    <p className="text-xs font-semibold text-forest">Employee</p>
                    <p className="mt-1 text-xs text-stone-400">Values Radar &middot; Growth</p>
                    <div className="mt-2 flex gap-1">
                      <div className="h-1.5 w-8 rounded-full bg-forest/30" />
                      <div className="h-1.5 w-12 rounded-full bg-forest/50" />
                      <div className="h-1.5 w-6 rounded-full bg-forest/20" />
                    </div>
                  </div>
                  <div className="absolute top-12 left-12 w-52 rounded-xl border border-stone-200 bg-white p-4 shadow-md">
                    <p className="text-xs font-semibold text-terracotta">Manager</p>
                    <p className="mt-1 text-xs text-stone-400">Team Health &middot; Coaching</p>
                    <div className="mt-2 flex gap-1">
                      <div className="h-1.5 w-10 rounded-full bg-terracotta/30" />
                      <div className="h-1.5 w-6 rounded-full bg-terracotta/50" />
                      <div className="h-1.5 w-14 rounded-full bg-terracotta/20" />
                    </div>
                  </div>
                  <div className="absolute top-24 left-24 w-52 rounded-xl border border-stone-200 bg-white p-4 shadow-lg">
                    <p className="text-xs font-semibold text-amber">Admin</p>
                    <p className="mt-1 text-xs text-stone-400">Org Analytics &middot; Escalations</p>
                    <div className="mt-2 flex gap-1">
                      <div className="h-1.5 w-14 rounded-full bg-amber/30" />
                      <div className="h-1.5 w-8 rounded-full bg-amber/50" />
                      <div className="h-1.5 w-4 rounded-full bg-amber/20" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ========== CTA ========== */}
      <section className="bg-cream-dark/30 py-24 md:py-32">
        <div className="mx-auto max-w-3xl px-6">
          <ScrollReveal>
            <div className="relative rounded-3xl border border-forest/10 bg-gradient-to-b from-forest/[0.03] to-transparent p-10 text-center md:p-16">
              <h2 className="font-display text-3xl font-semibold text-stone-900 md:text-5xl">
                See it in action
              </h2>
              <p className="mx-auto mt-5 max-w-lg text-stone-500 leading-relaxed">
                Explore every feature in our interactive demo, or request early
                access to start using Revualy with your team.
              </p>
              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link
                  href="/home"
                  className="group inline-flex items-center gap-2.5 rounded-2xl bg-forest px-8 py-4 text-sm font-semibold text-white transition-all hover:bg-forest-light hover:shadow-xl hover:shadow-forest/20"
                >
                  Explore the Demo
                  <svg
                    className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </Link>
                <Link
                  href="/pricing"
                  className="rounded-2xl border border-stone-200 bg-white/60 px-8 py-4 text-sm font-semibold text-stone-700 backdrop-blur-sm transition-all hover:border-stone-300 hover:bg-white hover:shadow-md"
                >
                  Request Early Access
                </Link>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
