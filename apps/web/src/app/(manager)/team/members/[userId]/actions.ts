"use server";

import {
  createManagerNote,
  updateManagerNote,
  deleteManagerNote,
  createOneOnOneNote,
  updateOneOnOneNote,
  deleteOneOnOneNote,
  getOneOnOneNoteHistory,
} from "@/lib/api";
import type { OneOnOneRevisionRow } from "@/lib/api";
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

// ── Shared 1:1 Notes ────────────────────────────────

export async function addSharedNote(formData: FormData) {
  const partnerId = formData.get("partnerId") as string;
  const content = formData.get("content") as string;

  if (!partnerId || !content) {
    return { error: "Partner and content are required" };
  }

  try {
    await createOneOnOneNote({ partnerId, content });
    revalidatePath(`/team/members/${partnerId}`);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to add shared note" };
  }
}

export async function editSharedNote(formData: FormData) {
  const entryId = formData.get("entryId") as string;
  const content = formData.get("content") as string;
  const partnerId = formData.get("partnerId") as string;

  if (!entryId || !content) {
    return { error: "Entry ID and content are required" };
  }

  try {
    await updateOneOnOneNote(entryId, { content });
    if (partnerId) revalidatePath(`/team/members/${partnerId}`);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update shared note" };
  }
}

export async function deleteSharedNote(formData: FormData) {
  const entryId = formData.get("entryId") as string;
  const partnerId = formData.get("partnerId") as string;

  if (!entryId) {
    return { error: "Entry ID is required" };
  }

  try {
    await deleteOneOnOneNote(entryId);
    if (partnerId) revalidatePath(`/team/members/${partnerId}`);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete shared note" };
  }
}

export async function fetchSharedNoteHistory(
  entryId: string,
): Promise<{ data: OneOnOneRevisionRow[] }> {
  try {
    return await getOneOnOneNoteHistory(entryId);
  } catch {
    return { data: [] };
  }
}
