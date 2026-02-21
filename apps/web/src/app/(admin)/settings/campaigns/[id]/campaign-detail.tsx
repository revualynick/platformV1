"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import type { CampaignRow } from "@/lib/api";
import { campaignStatusStyles } from "@/lib/style-constants";
import { advanceCampaignAction, sendCampaignChatAction } from "../actions";

type Tab = "details" | "themes" | "assistant";

const tabs: { value: Tab; label: string }[] = [
  { value: "details", label: "Details" },
  { value: "themes", label: "Themes" },
  { value: "assistant", label: "AI Assistant" },
];

const statusOrder: CampaignRow["status"][] = [
  "draft",
  "scheduled",
  "collecting",
  "analyzing",
  "complete",
];

function getNextStatus(
  current: CampaignRow["status"],
): CampaignRow["status"] | null {
  const idx = statusOrder.indexOf(current);
  if (idx < 0 || idx >= statusOrder.length - 1) return null;
  return statusOrder[idx + 1];
}

function formatDate(d: string | null): string {
  if (!d) return "Not set";
  return new Date(d).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  suggestions?: string[];
}

interface CampaignDetailProps {
  campaign: CampaignRow;
}

export function CampaignDetail({ campaign }: CampaignDetailProps) {
  const [activeTab, setActiveTab] = useState<Tab>("details");
  const [isPending, startTransition] = useTransition();
  const [advanceError, setAdvanceError] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState(campaign.status);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isSending, startSendTransition] = useTransition();
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const nextStatus = getNextStatus(currentStatus);
  const nextStatusStyle = nextStatus
    ? campaignStatusStyles[nextStatus]
    : null;

  function handleAdvance() {
    setAdvanceError(null);
    startTransition(async () => {
      const result = await advanceCampaignAction(campaign.id);
      if (result.ok && result.status) {
        setCurrentStatus(result.status as CampaignRow["status"]);
      } else if (!result.ok) {
        setAdvanceError(result.error);
      }
    });
  }

  function handleSendMessage() {
    const text = chatInput.trim();
    if (!text) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setChatInput("");

    startSendTransition(async () => {
      const result = await sendCampaignChatAction(campaign.id, text);
      if (result.ok) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: result.reply,
            suggestions: result.suggestions,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Error: ${result.error}`,
          },
        ]);
      }
    });
  }

  const themes = campaign.questionnaire?.themes ?? [];

  return (
    <>
      {/* Tabs */}
      <div
        className="card-enter mb-6 flex gap-1 rounded-xl border border-stone-200/60 bg-stone-50 p-1"
        style={{ animationDelay: "160ms" }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`flex-1 rounded-lg px-4 py-2 text-xs font-medium transition-colors ${
              activeTab === tab.value
                ? "bg-white text-stone-800 shadow-sm"
                : "text-stone-400 hover:text-stone-600"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Details tab */}
      {activeTab === "details" && (
        <div
          className="card-enter space-y-6"
          style={{ animationDelay: "240ms" }}
        >
          {/* Info grid */}
          <div
            className="rounded-2xl border border-stone-200/60 bg-white p-6"
            style={{ boxShadow: "var(--shadow-sm)" }}
          >
            <h3 className="mb-4 font-display text-sm font-semibold text-stone-800">
              Campaign Information
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <span className="text-[11px] font-medium uppercase tracking-wider text-stone-400">
                  Status
                </span>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${campaignStatusStyles[currentStatus]?.dot}`}
                  />
                  <span
                    className={`text-sm font-medium ${campaignStatusStyles[currentStatus]?.text}`}
                  >
                    {campaignStatusStyles[currentStatus]?.label}
                  </span>
                </div>
              </div>
              <div>
                <span className="text-[11px] font-medium uppercase tracking-wider text-stone-400">
                  Target Audience
                </span>
                <p className="mt-1 text-sm text-stone-700">
                  {campaign.targetAudience ?? "Not specified"}
                </p>
              </div>
              <div>
                <span className="text-[11px] font-medium uppercase tracking-wider text-stone-400">
                  Start Date
                </span>
                <p className="mt-1 text-sm text-stone-700">
                  {formatDate(campaign.startDate)}
                </p>
              </div>
              <div>
                <span className="text-[11px] font-medium uppercase tracking-wider text-stone-400">
                  End Date
                </span>
                <p className="mt-1 text-sm text-stone-700">
                  {formatDate(campaign.endDate)}
                </p>
              </div>
              <div>
                <span className="text-[11px] font-medium uppercase tracking-wider text-stone-400">
                  Questionnaire
                </span>
                <p className="mt-1 text-sm text-stone-700">
                  {campaign.questionnaire?.name ?? "None linked"}
                </p>
              </div>
              <div>
                <span className="text-[11px] font-medium uppercase tracking-wider text-stone-400">
                  Created
                </span>
                <p className="mt-1 text-sm text-stone-700">
                  {formatDate(campaign.createdAt)}
                </p>
              </div>
            </div>
          </div>

          {/* Lifecycle advancement */}
          {nextStatus && (
            <div
              className="rounded-2xl border border-stone-200/60 bg-white p-6"
              style={{ boxShadow: "var(--shadow-sm)" }}
            >
              <h3 className="mb-3 font-display text-sm font-semibold text-stone-800">
                Lifecycle
              </h3>
              <p className="mb-4 text-xs text-stone-500">
                Advance this campaign to the next stage in its lifecycle.
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleAdvance}
                  disabled={isPending}
                  className="rounded-xl bg-forest px-4 py-2.5 text-xs font-medium text-white hover:bg-forest-light disabled:opacity-50"
                >
                  {isPending ? "Advancing..." : `Advance to ${nextStatusStyle?.label}`}
                </button>
                <span className="flex items-center gap-1.5 text-xs text-stone-400">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${campaignStatusStyles[currentStatus]?.dot}`}
                  />
                  {campaignStatusStyles[currentStatus]?.label}
                  <svg
                    className="h-3 w-3 text-stone-300"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                    />
                  </svg>
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${nextStatusStyle?.dot}`}
                  />
                  {nextStatusStyle?.label}
                </span>
              </div>
              {advanceError && (
                <p className="mt-3 text-xs text-danger">{advanceError}</p>
              )}
            </div>
          )}

          {!nextStatus && (
            <div
              className="rounded-2xl border border-positive/20 bg-positive/5 p-6"
              style={{ boxShadow: "var(--shadow-sm)" }}
            >
              <p className="text-sm font-medium text-positive">
                This campaign has completed its lifecycle.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Themes tab */}
      {activeTab === "themes" && (
        <div
          className="card-enter"
          style={{ animationDelay: "240ms" }}
        >
          {themes.length > 0 ? (
            <div className="space-y-4">
              <p className="text-[11px] font-medium uppercase tracking-wider text-stone-400">
                {themes.length} Theme{themes.length !== 1 ? "s" : ""} from{" "}
                {campaign.questionnaire?.name}
              </p>
              {themes.map((theme, i) => (
                <div
                  key={theme.id}
                  className="card-enter rounded-2xl border border-stone-200/60 bg-white p-6"
                  style={{
                    animationDelay: `${300 + i * 80}ms`,
                    boxShadow: "var(--shadow-sm)",
                  }}
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-forest/10 text-xs font-bold text-forest">
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-stone-800">
                        {theme.intent}
                      </h4>
                      <p className="mt-1 text-xs text-stone-500">
                        Goal: {theme.dataGoal}
                      </p>
                      {theme.examplePhrasings.length > 0 && (
                        <div className="mt-3">
                          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-stone-300">
                            Example phrasings
                          </p>
                          <div className="space-y-1">
                            {theme.examplePhrasings.map((p, pi) => (
                              <p
                                key={pi}
                                className="text-xs italic leading-relaxed text-stone-400"
                              >
                                &ldquo;{p}&rdquo;
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-stone-200 p-12 text-center">
              <p className="text-sm text-stone-400">
                No themes yet. Link a questionnaire to this campaign to see
                themes here.
              </p>
            </div>
          )}
        </div>
      )}

      {/* AI Assistant tab */}
      {activeTab === "assistant" && (
        <div
          className="card-enter"
          style={{ animationDelay: "240ms" }}
        >
          <div
            className="flex h-[500px] flex-col rounded-2xl border border-stone-200/60 bg-white"
            style={{ boxShadow: "var(--shadow-sm)" }}
          >
            {/* Chat messages */}
            <div className="flex-1 overflow-y-auto p-6">
              {messages.length === 0 && (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-forest/10">
                      <svg
                        className="h-5 w-5 text-forest"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
                        />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-stone-600">
                      Campaign AI Assistant
                    </p>
                    <p className="mt-1 text-xs text-stone-400">
                      Ask questions about this campaign, get suggestions for
                      themes, or discuss the feedback data.
                    </p>
                  </div>
                </div>
              )}
              <div className="space-y-4">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                        msg.role === "user"
                          ? "bg-forest text-white"
                          : "border border-stone-100 bg-stone-50 text-stone-700"
                      }`}
                    >
                      <p className="text-sm leading-relaxed">{msg.content}</p>
                      {msg.suggestions && msg.suggestions.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {msg.suggestions.map((s, si) => (
                            <span
                              key={si}
                              className="rounded-full border border-stone-200 bg-white px-3 py-1 text-[10px] font-medium text-stone-500"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {isSending && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl border border-stone-100 bg-stone-50 px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-stone-300" />
                        <span
                          className="h-1.5 w-1.5 animate-pulse rounded-full bg-stone-300"
                          style={{ animationDelay: "200ms" }}
                        />
                        <span
                          className="h-1.5 w-1.5 animate-pulse rounded-full bg-stone-300"
                          style={{ animationDelay: "400ms" }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-stone-100 p-4">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Ask something about this campaign..."
                  className="flex-1 rounded-xl border border-stone-200 px-4 py-2.5 text-sm text-stone-800 outline-none focus:border-forest focus:ring-1 focus:ring-forest"
                  disabled={isSending}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={isSending || !chatInput.trim()}
                  className="rounded-xl bg-forest px-4 py-2.5 text-xs font-medium text-white hover:bg-forest-light disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
