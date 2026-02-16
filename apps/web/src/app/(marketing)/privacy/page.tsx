import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Revualy's privacy policy — how we collect, use, and protect your data.",
  alternates: {
    canonical: "https://revualy.com/privacy",
  },
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <>
      {/* ========== HEADER ========== */}
      <section className="relative overflow-hidden py-20 md:py-28">
        <div className="absolute inset-0 bg-gradient-to-b from-cream to-cream-dark/30" />
        <div className="relative z-10 mx-auto max-w-3xl px-6">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-stone-900 md:text-5xl">
            Privacy Policy
          </h1>
          <p className="mt-4 text-stone-500">
            Last updated: February 2026
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-amber/20 bg-amber/[0.06] px-4 py-2">
            <svg
              className="h-4 w-4 text-amber"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
              />
            </svg>
            <span className="text-xs font-medium text-amber">
              Placeholder — will be updated by legal counsel prior to GA
            </span>
          </div>
        </div>
      </section>

      {/* ========== CONTENT ========== */}
      <section className="bg-cream pb-24 md:pb-32">
        <div className="mx-auto max-w-3xl px-6">
          <div className="prose-revualy space-y-12">
            {/* 1. Information We Collect */}
            <div>
              <h2 className="font-display text-2xl font-semibold text-stone-900">
                1. Information We Collect
              </h2>
              <p className="mt-4 leading-relaxed text-stone-600">
                We collect information you provide directly when you create an
                account, configure your organization, or use the platform. This
                includes your name, email address, organizational role, and
                authentication credentials from your identity provider
                (Google or Microsoft SSO).
              </p>
              <p className="mt-3 leading-relaxed text-stone-600">
                When your team uses Revualy through a chat platform (Slack,
                Google Chat, or Microsoft Teams), we process the feedback
                interactions that occur within Revualy-initiated conversations.
                We do not read or store messages from your general chat
                channels.
              </p>
              <p className="mt-3 leading-relaxed text-stone-600">
                We also collect usage data such as page views, feature usage
                patterns, and error logs to improve the product. If you connect
                your Google Calendar, we access event times and attendee lists
                to schedule feedback prompts — we do not read event content or
                descriptions.
              </p>
            </div>

            {/* 2. How We Use It */}
            <div>
              <h2 className="font-display text-2xl font-semibold text-stone-900">
                2. How We Use Your Information
              </h2>
              <p className="mt-4 leading-relaxed text-stone-600">
                We use your information to provide and improve the Revualy
                platform, including: delivering feedback prompts and analysis,
                generating engagement scores and values alignment reports,
                scheduling interactions based on calendar availability, and
                sending notifications you&apos;ve configured.
              </p>
              <p className="mt-3 leading-relaxed text-stone-600">
                AI analysis of feedback interactions produces aggregate scores,
                patterns, and trends — not transcripts. Individual feedback
                content is only visible to the participants and, when flagged,
                their direct manager. We never use your feedback data to train
                AI models.
              </p>
            </div>

            {/* 3. Data Storage */}
            <div>
              <h2 className="font-display text-2xl font-semibold text-stone-900">
                3. Data Storage & Security
              </h2>
              <p className="mt-4 leading-relaxed text-stone-600">
                Each organization&apos;s data is stored in an isolated database.
                There is no cross-tenant data access. All data is encrypted in
                transit (TLS 1.2+) and at rest. Authentication tokens for
                third-party services (calendar, chat platforms) are stored
                encrypted and automatically refreshed.
              </p>
              <p className="mt-3 leading-relaxed text-stone-600">
                We retain feedback data for the duration of your organization&apos;s
                active subscription. Upon account termination, all
                organization data is deleted within 30 days.
              </p>
            </div>

            {/* 4. Sharing */}
            <div>
              <h2 className="font-display text-2xl font-semibold text-stone-900">
                4. Information Sharing
              </h2>
              <p className="mt-4 leading-relaxed text-stone-600">
                We do not sell your data. We share information only with
                third-party services essential to platform operation:
                cloud infrastructure providers, email delivery services, and
                AI model providers (for feedback analysis only — no personally
                identifiable information is included in AI prompts).
              </p>
              <p className="mt-3 leading-relaxed text-stone-600">
                We may disclose information if required by law or to protect
                the rights, property, or safety of Revualy, our users, or
                the public.
              </p>
            </div>

            {/* 5. Your Rights */}
            <div>
              <h2 className="font-display text-2xl font-semibold text-stone-900">
                5. Your Rights
              </h2>
              <p className="mt-4 leading-relaxed text-stone-600">
                You may access, correct, or delete your personal data at any
                time through your account settings or by contacting us.
                Organization administrators can export all organization data.
                You may revoke calendar or chat platform connections at any
                time.
              </p>
              <p className="mt-3 leading-relaxed text-stone-600">
                If you are located in the European Economic Area, you have
                additional rights under the GDPR, including the right to data
                portability, restriction of processing, and the right to lodge
                a complaint with a supervisory authority.
              </p>
            </div>

            {/* 6. Contact */}
            <div>
              <h2 className="font-display text-2xl font-semibold text-stone-900">
                6. Contact
              </h2>
              <p className="mt-4 leading-relaxed text-stone-600">
                For any privacy-related questions or requests, contact us at{" "}
                <a
                  href="mailto:nick@revualy.com"
                  className="font-medium text-forest underline decoration-forest/30 underline-offset-2 hover:decoration-forest"
                >
                  nick@revualy.com
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
