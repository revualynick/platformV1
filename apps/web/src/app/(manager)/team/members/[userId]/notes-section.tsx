"use client";

import { useTransition, useState } from "react";
import type { ManagerNoteRow } from "@/lib/api";
import { addNote, editNote, removeNote } from "./actions";

export function NotesSection({
  notes,
  subjectId,
}: {
  notes: ManagerNoteRow[];
  subjectId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [newContent, setNewContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  function handleAdd() {
    if (!newContent.trim()) return;
    const formData = new FormData();
    formData.set("subjectId", subjectId);
    formData.set("content", newContent.trim());
    startTransition(async () => {
      await addNote(formData);
      setNewContent("");
    });
  }

  function handleEdit(noteId: string) {
    if (!editContent.trim()) return;
    const formData = new FormData();
    formData.set("noteId", noteId);
    formData.set("subjectId", subjectId);
    formData.set("content", editContent.trim());
    startTransition(async () => {
      await editNote(formData);
      setEditingId(null);
      setEditContent("");
    });
  }

  function handleDelete(noteId: string) {
    const formData = new FormData();
    formData.set("noteId", noteId);
    formData.set("subjectId", subjectId);
    startTransition(async () => {
      await removeNote(formData);
    });
  }

  function startEditing(note: ManagerNoteRow) {
    setEditingId(note.id);
    setEditContent(note.content);
  }

  return (
    <div>
      {/* Add note */}
      <div className="mb-6">
        <textarea
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder="Add a private note about this employee..."
          rows={3}
          className="w-full resize-none rounded-xl border border-stone-200 bg-surface px-4 py-3 text-sm text-stone-800 placeholder:text-stone-400 focus:border-forest/40 focus:outline-none focus:ring-2 focus:ring-forest/10"
        />
        <div className="mt-2 flex justify-end">
          <button
            onClick={handleAdd}
            disabled={isPending || !newContent.trim()}
            className="rounded-xl bg-forest shadow-[0_8px_20px_rgba(61,24,55,0.25)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-forest/90 disabled:opacity-50"
          >
            {isPending ? "Saving..." : "Add Note"}
          </button>
        </div>
      </div>

      {/* Notes list */}
      {notes.length === 0 ? (
        <p className="text-sm text-stone-400">
          No notes yet. Add your first note above.
        </p>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div
              key={note.id}
              className="rounded-xl border border-stone-200/60 bg-surface p-4"
              style={{ boxShadow: "var(--shadow-sm)" }}
            >
              {editingId === note.id ? (
                <div>
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={3}
                    className="w-full resize-none rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800 focus:border-forest/40 focus:outline-none focus:ring-2 focus:ring-forest/10"
                  />
                  <div className="mt-2 flex gap-2 justify-end">
                    <button
                      onClick={() => setEditingId(null)}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-100"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleEdit(note.id)}
                      disabled={isPending || !editContent.trim()}
                      className="rounded-lg bg-forest shadow-[0_8px_20px_rgba(61,24,55,0.25)] px-3 py-1.5 text-xs font-medium text-white hover:bg-forest/90 disabled:opacity-50"
                    >
                      {isPending ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="whitespace-pre-wrap text-sm text-stone-700">
                    {note.content}
                  </p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-stone-400">
                      {new Date(note.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                      {note.updatedAt !== note.createdAt && " (edited)"}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => startEditing(note)}
                        className="rounded-lg px-2.5 py-1 text-xs font-medium text-stone-500 hover:bg-stone-100"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(note.id)}
                        disabled={isPending}
                        className="rounded-lg px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger/5 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
