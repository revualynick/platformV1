import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Revualy's terms of service — the agreement governing your use of the platform.",
  alternates: {
    canonical: "https://revualy.com/terms",
  },
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return (
    <>
      {/* ========== HEADER ========== */}
      <section className="relative overflow-hidden py-20 md:py-28">
        <div className="absolute inset-0 bg-gradient-to-b from-cream to-cream-dark/30" />
        <div className="relative z-10 mx-auto max-w-3xl px-6">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-stone-900 md:text-5xl">
            Terms of Service
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
            {/* 1. Acceptance */}
            <div>
              <h2 className="font-display text-2xl font-semibold text-stone-900">
                1. Acceptance of Terms
              </h2>
              <p className="mt-4 leading-relaxed text-stone-600">
                By accessing or using Revualy (&ldquo;the Service&rdquo;), you
                agree to be bound by these Terms of Service. If you are using
                the Service on behalf of an organization, you represent that
                you have the authority to bind that organization to these
                terms. If you do not agree, do not use the Service.
              </p>
            </div>

            {/* 2. Service Description */}
            <div>
              <h2 className="font-display text-2xl font-semibold text-stone-900">
                2. Service Description
              </h2>
              <p className="mt-4 leading-relaxed text-stone-600">
                Revualy is an AI-powered peer review platform that facilitates
                continuous feedback through chat integrations (Slack, Google
                Chat, Microsoft Teams). The Service includes feedback
                collection, AI analysis, values mapping, dashboards, and
                related features as described on our website.
              </p>
              <p className="mt-3 leading-relaxed text-stone-600">
                The Service is currently in early access. Features, pricing,
                and availability may change as we develop toward general
                availability. We will provide reasonable notice of material
                changes.
              </p>
            </div>

            {/* 3. User Accounts */}
            <div>
              <h2 className="font-display text-2xl font-semibold text-stone-900">
                3. User Accounts
              </h2>
              <p className="mt-4 leading-relaxed text-stone-600">
                You are responsible for maintaining the security of your
                account credentials. You must notify us immediately if you
                become aware of unauthorized access to your account. We are
                not liable for any loss resulting from unauthorized use of
                your account.
              </p>
              <p className="mt-3 leading-relaxed text-stone-600">
                Organization administrators are responsible for managing user
                access within their organization, including adding and
                removing users, and configuring role-based permissions.
              </p>
            </div>

            {/* 4. Acceptable Use */}
            <div>
              <h2 className="font-display text-2xl font-semibold text-stone-900">
                4. Acceptable Use
              </h2>
              <p className="mt-4 leading-relaxed text-stone-600">
                You agree not to use the Service to: transmit harmful,
                harassing, or discriminatory content; attempt to gain
                unauthorized access to other organizations&apos; data; reverse
                engineer or decompile the Service; use the Service to build a
                competing product; or violate any applicable laws or
                regulations.
              </p>
            </div>

            {/* 5. Intellectual Property */}
            <div>
              <h2 className="font-display text-2xl font-semibold text-stone-900">
                5. Intellectual Property
              </h2>
              <p className="mt-4 leading-relaxed text-stone-600">
                The Service and all related technology, branding, and content
                are the property of Revualy. You retain all rights to the
                feedback content your organization submits through the
                Service. We claim no ownership over your data.
              </p>
              <p className="mt-3 leading-relaxed text-stone-600">
                You grant us a limited license to process your content solely
                to provide and improve the Service. This license terminates
                when you delete your data or close your account.
              </p>
            </div>

            {/* 6. Limitation of Liability */}
            <div>
              <h2 className="font-display text-2xl font-semibold text-stone-900">
                6. Limitation of Liability
              </h2>
              <p className="mt-4 leading-relaxed text-stone-600">
                The Service is provided &ldquo;as is&rdquo; without
                warranties of any kind. To the maximum extent permitted by
                law, Revualy shall not be liable for any indirect, incidental,
                special, consequential, or punitive damages resulting from
                your use of the Service.
              </p>
              <p className="mt-3 leading-relaxed text-stone-600">
                Our total liability for any claim arising from the Service
                shall not exceed the amount you paid us in the twelve months
                preceding the claim.
              </p>
            </div>

            {/* 7. Termination */}
            <div>
              <h2 className="font-display text-2xl font-semibold text-stone-900">
                7. Termination
              </h2>
              <p className="mt-4 leading-relaxed text-stone-600">
                Either party may terminate this agreement at any time. Upon
                termination, your right to use the Service ceases immediately.
                We will retain your organization&apos;s data for 30 days
                following termination, after which it will be permanently
                deleted. You may request a data export before termination.
              </p>
            </div>

            {/* 8. Changes to Terms */}
            <div>
              <h2 className="font-display text-2xl font-semibold text-stone-900">
                8. Changes to These Terms
              </h2>
              <p className="mt-4 leading-relaxed text-stone-600">
                We may update these terms from time to time. We will notify
                you of material changes via email or through the Service at
                least 30 days before they take effect. Continued use of the
                Service after changes take effect constitutes acceptance of
                the updated terms.
              </p>
            </div>

            {/* 9. Contact */}
            <div>
              <h2 className="font-display text-2xl font-semibold text-stone-900">
                9. Contact
              </h2>
              <p className="mt-4 leading-relaxed text-stone-600">
                For any questions about these terms, contact us at{" "}
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
