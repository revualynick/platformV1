import type { Metadata } from "next";
import Link from "next/link";
import { ScrollReveal } from "@/components/scroll-reveal";
import { FAQAccordion } from "@/components/faq-accordion";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple, transparent pricing for Revualy. Join as a founding team and lock in preferential pricing for life.",
  openGraph: {
    title: "Pricing | Revualy",
    description:
      "Simple, transparent pricing. Join as a founding team and lock in preferential pricing for life.",
    url: "https://revualy.com/pricing",
    siteName: "Revualy",
    locale: "en_US",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Pricing | Revualy",
    description:
      "Simple, transparent pricing. Join as a founding team and lock in preferential pricing for life.",
    images: ["/og-image.png"],
  },
  alternates: {
    canonical: "https://revualy.com/pricing",
  },
  robots: { index: true, follow: true },
};

const foundingFeatures = [
  "Full platform access — every feature, no limits",
  "Slack integration (Google Chat & Teams coming soon)",
  "AI-powered feedback analysis & values mapping",
  "Calendar-aware scheduling with Google Calendar",
  "Kudos & peer recognition system",
  "Manager question bank with team-scoped questions",
  "Org chart & relationship visualization",
  "Smart notifications — digests, alerts, and nudges",
  "Role-based dashboards for every role",
  "Hands-on onboarding & direct product input",
  "Founding member pricing locked in for life",
];

const pricingFaqItems = [
  {
    question: "What does founding member pricing mean?",
    answer:
      "Founding teams help shape Revualy during early access. In return, you lock in a preferential rate that never increases — even after general availability when standard pricing goes into effect. It's our way of thanking early adopters for their trust and feedback.",
  },
  {
    question: "Is there a free trial?",
    answer:
      "We don't offer a self-serve free trial during early access — instead, every founding team gets hands-on onboarding with the product team to ensure a great setup experience. You can explore the full platform in our interactive demo at any time.",
  },
  {
    question: "How does per-seat pricing work?",
    answer:
      "Pricing is based on the number of active users in your organization. You only pay for people who actively participate in feedback cycles. Admins who only configure the platform don't count toward your seat total.",
  },
  {
    question: "When will general availability pricing be announced?",
    answer:
      "We'll announce standard pricing tiers before GA launch. Founding teams will be notified well in advance and their preferential rate is guaranteed regardless of where standard pricing lands.",
  },
];

const futureTiers = [
  {
    name: "Starter",
    description: "For small teams getting started with continuous feedback",
    features: ["Up to 25 users", "1 chat integration", "Basic analytics"],
  },
  {
    name: "Pro",
    description: "For growing organizations that need deeper insights",
    features: ["Unlimited users", "All integrations", "Advanced AI analysis"],
  },
  {
    name: "Enterprise",
    description: "For large organizations with custom requirements",
    features: ["Custom deployment", "SSO & SCIM", "Dedicated support"],
  },
];

export default function PricingPage() {
  return (
    <>
      {/* ========== HERO ========== */}
      <section className="relative overflow-hidden py-24 md:py-32">
        <div className="absolute inset-0 bg-gradient-to-b from-cream via-cream to-cream-dark/40" />
        <div className="absolute inset-0 dot-grid opacity-20" />

        <div className="relative z-10 mx-auto max-w-6xl px-6 text-center">
          <div
            className="hero-enter mb-6 inline-flex items-center gap-2.5 rounded-full border border-terracotta/20 bg-terracotta/[0.06] px-5 py-2"
            style={{ animationDelay: "0ms" }}
          >
            <span className="h-2 w-2 rounded-full bg-terracotta animate-pulse" />
            <span className="text-xs font-semibold tracking-wider text-terracotta uppercase">
              Early access
            </span>
          </div>

          <h1
            className="hero-enter mx-auto max-w-2xl font-display text-4xl font-semibold leading-[1.1] tracking-tight text-stone-900 sm:text-5xl md:text-7xl md:leading-[1.06]"
            style={{ animationDelay: "80ms" }}
          >
            Simple, transparent pricing
          </h1>

          <p
            className="hero-enter mx-auto mt-6 max-w-lg text-lg leading-relaxed text-stone-500"
            style={{ animationDelay: "180ms" }}
          >
            One plan, everything included. Lock in founding member pricing
            before general availability.
          </p>
        </div>
      </section>

      {/* ========== FOUNDING MEMBER CARD ========== */}
      <section className="bg-cream-dark/30 py-24 md:py-32">
        <div className="mx-auto max-w-4xl px-6">
          <ScrollReveal>
            <div className="pricing-card relative rounded-3xl border-2 border-forest/20 bg-white/80 p-8 backdrop-blur-sm md:p-12">
              {/* Badge */}
              <div className="absolute -top-4 left-8 inline-flex items-center gap-2 rounded-full bg-forest px-5 py-2">
                <svg
                  className="h-4 w-4 text-amber-light"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                </svg>
                <span className="text-xs font-semibold text-white tracking-wide uppercase">
                  Founding Member
                </span>
              </div>

              <div className="grid gap-10 md:grid-cols-2">
                {/* Left: pricing info */}
                <div>
                  <p className="mt-4 text-xs font-semibold tracking-wider text-stone-400 uppercase">
                    Early Access
                  </p>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="font-display text-5xl font-bold text-stone-900">
                      Founding
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-stone-500">
                    Preferential per-seat pricing &middot; locked in for life
                  </p>

                  <p className="mt-6 text-sm leading-relaxed text-stone-500">
                    We&apos;re working with a small number of teams to shape
                    Revualy before general availability. Founding teams get
                    hands-on onboarding, direct access to the product team, and
                    pricing that never increases.
                  </p>

                  <a
                    href="mailto:nick@revualy.com?subject=Early%20Access%20Request"
                    className="group mt-8 inline-flex items-center gap-2.5 rounded-2xl bg-forest px-8 py-4 text-sm font-semibold text-white transition-all hover:bg-forest-light hover:shadow-xl hover:shadow-forest/20"
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
                  <p className="mt-3 text-xs text-stone-400">
                    No commitment &middot; We&apos;ll respond within 48 hours
                  </p>
                </div>

                {/* Right: feature checklist */}
                <div className="rounded-2xl border border-stone-200/60 bg-cream/50 p-6">
                  <p className="text-xs font-semibold tracking-wider text-forest uppercase">
                    Everything included
                  </p>
                  <ul className="mt-5 space-y-3.5">
                    {foundingFeatures.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <svg
                          className="mt-0.5 h-4 w-4 shrink-0 text-forest-light"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={2.5}
                          stroke="currentColor"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M4.5 12.75l6 6 9-13.5"
                          />
                        </svg>
                        <span className="text-sm text-stone-600">
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ========== FUTURE TIERS ========== */}
      <section className="bg-cream py-24 md:py-32">
        <div className="mx-auto max-w-6xl px-6">
          <ScrollReveal>
            <div className="text-center">
              <p className="text-xs font-semibold tracking-wider text-stone-400 uppercase">
                Coming at general availability
              </p>
              <h2 className="mt-3 font-display text-3xl font-semibold text-stone-900 md:text-4xl">
                Future pricing tiers
              </h2>
              <p className="mx-auto mt-4 max-w-lg text-stone-500">
                Standard pricing will be announced before GA. Founding teams
                keep their locked-in rate regardless.
              </p>
            </div>
          </ScrollReveal>

          <div className="mt-16 grid gap-6 md:grid-cols-3">
            {futureTiers.map((tier, i) => (
              <ScrollReveal key={tier.name} delay={i * 80}>
                <div className="relative h-full rounded-2xl border border-stone-200/40 bg-white/40 p-7 opacity-60">
                  <div className="absolute top-4 right-4 inline-flex items-center rounded-full bg-stone-100 px-3 py-1">
                    <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider">
                      Coming Soon
                    </span>
                  </div>
                  <h3 className="font-display text-xl font-semibold text-stone-700">
                    {tier.name}
                  </h3>
                  <p className="mt-2 text-sm text-stone-400">
                    {tier.description}
                  </p>
                  <ul className="mt-5 space-y-2.5">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2.5">
                        <div className="h-1 w-1 rounded-full bg-stone-300" />
                        <span className="text-sm text-stone-400">
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ========== PRICING FAQ ========== */}
      <section className="bg-cream-dark/30 py-24 md:py-32">
        <div className="mx-auto max-w-2xl px-6">
          <ScrollReveal>
            <div className="text-center">
              <p className="text-xs font-semibold tracking-wider text-forest uppercase">
                FAQ
              </p>
              <h2 className="mt-3 font-display text-3xl font-semibold text-stone-900 md:text-4xl">
                Pricing questions
              </h2>
            </div>
          </ScrollReveal>

          <ScrollReveal>
            <div className="mt-12">
              <FAQAccordion items={pricingFaqItems} />
            </div>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
