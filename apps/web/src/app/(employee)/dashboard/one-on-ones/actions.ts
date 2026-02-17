"use server";

// Employee-side session actions are minimal — employees primarily view sessions.
// The manager drives session lifecycle (create, start, end).
// This file is kept for potential future employee actions.

import { revalidatePath } from "next/cache";

export async function refreshSessions() {
  revalidatePath("/dashboard/one-on-ones");
}
