"use client";

import { useTransition, useState } from "react";
import type { OneOnOneEntryRow, OneOnOneRevisionRow } from "@/lib/api";

interface OneOnOneTimelineProps {
  entries: OneOnOneEntryRow[];
  currentUserId: string;
  partnerId: string;
  partnerName: string;
  addAction: (formData: FormData) => Promise<{ error?: string; success?: boolean }>;
  editAction: (formData: FormData) => Promise<{ error?: string; success?: boolean }>;
  getHistoryAction: (entryId: string) => Promise<{ data: OneOnOneRevisionRow[] }>;
}

export function OneOnOneTimeline({
  entries,
  currentUserId,
  partnerId,
  partnerName,
  addAction,
  editAction,
  getHistoryAction,
}: OneOnOneTimelineProps) {
  const [isPending, startTransition] = useTransition();
  const [newContent, setNewContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<OneOnOneRevisionRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  function handleAdd() {
    if (!newContent.trim()) return;
    const formData = new FormData();
    formData.set("partnerId", partnerId);
    formData.set("content", newContent.trim());
    startTransition(async () => {
      await addAction(formData);
      setNewContent("");
    });
  }

  function handleEdit(entryId: string) {
    if (!editContent.trim()) return;
    const formData = new FormData();
    formData.set("entryId", entryId);
    formData.set("partnerId", partnerId);
    formData.set("content", editContent.trim());
    startTransition(async () => {
      await editAction(formData);
      setEditingId(null);
      setEditContent("");
    });
  }

  async function toggleHistory(entryId: string) {
    if (expandedHistory === entryId) {
      setExpandedHistory(null);
      setRevisions([]);
      return;
    }

    setLoadingHistory(true);
    setExpandedHistory(entryId);
    try {
      const result = await getHistoryAction(entryId);
      setRevisions(result.data ?? []);
    } catch {
      setRevisions([]);
    } finally {
      setLoadingHistory(false);
    }
  }

  function getInitials(name: string) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("");
  }

  function isEdited(entry: OneOnOneEntryRow) {
    return entry.updatedAt !== entry.createdAt;
  }

  // Determine which user is the manager based on entry data
  function isManagerEntry(entry: OneOnOneEntryRow) {
    return entry.authorId === entry.managerId;
  }

  return (
    <div>
      {/* Timeline entries */}
      {entries.length === 0 ? (
        <p className="mb-6 text-sm text-stone-400">
          No shared notes yet. Start your 1:1 notes with {partnerName} below.
        </p>
      ) : (
        <div className="mb-6 space-y-3">
          {entries.map((entry) => {
            const isOwn = entry.authorId === currentUserId;
            const isManager = isManagerEntry(entry);
            const borderColor = isManager
              ? "border-l-forest"
              : "border-l-terracotta";

            return (
              <div
                key={entry.id}
                className={`rounded-xl border border-stone-200/60 border-l-4 ${borderColor} bg-white p-4`}
                style={{ boxShadow: "var(--shadow-sm)" }}
              >
                {editingId === entry.id ? (
                  <div>
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={3}
                      className="w-full resize-none rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800 focus:border-forest/40 focus:outline-none focus:ring-2 focus:ring-forest/10"
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <button
                        onClick={() => setEditingId(null)}
                        className="rounded-lg px-3 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-100"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleEdit(entry.id)}
                        disabled={isPending || !editContent.trim()}
                        className="rounded-lg bg-forest px-3 py-1.5 text-xs font-medium text-white hover:bg-forest/90 disabled:opacity-50"
                      >
                        {isPending ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    {/* Author header */}
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold ${
                          isManager
                            ? "bg-forest/10 text-forest"
                            : "bg-terracotta/10 text-terracotta"
                        }`}
                      >
                        {getInitials(entry.authorName)}
                      </div>
                      <span className="text-sm font-medium text-stone-800">
                        {entry.authorName}
                      </span>
                      <span className="text-xs text-stone-400">
                        {new Date(entry.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                      {isEdited(entry) && (
                        <button
                          onClick={() => toggleHistory(entry.id)}
                          className="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
                        >
                          (edited)
                        </button>
                      )}
                    </div>

                    {/* Content */}
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-stone-600">
                      {entry.content}
                    </p>

                    {/* Actions */}
                    <div className="mt-3 flex items-center justify-between">
                      <div>
                        {isEdited(entry) && expandedHistory === entry.id && (
                          <div className="space-y-2">
                            {loadingHistory ? (
                              <p className="text-xs text-stone-400">
                                Loading history...
                              </p>
                            ) : revisions.length === 0 ? (
                              <p className="text-xs text-stone-400">
                                No revision history available.
                              </p>
                            ) : (
                              revisions.map((rev) => (
                                <div
                                  key={rev.id}
                                  className="rounded-lg bg-stone-50 px-3 py-2"
                                >
                                  <p className="text-xs text-stone-400">
                                    Previous version &middot;{" "}
                                    {new Date(rev.editedAt).toLocaleDateString(
                                      "en-US",
                                      {
                                        month: "short",
                                        day: "numeric",
                                        hour: "numeric",
                                        minute: "2-digit",
                                      },
                                    )}
                                  </p>
                                  <p className="mt-1 whitespace-pre-wrap text-xs text-stone-500">
                                    {rev.previousContent}
                                  </p>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                      {isOwn && (
                        <button
                          onClick={() => {
                            setEditingId(entry.id);
                            setEditContent(entry.content);
                          }}
                          className="rounded-lg px-2.5 py-1 text-xs font-medium text-stone-500 hover:bg-stone-100"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add entry */}
      <div>
        <textarea
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder={`Add a note for your 1:1 with ${partnerName}...`}
          rows={3}
          className="w-full resize-none rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-800 placeholder:text-stone-400 focus:border-forest/40 focus:outline-none focus:ring-2 focus:ring-forest/10"
        />
        <div className="mt-2 flex justify-end">
          <button
            onClick={handleAdd}
            disabled={isPending || !newContent.trim()}
            className="rounded-xl bg-forest px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-forest/90 disabled:opacity-50"
          >
            {isPending ? "Adding..." : "Add Note"}
          </button>
        </div>
      </div>
    </div>
  );
}
