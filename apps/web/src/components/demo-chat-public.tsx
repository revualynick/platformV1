"use client";

import { useState, useRef, useEffect } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

interface Message {
  role: "assistant" | "user";
  content: string;
}

interface ConversationMeta {
  conversationId: string;
  phase: string;
  messageCount: number;
  maxMessages: number;
  interactionType: string;
}

export function DemoChatPublic() {
  const [email, setEmail] = useState("");
  const [leadRegistered, setLeadRegistered] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [meta, setMeta] = useState<ConversationMeta | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (!loading && !closed && meta) {
      inputRef.current?.focus();
    }
  }, [loading, closed, meta]);

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/v1/demo/lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to register. Please try again.");
        setLoading(false);
        return;
      }

      setLeadRegistered(true);
      setLoading(false);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  async function handleStart() {
    setLoading(true);
    setError(null);
    setMessages([]);
    setClosed(false);

    try {
      const res = await fetch(`${API_BASE}/api/v1/demo/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-demo-email": email,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to start conversation");
        setLoading(false);
        return;
      }

      setMeta({
        conversationId: data.conversationId,
        phase: data.phase,
        messageCount: data.messageCount,
        maxMessages: data.maxMessages,
        interactionType: data.interactionType,
      });
      setMessages([{ role: "assistant", content: data.message }]);
    } catch {
      setError("Network error. Please try again.");
    }
    setLoading(false);
  }

  async function handleSend() {
    if (!input.trim() || !meta || loading || closed) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `${API_BASE}/api/v1/demo/${meta.conversationId}/reply`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-demo-email": email,
          },
          body: JSON.stringify({ message: userMessage }),
        },
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to send reply");
        setLoading(false);
        return;
      }

      setMeta((prev) =>
        prev
          ? {
              ...prev,
              phase: data.phase,
              messageCount: data.messageCount,
              maxMessages: data.maxMessages,
            }
          : prev,
      );
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.message },
      ]);

      if (data.closed) {
        setClosed(true);
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setLoading(false);
  }

  const phaseLabel: Record<string, string> = {
    opening: "Opening",
    exploring: "Exploring",
    follow_up: "Follow-up",
    closing: "Closing",
  };

  const typeLabel: Record<string, string> = {
    peer_review: "Peer Review",
    self_reflection: "Self-Reflection",
    three_sixty: "360 Review",
    pulse_check: "Pulse Check",
  };

  // Email gate
  if (!leadRegistered) {
    return (
      <div className="mx-auto max-w-md">
        <div className="rounded-3xl border border-stone-200 bg-white p-8 shadow-xl">
          <div className="text-center mb-6">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-forest/10">
              <svg
                className="h-6 w-6 text-forest"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
                />
              </svg>
            </div>
            <h2 className="font-display text-xl font-semibold text-stone-900">
              Try the live demo
            </h2>
            <p className="mt-2 text-sm text-stone-500">
              Enter your email to start an AI-powered feedback conversation.
              No account needed.
            </p>
          </div>

          <form onSubmit={handleEmailSubmit} className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700 placeholder:text-stone-400 outline-none focus:border-forest focus:ring-1 focus:ring-forest"
            />
            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full rounded-xl bg-forest px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-forest-light disabled:opacity-50 shadow-[0_8px_20px_rgba(61,24,55,0.25)]"
            >
              {loading ? "Loading..." : "Start Demo"}
            </button>
          </form>

          {error && (
            <p className="mt-3 text-center text-xs text-red-600">{error}</p>
          )}

          <p className="mt-4 text-center text-[11px] text-stone-400">
            3 demo conversations per day. No spam, ever.
          </p>
        </div>
      </div>
    );
  }

  // Chat UI (same pattern as authenticated demo-chat)
  return (
    <div className="flex flex-col items-center gap-6 md:flex-row md:items-start md:justify-center">
      <div className="w-full max-w-lg">
        <div className="rounded-3xl border border-stone-200 bg-white shadow-xl overflow-hidden">
          {/* Chat header */}
          <div className="flex items-center gap-3 border-b border-stone-100 bg-forest px-5 py-3.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 text-xs font-semibold text-white font-display">
              R
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Revualy</p>
              <p className="text-[11px] text-white/50">
                Demo &middot; Live LLM
              </p>
            </div>
            {meta && !closed && (
              <div className="ml-auto flex h-2 w-2 rounded-full bg-forest-light animate-pulse" />
            )}
            {closed && (
              <span className="ml-auto text-[11px] text-white/50">
                Completed
              </span>
            )}
          </div>

          {/* Messages area */}
          <div className="flex flex-col gap-3 p-5 min-h-[400px] max-h-[500px] overflow-y-auto">
            {messages.length === 0 && !loading && (
              <div className="flex flex-1 items-center justify-center">
                <button
                  onClick={handleStart}
                  className="rounded-xl bg-forest px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-forest-dark shadow-[0_8px_20px_rgba(61,24,55,0.25)]"
                >
                  Start Conversation
                </button>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed ${
                  msg.role === "assistant"
                    ? "self-start rounded-bl-sm bg-stone-50 text-stone-700"
                    : "self-end rounded-br-sm bg-forest text-white"
                }`}
              >
                {msg.content}
              </div>
            ))}

            {loading && (
              <div className="max-w-[85%] self-start rounded-2xl rounded-bl-sm bg-stone-50 px-4 py-3">
                <div className="flex items-center gap-1">
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

            {closed && (
              <div className="self-center rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2 text-xs text-emerald-700 text-center">
                Conversation complete — analysis queued
              </div>
            )}

            {error && (
              <div className="self-center rounded-xl bg-red-50 border border-red-200 px-4 py-2 text-xs text-red-700 text-center">
                {error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input bar */}
          <div className="border-t border-stone-100 bg-stone-50/50 px-4 py-3">
            {closed ? (
              <button
                onClick={handleStart}
                className="w-full rounded-xl bg-forest px-4 py-2.5 text-xs font-medium text-white transition-colors hover:bg-forest-dark shadow-[0_8px_20px_rgba(61,24,55,0.25)]"
              >
                Start New Conversation
              </button>
            ) : meta ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex items-center gap-2 rounded-xl bg-white border border-stone-200 px-3 py-2"
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type your reply..."
                  disabled={loading}
                  className="flex-1 bg-transparent text-xs text-stone-700 placeholder:text-stone-300 outline-none"
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="text-forest disabled:text-stone-300 transition-colors"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"
                    />
                  </svg>
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-2 rounded-xl bg-white border border-stone-200 px-3 py-2">
                <span className="flex-1 text-xs text-stone-300">
                  Click &quot;Start Conversation&quot; to begin...
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Metadata sidebar */}
      {meta && (
        <div className="w-56 space-y-4">
          <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">
              Session Info
            </h3>
            <dl className="space-y-2.5 text-xs">
              <div>
                <dt className="text-stone-400">Type</dt>
                <dd className="font-medium text-stone-700">
                  {typeLabel[meta.interactionType] ?? meta.interactionType}
                </dd>
              </div>
              <div>
                <dt className="text-stone-400">Phase</dt>
                <dd>
                  <span className="inline-block rounded-full bg-forest/10 text-forest px-2 py-0.5 text-[11px] font-medium">
                    {phaseLabel[meta.phase] ?? meta.phase}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-stone-400">Messages</dt>
                <dd className="font-medium text-stone-700">
                  {meta.messageCount} / {meta.maxMessages}
                </dd>
              </div>
              <div>
                <dt className="text-stone-400">Status</dt>
                <dd className="font-medium text-stone-700">
                  {closed ? "Closed" : "Active"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">
              How it works
            </h3>
            <p className="text-[11px] text-stone-500 leading-relaxed">
              This is a real AI conversation — the same LLM that powers
              production Revualy instances generates every question based on
              configurable themes. Your replies flow through the full feedback
              analysis pipeline.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
