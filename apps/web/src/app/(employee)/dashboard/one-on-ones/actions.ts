"use server";

import {
  createOneOnOneNote,
  updateOneOnOneNote,
  deleteOneOnOneNote,
  getOneOnOneNoteHistory,
} from "@/lib/api";
import type { OneOnOneRevisionRow } from "@/lib/api";
import { revalidatePath } from "next/cache";

export async function addOneOnOneEntry(formData: FormData) {
  const partnerId = formData.get("partnerId") as string;
  const content = formData.get("content") as string;

  if (!partnerId || !content) {
    return { error: "Partner and content are required" };
  }

  try {
    await createOneOnOneNote({ partnerId, content });
    revalidatePath("/dashboard/one-on-ones");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to add entry" };
  }
}

export async function editOneOnOneEntry(formData: FormData) {
  const entryId = formData.get("entryId") as string;
  const content = formData.get("content") as string;

  if (!entryId || !content) {
    return { error: "Entry ID and content are required" };
  }

  try {
    await updateOneOnOneNote(entryId, { content });
    revalidatePath("/dashboard/one-on-ones");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update entry" };
  }
}

export async function deleteOneOnOneEntry(formData: FormData) {
  const entryId = formData.get("entryId") as string;

  if (!entryId) {
    return { error: "Entry ID is required" };
  }

  try {
    await deleteOneOnOneNote(entryId);
    revalidatePath("/dashboard/one-on-ones");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete entry" };
  }
}

export async function fetchOneOnOneHistory(
  entryId: string,
): Promise<{ data: OneOnOneRevisionRow[] }> {
  try {
    return await getOneOnOneNoteHistory(entryId);
  } catch {
    return { data: [] };
  }
}
