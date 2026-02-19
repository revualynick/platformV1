"use server";

import {
  createOneOnOneSession,
  updateOneOnOneSession,
  addActionItem,
  updateActionItem,
  deleteActionItem as deleteActionItemApi,
  addAgendaItem,
  updateAgendaItem,
  generateAgenda,
} from "@/lib/api";
import { revalidatePath } from "next/cache";

/** Safely extract a string from FormData (returns null if missing or not a string). */
function getString(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  return typeof v === "string" && v.length > 0 ? v : null;
}

export async function createSession(formData: FormData) {
  const employeeId = getString(formData, "employeeId");
  const scheduledAt = getString(formData, "scheduledAt");

  if (!employeeId || !scheduledAt) {
    return { error: "Employee ID and scheduled time are required" };
  }

  try {
    await createOneOnOneSession({ employeeId, scheduledAt });
    revalidatePath(`/team/members/${employeeId}/one-on-one`);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create session" };
  }
}

export async function startSession(formData: FormData) {
  const sessionId = getString(formData, "sessionId");
  if (!sessionId) return { error: "Session ID is required" };

  try {
    await updateOneOnOneSession(sessionId, { status: "active" });
    revalidatePath(`/team/members`);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to start session" };
  }
}

export async function endSession(formData: FormData) {
  const sessionId = getString(formData, "sessionId");
  if (!sessionId) return { error: "Session ID is required" };

  try {
    await updateOneOnOneSession(sessionId, { status: "completed" });
    revalidatePath(`/team/members`);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to end session" };
  }
}

export async function saveNotes(formData: FormData) {
  const sessionId = getString(formData, "sessionId");
  const notes = formData.get("notes");
  if (!sessionId) return { error: "Session ID is required" };

  try {
    await updateOneOnOneSession(sessionId, { notes: typeof notes === "string" ? notes : "" });
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save notes" };
  }
}

export async function addActionItemAction(formData: FormData) {
  const sessionId = getString(formData, "sessionId");
  const text = getString(formData, "text");
  const assigneeId = getString(formData, "assigneeId");

  if (!sessionId || !text) return { error: "Session ID and text are required" };

  try {
    await addActionItem(sessionId, {
      text,
      ...(assigneeId ? { assigneeId } : {}),
    });
    revalidatePath(`/team/members`);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to add action item" };
  }
}

export async function toggleActionItemAction(formData: FormData) {
  const sessionId = getString(formData, "sessionId");
  const itemId = getString(formData, "itemId");
  const completed = formData.get("completed") === "true";

  if (!sessionId || !itemId) return { error: "Session ID and item ID are required" };

  try {
    await updateActionItem(sessionId, itemId, { completed });
    revalidatePath(`/team/members`);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update action item" };
  }
}

export async function deleteActionItemAction(formData: FormData) {
  const sessionId = getString(formData, "sessionId");
  const itemId = getString(formData, "itemId");

  if (!sessionId || !itemId) return { error: "Session ID and item ID are required" };

  try {
    await deleteActionItemApi(sessionId, itemId);
    revalidatePath(`/team/members`);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete action item" };
  }
}

export async function addAgendaItemAction(formData: FormData) {
  const sessionId = getString(formData, "sessionId");
  const text = getString(formData, "text");

  if (!sessionId || !text) return { error: "Session ID and text are required" };

  try {
    await addAgendaItem(sessionId, { text, source: "manual" });
    revalidatePath(`/team/members`);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to add agenda item" };
  }
}

export async function toggleAgendaItemAction(formData: FormData) {
  const sessionId = getString(formData, "sessionId");
  const itemId = getString(formData, "itemId");
  const covered = formData.get("covered") === "true";

  if (!sessionId || !itemId) return { error: "Session ID and item ID are required" };

  try {
    await updateAgendaItem(sessionId, itemId, { covered });
    revalidatePath(`/team/members`);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update agenda item" };
  }
}

export async function generateAgendaAction(formData: FormData) {
  const sessionId = getString(formData, "sessionId");
  if (!sessionId) return { error: "Session ID is required" };

  try {
    await generateAgenda(sessionId);
    revalidatePath(`/team/members`);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to generate agenda" };
  }
}
