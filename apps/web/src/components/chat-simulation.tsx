"use client";

import { useState, useEffect } from "react";

const messages = [
  {
    sender: "bot",
    text: "Hey! Got a quick one for you — when did Jamie go above and beyond for the team recently?",
    delay: 1400,
  },
  {
    sender: "user",
    text: "Oh easy — she noticed our deploy pipeline was flaky and just fixed it over the weekend. Didn't even wait to be asked.",
    delay: 3600,
  },
  {
    sender: "bot",
    text: "Love that. I've tagged it under \"Ownership\". Anything else you'd add?",
    delay: 2800,
  },
  {
    sender: "user",
    text: "She also looped in Raj when she hit a tricky part instead of spinning her wheels. Good instinct.",
    delay: 3000,
  },
  {
    sender: "bot",
    text: "Nice — added \"Collaboration\" too. That's it for this week, thanks!",
    delay: 2200,
  },
];

export function ChatSimulation() {
  const [visibleCount, setVisibleCount] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [typingSender, setTypingSender] = useState<"bot" | "user">("bot");

  useEffect(() => {
    if (visibleCount >= messages.length) return;

    const nextMessage = messages[visibleCount];
    setIsTyping(true);
    setTypingSender(nextMessage.sender as "bot" | "user");

    const timer = setTimeout(() => {
      setIsTyping(false);
      setVisibleCount((c) => c + 1);
    }, nextMessage.delay);

    return () => clearTimeout(timer);
  }, [visibleCount]);

  // Restart loop after all messages shown
  useEffect(() => {
    if (visibleCount < messages.length) return;

    const restartTimer = setTimeout(() => {
      setVisibleCount(0);
    }, 4000);

    return () => clearTimeout(restartTimer);
  }, [visibleCount]);

  return (
    <div className="mx-auto w-full max-w-sm">
      {/* Phone frame */}
      <div className="rounded-3xl border border-stone-200 bg-white shadow-xl overflow-hidden">
        {/* Chat header */}
        <div className="flex items-center gap-3 border-b border-stone-100 bg-forest px-5 py-3.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 text-xs font-semibold text-white font-display">
            R
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Revualy</p>
            <p className="text-[11px] text-white/50">Feedback · #general</p>
          </div>
          <div className="ml-auto flex h-2 w-2 rounded-full bg-forest-light animate-pulse" />
        </div>

        {/* Messages area */}
        <div className="flex flex-col gap-3 p-5 min-h-[340px]">
          {messages.slice(0, visibleCount).map((msg, i) => (
            <div
              key={i}
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed transition-all duration-300 ${
                msg.sender === "bot"
                  ? "self-start rounded-bl-sm bg-stone-50 text-stone-700"
                  : "self-end rounded-br-sm bg-forest text-white"
              }`}
              style={{
                animation: "chat-msg-enter 0.3s cubic-bezier(0.22, 1, 0.36, 1) forwards",
              }}
            >
              {msg.text}
            </div>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                typingSender === "bot"
                  ? "self-start rounded-bl-sm bg-stone-50"
                  : "self-end rounded-br-sm bg-forest/80"
              }`}
            >
              <div className="flex items-center gap-1">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full animate-bounce ${
                    typingSender === "bot" ? "bg-stone-400" : "bg-white/60"
                  }`}
                  style={{ animationDelay: "0ms" }}
                />
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full animate-bounce ${
                    typingSender === "bot" ? "bg-stone-400" : "bg-white/60"
                  }`}
                  style={{ animationDelay: "150ms" }}
                />
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full animate-bounce ${
                    typingSender === "bot" ? "bg-stone-400" : "bg-white/60"
                  }`}
                  style={{ animationDelay: "300ms" }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Input bar */}
        <div className="border-t border-stone-100 bg-stone-50/50 px-4 py-3">
          <div className="flex items-center gap-2 rounded-xl bg-white border border-stone-200 px-3 py-2">
            <span className="flex-1 text-xs text-stone-300">Message Revualy...</span>
            <svg
              className="h-4 w-4 text-stone-300"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
