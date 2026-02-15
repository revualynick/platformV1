import type { Metadata } from "next";
import Link from "next/link";
import { ScrollReveal } from "@/components/scroll-reveal";
import { FAQAccordion } from "@/components/faq-accordion";

export const metadata: Metadata = {
  title: "Revualy — AI-Powered Peer Review for Modern Teams",
  description:
    "Replace awkward annual reviews with continuous, chat-native feedback. AI-powered analysis maps every interaction to your company values. Works in Slack, Google Chat, and Teams.",
  keywords: [
    "peer review",
    "employee feedback",
    "AI feedback analysis",
    "team culture",
    "continuous feedback",
    "Slack feedback",
    "performance review alternative",
  ],
  openGraph: {
    title: "Revualy — AI-Powered Peer Review for Modern Teams",
    description:
      "Replace awkward annual reviews with continuous, chat-native feedback mapped to your company values.",
    url: "https://revualy.com",
    siteName: "Revualy",
    locale: "en_US",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Revualy — AI-Powered Peer Review for Modern Teams",
    description:
      "Replace awkward annual reviews with continuous, chat-native feedback mapped to your company values.",
    images: ["/og-image.png"],
  },
  alternates: {
    canonical: "https://revualy.com",
  },
  robots: { index: true, follow: true },
};

const faqItems = [
  {
    question: "How is this different from annual reviews?",
    answer:
      "Annual reviews compress a year of performance into a single, stressful conversation. Revualy captures micro-feedback continuously — 2-3 quick interactions per week through chat — so nothing gets lost and reviews become a formality, not a surprise.",
  },
  {
    question: "Which chat platforms do you support?",
    answer:
      "We currently support Slack with Google Chat launching soon and Microsoft Teams on the roadmap. Our architecture is platform-agnostic, so adding new integrations is straightforward.",
  },
  {
    question: "How does the AI analyze feedback?",
    answer:
      "Every feedback interaction is analyzed for engagement quality, sentiment, and alignment with your company's defined values. The AI scores interactions, identifies patterns over time, and flags anything that needs manager attention — all without exposing individual message content to leadership.",
  },
  {
    question: "Is our feedback data private and secure?",
    answer:
      "Absolutely. Each organization gets its own isolated database. Feedback content is only visible to the participants and, when flagged, their direct manager. AI analysis produces aggregate scores and patterns — not transcripts. We never train on your data.",
  },
  {
    question: "How long does it take to set up?",
    answer:
      "Most teams are up and running within 30 minutes. Install the chat app, define your company values, and invite your team. The system handles the rest — scheduling feedback prompts, matching peers, and surfacing insights.",
  },
  {
    question: "How do I get access?",
    answer:
      "We're onboarding a small number of founding teams to ensure every organization gets a hands-on setup experience. Request access below and we'll reach out within 48 hours to see if it's a good fit. Founding teams lock in preferential pricing for life.",
  },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
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
        "Chat-native feedback via Slack, Google Chat, Teams",
        "AI-powered sentiment and values analysis",
        "Role-based dashboards for employees, managers, and HR",
        "Continuous micro-feedback instead of annual reviews",
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: faqItems.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    },
  ],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="relative min-h-screen overflow-hidden">
        {/* ========== NAVIGATION ========== */}
        <nav className="sticky top-0 z-50 border-b border-stone-200/40 bg-cream/80 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest text-white font-display text-base font-semibold">
                R
              </div>
              <span className="font-display text-xl font-semibold tracking-tight text-stone-900">
                Revualy
              </span>
            </div>

            <div className="hidden items-center gap-8 md:flex">
              <a
                href="#how-it-works"
                className="text-sm font-medium text-stone-500 transition-colors hover:text-stone-900"
              >
                How It Works
              </a>
              <a
                href="#pricing"
                className="text-sm font-medium text-stone-500 transition-colors hover:text-stone-900"
              >
                Early Access
              </a>
              <a
                href="#faq"
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
              <a
                href="#pricing"
                className="rounded-xl bg-forest px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-forest-light hover:shadow-lg hover:shadow-forest/20"
              >
                Request Early Access
              </a>
            </div>
          </div>
        </nav>

        {/* ========== HERO ========== */}
        <section className="relative min-h-[90vh] overflow-hidden">
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-cream via-cream to-cream-dark" />
          <div className="absolute inset-0 dot-grid opacity-30" />

          {/* Decorative floating shapes — right side */}
          <div className="pointer-events-none absolute right-0 top-0 hidden h-full w-[45%] md:block">
            <div className="hero-shape-1 absolute right-12 top-24 h-72 w-56 rounded-[2rem] bg-forest/[0.06] rotate-6" />
            <div className="hero-shape-2 absolute right-32 top-48 h-64 w-48 rounded-[2.5rem] bg-terracotta/[0.07] -rotate-12" />
            <div className="hero-shape-3 absolute right-8 top-72 h-52 w-52 rounded-[3rem] bg-amber/[0.08] rotate-3" />
          </div>

          <div className="relative z-10 mx-auto max-w-6xl px-6 pb-24 pt-20 md:pt-32">
            {/* Eyebrow pill */}
            <div
              className="hero-enter mb-8 inline-flex items-center gap-2.5 rounded-full border border-forest/10 bg-forest/[0.04] px-5 py-2"
              style={{ animationDelay: "0ms" }}
            >
              <span className="h-2 w-2 rounded-full bg-forest-light animate-pulse" />
              <span className="text-xs font-semibold tracking-wider text-forest uppercase">
                Now in early access
              </span>
            </div>

            {/* Headline */}
            <h1
              className="hero-enter max-w-3xl font-display text-5xl font-semibold leading-[1.08] tracking-tight text-stone-900 sm:text-6xl md:text-8xl md:leading-[1.04]"
              style={{ animationDelay: "100ms" }}
            >
              Feedback that{" "}
              <br className="hidden md:block" />
              maps to your{" "}
              <span className="relative inline-block text-terracotta">
                values
                <svg
                  className="absolute -bottom-1 left-0 w-full md:-bottom-2"
                  viewBox="0 0 200 12"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path
                    d="M2 8 C 40 2, 80 2, 100 6 S 160 12, 198 4"
                    stroke="currentColor"
                    strokeWidth="3"
                    fill="none"
                    strokeLinecap="round"
                    className="stroke-draw"
                  />
                </svg>
              </span>
            </h1>

            {/* Subheadline */}
            <p
              className="hero-enter mt-8 max-w-xl text-lg leading-relaxed text-stone-500 md:text-xl md:leading-relaxed"
              style={{ animationDelay: "200ms" }}
            >
              Replace awkward annual reviews with 2&ndash;3 micro-interactions
              per week, delivered through the chat tools your team already uses.
              AI does the analysis — you get the insights.
            </p>

            {/* CTAs */}
            <div
              className="hero-enter mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center"
              style={{ animationDelay: "350ms" }}
            >
              <a
                href="#pricing"
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
              <a
                href="#how-it-works"
                className="rounded-2xl border border-stone-200 bg-white/60 px-8 py-4 text-sm font-semibold text-stone-700 backdrop-blur-sm transition-all hover:border-stone-300 hover:bg-white hover:shadow-md"
              >
                See How It Works
              </a>
              <Link
                href="/home"
                className="group inline-flex items-center gap-1.5 text-sm font-medium text-stone-500 transition-colors hover:text-forest"
              >
                or explore the demo
                <svg
                  className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
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
              </Link>
            </div>
          </div>
        </section>

        {/* ========== SOCIAL PROOF STRIP ========== */}
        <section className="relative bg-forest py-16 md:py-20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid gap-10 md:grid-cols-3 md:gap-12">
              {[
                {
                  quote:
                    "We replaced our entire annual review process with Revualy. The continuous feedback loop caught issues we used to miss for months.",
                  name: "Sarah Chen",
                  role: "VP of People, 120-person SaaS company",
                },
                {
                  quote:
                    "My team actually enjoys giving feedback now. The chat-based format makes it feel like a conversation, not a performance tribunal.",
                  name: "Marcus Webb",
                  role: "Engineering Manager",
                },
                {
                  quote:
                    "The AI insights surfaced a pattern we never would have noticed — our remote team members were getting 40% less recognition. We fixed it in a week.",
                  name: "Priya Sharma",
                  role: "Head of Culture & Engagement",
                },
              ].map((testimonial, i) => (
                <div
                  key={i}
                  className="relative"
                >
                  <span className="font-display text-5xl leading-none text-terracotta/60 select-none">
                    &ldquo;
                  </span>
                  <p className="mt-2 font-display text-base italic leading-relaxed text-white/90 md:text-lg">
                    {testimonial.quote}
                  </p>
                  <div className="mt-6">
                    <p className="text-sm font-semibold text-white">
                      {testimonial.name}
                    </p>
                    <p className="text-sm text-white/50">
                      {testimonial.role}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ========== HOW IT WORKS ========== */}
        <section id="how-it-works" className="bg-cream py-24 md:py-32">
          <div className="mx-auto max-w-6xl px-6">
            <ScrollReveal>
              <div className="text-center">
                <p className="text-xs font-semibold tracking-wider text-forest uppercase">
                  How it works
                </p>
                <h2 className="mt-3 font-display text-3xl font-semibold text-stone-900 md:text-5xl">
                  Three steps to better feedback
                </h2>
                <p className="mx-auto mt-4 max-w-lg text-stone-500">
                  Set up in under 30 minutes. No complex integrations, no
                  training sessions, no change management headaches.
                </p>
              </div>
            </ScrollReveal>

            <div className="relative mt-20 grid gap-12 md:grid-cols-3 md:gap-8">
              {/* Dashed connector — desktop only */}
              <div className="pointer-events-none absolute top-16 left-[20%] right-[20%] hidden md:block">
                <div className="step-connector w-full" />
              </div>

              {[
                {
                  step: "01",
                  title: "Connect your chat tool",
                  description:
                    "Install the Revualy app in Slack, Google Chat, or Teams. Define your company values and invite your team. That's the entire setup.",
                },
                {
                  step: "02",
                  title: "Your team gives feedback",
                  description:
                    "Revualy prompts 2-3 quick peer interactions per week, right in chat. Each takes under two minutes. No forms, no context switching.",
                },
                {
                  step: "03",
                  title: "AI surfaces insights",
                  description:
                    "Every interaction is analyzed for engagement quality and values alignment. Dashboards show growth patterns, team health, and coaching opportunities.",
                },
              ].map((item, i) => (
                <ScrollReveal key={i} delay={i * 120}>
                  <div className="relative rounded-2xl border border-stone-200/60 bg-white/60 p-8 backdrop-blur-sm">
                    <span className="step-watermark font-display font-bold">
                      {item.step}
                    </span>
                    <div className="relative">
                      <h3 className="font-display text-xl font-semibold text-stone-900">
                        {item.title}
                      </h3>
                      <p className="mt-3 text-sm leading-relaxed text-stone-500">
                        {item.description}
                      </p>
                    </div>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>

        {/* ========== FEATURE DEEP-DIVE ========== */}
        <section className="bg-cream-dark/40 py-24 md:py-32">
          <div className="mx-auto max-w-6xl px-6">
            {/* Feature 1: Chat-Native */}
            <ScrollReveal className="scroll-reveal-left">
              <div className="grid items-center gap-12 md:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold tracking-wider text-forest uppercase">
                    Chat-native
                  </p>
                  <h3 className="mt-3 font-display text-2xl font-semibold text-stone-900 md:text-4xl">
                    Feedback where work already happens
                  </h3>
                  <p className="mt-4 leading-relaxed text-stone-500">
                    No new app to install, no separate login to remember. Revualy
                    lives inside the chat tools your team uses every day.
                    Feedback flows as naturally as a direct message — because
                    that&apos;s exactly what it is.
                  </p>
                </div>
                {/* Visual: Chat bubble abstraction */}
                <div className="flex justify-center">
                  <div className="relative w-72">
                    <div className="rounded-2xl rounded-bl-sm bg-forest/10 p-5 text-sm text-stone-700">
                      <p className="font-medium text-forest text-xs mb-1">
                        Revualy Bot
                      </p>
                      How did Alex demonstrate
                      &ldquo;ownership&rdquo; this week?
                    </div>
                    <div className="mt-3 ml-12 rounded-2xl rounded-br-sm bg-white p-5 text-sm text-stone-700 shadow-sm border border-stone-100">
                      <p className="font-medium text-stone-400 text-xs mb-1">
                        You
                      </p>
                      She took full ownership of the deploy pipeline migration — communicated blockers early and shipped a day ahead.
                    </div>
                    <div className="mt-3 rounded-2xl rounded-bl-sm bg-forest/10 p-5 text-sm text-stone-700">
                      <p className="font-medium text-forest text-xs mb-1">
                        Revualy Bot
                      </p>
                      Great example! Captured and mapped to
                      &ldquo;Ownership&rdquo;.
                    </div>
                  </div>
                </div>
              </div>
            </ScrollReveal>

            {/* Feature 2: AI-Powered Analysis */}
            <ScrollReveal className="scroll-reveal-right mt-24 md:mt-32">
              <div className="grid items-center gap-12 md:grid-cols-2">
                {/* Visual: Engagement ring abstraction */}
                <div className="order-2 flex justify-center md:order-1">
                  <div className="relative flex h-56 w-56 items-center justify-center">
                    <svg
                      className="absolute inset-0 h-full w-full -rotate-90"
                      viewBox="0 0 100 100"
                      aria-hidden="true"
                    >
                      <circle
                        cx="50"
                        cy="50"
                        r="42"
                        fill="none"
                        stroke="#E7E5E4"
                        strokeWidth="6"
                      />
                      <circle
                        cx="50"
                        cy="50"
                        r="42"
                        fill="none"
                        stroke="#064E3B"
                        strokeWidth="6"
                        strokeDasharray="264"
                        strokeDashoffset="53"
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="text-center">
                      <p className="font-display text-4xl font-bold text-forest">
                        80%
                      </p>
                      <p className="text-xs text-stone-500 mt-1">
                        Values Alignment
                      </p>
                    </div>
                  </div>
                </div>
                <div className="order-1 md:order-2">
                  <p className="text-xs font-semibold tracking-wider text-terracotta uppercase">
                    AI-powered analysis
                  </p>
                  <h3 className="mt-3 font-display text-2xl font-semibold text-stone-900 md:text-4xl">
                    Intelligence, not just data
                  </h3>
                  <p className="mt-4 leading-relaxed text-stone-500">
                    Every feedback interaction is automatically scored for
                    engagement quality, sentiment, and alignment with your
                    defined company values. The AI identifies trends, flags
                    potential issues, and highlights top contributors — so
                    managers can coach proactively instead of reactively.
                  </p>
                </div>
              </div>
            </ScrollReveal>

            {/* Feature 3: Role-Based Dashboards */}
            <ScrollReveal className="scroll-reveal-left mt-24 md:mt-32">
              <div className="grid items-center gap-12 md:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold tracking-wider text-amber uppercase">
                    Role-based dashboards
                  </p>
                  <h3 className="mt-3 font-display text-2xl font-semibold text-stone-900 md:text-4xl">
                    The right view for every role
                  </h3>
                  <p className="mt-4 leading-relaxed text-stone-500">
                    Employees see their growth trajectory and values radar.
                    Managers see team health, coaching opportunities, and
                    engagement trends. HR and admins get the full picture with
                    escalation feeds and org-wide analytics.
                  </p>
                </div>
                {/* Visual: Overlapping dashboard cards */}
                <div className="flex justify-center">
                  <div className="relative w-72 h-48">
                    <div className="absolute top-0 left-0 w-52 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                      <p className="text-xs font-semibold text-forest">
                        Employee
                      </p>
                      <p className="mt-1 text-xs text-stone-400">
                        Values Radar &middot; Growth
                      </p>
                      <div className="mt-2 flex gap-1">
                        <div className="h-1.5 w-8 rounded-full bg-forest/30" />
                        <div className="h-1.5 w-12 rounded-full bg-forest/50" />
                        <div className="h-1.5 w-6 rounded-full bg-forest/20" />
                      </div>
                    </div>
                    <div className="absolute top-12 left-12 w-52 rounded-xl border border-stone-200 bg-white p-4 shadow-md">
                      <p className="text-xs font-semibold text-terracotta">
                        Manager
                      </p>
                      <p className="mt-1 text-xs text-stone-400">
                        Team Health &middot; Coaching
                      </p>
                      <div className="mt-2 flex gap-1">
                        <div className="h-1.5 w-10 rounded-full bg-terracotta/30" />
                        <div className="h-1.5 w-6 rounded-full bg-terracotta/50" />
                        <div className="h-1.5 w-14 rounded-full bg-terracotta/20" />
                      </div>
                    </div>
                    <div className="absolute top-24 left-24 w-52 rounded-xl border border-stone-200 bg-white p-4 shadow-lg">
                      <p className="text-xs font-semibold text-amber">
                        Admin
                      </p>
                      <p className="mt-1 text-xs text-stone-400">
                        Org Analytics &middot; Escalations
                      </p>
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

        {/* ========== EARLY ACCESS ========== */}
        <section id="pricing" className="bg-cream py-24 md:py-32">
          <div className="mx-auto max-w-3xl px-6">
            <ScrollReveal>
              <div className="relative rounded-3xl border border-forest/10 bg-gradient-to-b from-forest/[0.03] to-transparent p-10 text-center md:p-16">
                <div className="inline-flex items-center gap-2 rounded-full border border-terracotta/20 bg-terracotta/[0.06] px-4 py-1.5 mb-6">
                  <span className="h-1.5 w-1.5 rounded-full bg-terracotta animate-pulse" />
                  <span className="text-xs font-semibold tracking-wider text-terracotta uppercase">
                    Limited availability
                  </span>
                </div>

                <h2 className="font-display text-3xl font-semibold text-stone-900 md:text-5xl">
                  Now onboarding founding teams
                </h2>

                <p className="mx-auto mt-5 max-w-lg text-stone-500 leading-relaxed">
                  We&apos;re working with a small group of teams to shape
                  Revualy before general availability. Founding teams get
                  hands-on onboarding, direct access to the product team, and
                  preferential pricing locked in for life.
                </p>

                <div className="mt-10 flex flex-col items-center gap-6">
                  <a
                    href="mailto:nick@revualy.com?subject=Early%20Access%20Request"
                    className="group inline-flex items-center gap-2.5 rounded-2xl bg-forest px-10 py-4 text-sm font-semibold text-white transition-all hover:bg-forest-light hover:shadow-xl hover:shadow-forest/20"
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
                  <p className="text-xs text-stone-400">
                    No commitment &middot; We&apos;ll respond within 48 hours
                  </p>
                </div>

                <div className="mt-12 grid grid-cols-2 gap-6 border-t border-stone-200/60 pt-10 md:grid-cols-4">
                  {[
                    { label: "Full platform access", icon: "M4.5 12.75l6 6 9-13.5" },
                    { label: "Hands-on onboarding", icon: "M4.5 12.75l6 6 9-13.5" },
                    { label: "Founding member pricing", icon: "M4.5 12.75l6 6 9-13.5" },
                    { label: "Direct product input", icon: "M4.5 12.75l6 6 9-13.5" },
                  ].map((perk) => (
                    <div key={perk.label} className="flex flex-col items-center gap-2">
                      <svg
                        className="h-5 w-5 text-forest-light"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2.5}
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d={perk.icon}
                        />
                      </svg>
                      <span className="text-xs font-medium text-stone-600 text-center">
                        {perk.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* ========== FAQ ========== */}
        <section id="faq" className="bg-cream-dark/30 py-24 md:py-32">
          <div className="mx-auto max-w-2xl px-6">
            <ScrollReveal>
              <div className="text-center">
                <p className="text-xs font-semibold tracking-wider text-forest uppercase">
                  FAQ
                </p>
                <h2 className="mt-3 font-display text-3xl font-semibold text-stone-900 md:text-5xl">
                  Common questions
                </h2>
              </div>
            </ScrollReveal>

            <ScrollReveal>
              <div className="mt-12">
                <FAQAccordion items={faqItems} />
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* ========== FOOTER ========== */}
        <footer className="bg-stone-900 text-stone-300">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <div className="grid gap-12 md:grid-cols-4">
              {/* Brand */}
              <div className="md:col-span-1">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 font-display text-sm font-semibold text-white">
                    R
                  </div>
                  <span className="font-display text-lg font-semibold text-white">
                    Revualy
                  </span>
                </div>
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
                    { label: "How It Works", href: "#how-it-works" },
                    { label: "Early Access", href: "#pricing" },
                    { label: "FAQ", href: "#faq" },
                    { label: "Changelog", href: "#" },
                  ].map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="text-sm text-stone-400 transition-colors hover:text-white"
                      >
                        {link.label}
                      </a>
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
                    { label: "About", href: "#" },
                    { label: "Blog", href: "#" },
                    { label: "Careers", href: "#" },
                    { label: "Contact", href: "#" },
                  ].map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="text-sm text-stone-400 transition-colors hover:text-white"
                      >
                        {link.label}
                      </a>
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
                    { label: "Privacy Policy", href: "#" },
                    { label: "Terms of Service", href: "#" },
                    { label: "Security", href: "#" },
                  ].map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="text-sm text-stone-400 transition-colors hover:text-white"
                      >
                        {link.label}
                      </a>
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
      </div>
    </>
  );
}
