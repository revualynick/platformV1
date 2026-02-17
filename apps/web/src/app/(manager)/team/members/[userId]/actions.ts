"use server";

import {
  createManagerNote,
  updateManagerNote,
  deleteManagerNote,
} from "@/lib/api";
import { revalidatePath } from "next/cache";

export async function addNote(formData: FormData) {
  const subjectId = formData.get("subjectId") as string;
  const content = formData.get("content") as string;

  if (!subjectId || !content) {
    return { error: "Subject and content are required" };
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
  const noteId = formData.get("noteId") as string;
  const subjectId = formData.get("subjectId") as string;
  const content = formData.get("content") as string;

  if (!noteId || !content) {
    return { error: "Note ID and content are required" };
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
  const noteId = formData.get("noteId") as string;
  const subjectId = formData.get("subjectId") as string;

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
