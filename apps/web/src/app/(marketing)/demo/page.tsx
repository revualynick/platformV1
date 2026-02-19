import type { Metadata } from "next";
import { DemoChatPublic } from "@/components/demo-chat-public";

export const metadata: Metadata = {
  title: "Try the Demo — Revualy",
  description:
    "Experience Revualy's AI-powered peer review conversation live. Enter your email to start a demo feedback interaction.",
};

export default function DemoPage() {
  return (
    <section className="bg-cream py-20 md:py-28">
      <div className="mx-auto max-w-4xl px-6">
        <div className="text-center mb-12">
          <p className="text-xs font-semibold tracking-wider text-forest uppercase">
            Interactive Demo
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold text-stone-900 md:text-5xl">
            See Revualy in action
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-stone-500 leading-relaxed">
            Experience a real AI-powered feedback conversation. Enter your email
            to start — the same LLM that powers production generates every
            question.
          </p>
        </div>

        <DemoChatPublic />
      </div>
    </section>
  );
}
