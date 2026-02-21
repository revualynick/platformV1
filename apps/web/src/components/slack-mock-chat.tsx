"use client";

import { useState, useEffect } from "react";

const channels = [
  { name: "general", unread: false },
  { name: "engineering", unread: true },
  { name: "design", unread: false },
  { name: "random", unread: false },
];

const dmMessages = [
  {
    sender: "bot",
    text: "Hey Alex! Quick peer review — what's one thing Jamie did well this sprint?",
    delay: 1800,
  },
  {
    sender: "user",
    text: "She noticed our deploy pipeline was flaky and fixed it over the weekend. Didn't even wait to be asked.",
    delay: 3200,
  },
  {
    sender: "bot",
    text: "Great example of ownership. Can you think of a specific impact that had on the team?",
    delay: 2600,
  },
  {
    sender: "user",
    text: "It unblocked three PRs that were stuck. Raj said it saved him half a day.",
    delay: 2800,
  },
  {
    sender: "bot",
    text: "Perfect — tagged under Ownership and Collaboration. That's it for this week, thanks Alex!",
    delay: 2400,
  },
];

export function SlackMockChat() {
  const [visibleCount, setVisibleCount] = useState(0);
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    if (visibleCount >= dmMessages.length) return;

    const nextMessage = dmMessages[visibleCount];
    setIsTyping(true);

    const timer = setTimeout(() => {
      setIsTyping(false);
      setVisibleCount((c) => c + 1);
    }, nextMessage.delay);

    return () => clearTimeout(timer);
  }, [visibleCount]);

  useEffect(() => {
    if (visibleCount < dmMessages.length) return;

    const restartTimer = setTimeout(() => {
      setVisibleCount(0);
    }, 4000);

    return () => clearTimeout(restartTimer);
  }, [visibleCount]);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="rounded-2xl border border-stone-200/80 bg-white shadow-xl overflow-hidden">
        <div className="flex h-[440px]">
          {/* Slack sidebar */}
          <div className="w-[180px] shrink-0 bg-[#1a1d21] text-white/80 flex flex-col">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
              <div className="h-6 w-6 rounded-md bg-forest flex items-center justify-center text-[10px] font-bold text-white">
                A
              </div>
              <span className="text-sm font-semibold text-white truncate">
                Acme Inc
              </span>
            </div>

            <div className="px-3 pt-3 pb-1">
              <p className="text-[11px] font-medium text-white/40 uppercase tracking-wider px-1">
                Channels
              </p>
            </div>
            <div className="flex flex-col gap-0.5 px-2">
              {channels.map((ch) => (
                <div
                  key={ch.name}
                  className="flex items-center gap-2 rounded-md px-2 py-1 text-[13px] text-white/60 hover:bg-white/5"
                >
                  <span className="text-white/30">#</span>
                  <span>{ch.name}</span>
                  {ch.unread && (
                    <span className="ml-auto h-2 w-2 rounded-full bg-red-400" />
                  )}
                </div>
              ))}
            </div>

            <div className="px-3 pt-4 pb-1">
              <p className="text-[11px] font-medium text-white/40 uppercase tracking-wider px-1">
                Direct Messages
              </p>
            </div>
            <div className="flex flex-col gap-0.5 px-2">
              <div className="flex items-center gap-2 rounded-md bg-forest/40 px-2 py-1 text-[13px] text-white">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-forest text-[9px] font-bold text-white">
                  R
                </span>
                <span>Revualy</span>
                <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  1
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-md px-2 py-1 text-[13px] text-white/50">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[10px]">
                  J
                </span>
                <span>Jamie L.</span>
              </div>
              <div className="flex items-center gap-2 rounded-md px-2 py-1 text-[13px] text-white/50">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[10px]">
                  R
                </span>
                <span>Raj P.</span>
              </div>
            </div>
          </div>

          {/* Main chat area */}
          <div className="flex flex-1 flex-col bg-white">
            {/* Chat header */}
            <div className="flex items-center gap-2 border-b border-stone-100 px-4 py-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-forest text-[11px] font-bold text-white">
                R
              </span>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-stone-800">
                    Revualy
                  </span>
                  <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-500 uppercase">
                    App
                  </span>
                </div>
              </div>
              <div className="ml-auto flex h-2 w-2 rounded-full bg-green-500" />
            </div>

            {/* Messages */}
            <div className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 py-3">
              {dmMessages.slice(0, visibleCount).map((msg, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 py-1"
                  style={{
                    animation:
                      "chat-msg-enter 0.25s cubic-bezier(0.22, 1, 0.36, 1) forwards",
                  }}
                >
                  {msg.sender === "bot" ? (
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-forest text-[10px] font-bold text-white">
                      R
                    </span>
                  ) : (
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white">
                      A
                    </span>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[13px] font-semibold text-stone-800">
                        {msg.sender === "bot" ? "Revualy" : "Alex Chen"}
                      </span>
                      {msg.sender === "bot" && (
                        <span className="rounded bg-stone-100 px-1 py-0.5 text-[9px] font-medium text-stone-400 uppercase">
                          App
                        </span>
                      )}
                      <span className="text-[11px] text-stone-300">
                        {`${10 + i}:${15 + i * 2} AM`}
                      </span>
                    </div>
                    <p className="text-[13px] leading-relaxed text-stone-600">
                      {msg.text}
                    </p>
                  </div>
                </div>
              ))}

              {isTyping && (
                <div className="flex items-start gap-2 py-1">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-forest text-[10px] font-bold text-white">
                    R
                  </span>
                  <div className="flex items-center gap-1 pt-2">
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full bg-stone-400 animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    />
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full bg-stone-400 animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    />
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full bg-stone-400 animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Input bar */}
            <div className="border-t border-stone-100 px-4 py-2.5">
              <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
                <span className="text-xs text-stone-300">
                  Message Revualy...
                </span>
                <svg
                  className="ml-auto h-4 w-4 text-stone-300"
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
      </div>
    </div>
  );
}
