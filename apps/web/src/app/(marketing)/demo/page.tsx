import type { Metadata } from "next";
import { DemoChatPublic } from "@/components/demo-chat-public";
import { SlackMockChat } from "@/components/slack-mock-chat";

export const metadata: Metadata = {
  title: "Try the Demo — Revualy",
  description:
    "Experience Revualy's AI-powered peer review conversation live. Enter your email to start a demo feedback interaction.",
};

export default function DemoPage() {
  return (
    <>
      {/* Slack mock section */}
      <section className="bg-cream py-20 md:py-28">
        <div className="mx-auto max-w-4xl px-6">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold tracking-wider text-forest uppercase">
              How it works
            </p>
            <h1 className="mt-3 font-display text-3xl font-semibold text-stone-900 md:text-5xl">
              How it looks in your chat app
            </h1>
            <p className="mx-auto mt-4 max-w-lg text-stone-500 leading-relaxed">
              Revualy lives where your team already works. A friendly bot
              collects peer feedback through natural DM conversations — no
              forms, no context switching.
            </p>
          </div>

          <SlackMockChat />

          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-stone-400">
            <span className="flex items-center gap-2">
              <span className="text-base">💬</span> Slack
            </span>
            <span className="flex items-center gap-2">
              <span className="text-base">🟢</span> Google Chat
            </span>
            <span className="flex items-center gap-2">
              <span className="text-base">🟣</span> Microsoft Teams
            </span>
          </div>
        </div>
      </section>

      {/* Live demo section */}
      <section className="bg-white py-20 md:py-28">
        <div className="mx-auto max-w-4xl px-6">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold tracking-wider text-forest uppercase">
              Interactive Demo
            </p>
            <h2 className="mt-3 font-display text-3xl font-semibold text-stone-900 md:text-5xl">
              Try it yourself
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-stone-500 leading-relaxed">
              Experience a real AI-powered feedback conversation. Enter your
              email to start — the same LLM that powers production generates
              every question.
            </p>
          </div>

          <DemoChatPublic />
        </div>
      </section>
    </>
  );
}
