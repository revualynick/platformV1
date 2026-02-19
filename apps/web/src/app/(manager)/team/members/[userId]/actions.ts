"use server";

import {
  createManagerNote,
  updateManagerNote,
  deleteManagerNote,
} from "@/lib/api";
import { revalidatePath } from "next/cache";

/** Safely extract a string from FormData (returns null if missing or not a string). */
function getString(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  return typeof v === "string" && v.length > 0 ? v : null;
}

export async function addNote(formData: FormData) {
  const subjectId = getString(formData, "subjectId");
  const content = getString(formData, "content");

  if (!subjectId || !content) {
    return { error: "Subject and content are required" };
  }

  if (content.length > 10000) {
    return { error: "Note content must be under 10,000 characters" };
  }

  try {
    await createManagerNote({ subjectId, content });
    revalidatePath(`/team/members/${subjectId}`);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to add note" };
  }
}

export async function editNote(formData: FormData) {
  const noteId = getString(formData, "noteId");
  const subjectId = getString(formData, "subjectId");
  const content = getString(formData, "content");

  if (!noteId || !content) {
    return { error: "Note ID and content are required" };
  }

  if (content.length > 10000) {
    return { error: "Note content must be under 10,000 characters" };
  }

  try {
    await updateManagerNote(noteId, { content });
    revalidatePath(`/team/members/${subjectId}`);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update note" };
  }
}

export async function removeNote(formData: FormData) {
  const noteId = getString(formData, "noteId");
  const subjectId = getString(formData, "subjectId");

  if (!noteId) {
    return { error: "Note ID is required" };
  }

  try {
    await deleteManagerNote(noteId);
    revalidatePath(`/team/members/${subjectId}`);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete note" };
  }
}
