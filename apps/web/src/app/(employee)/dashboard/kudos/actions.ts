"use server";

import { createKudos } from "@/lib/api";
import { revalidatePath } from "next/cache";

/** Safely extract a string from FormData (returns null if missing or not a string). */
function getString(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  return typeof v === "string" && v.length > 0 ? v : null;
}

export async function sendKudos(formData: FormData) {
  const receiverId = getString(formData, "receiverId");
  const message = getString(formData, "message");
  const coreValueId = getString(formData, "coreValueId");

  if (!receiverId || !message) {
    return { error: "Receiver and message are required" };
  }

  try {
    await createKudos({
      receiverId,
      message,
      coreValueId: coreValueId || undefined,
    });
    revalidatePath("/dashboard/kudos");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to send kudos" };
  }
}
