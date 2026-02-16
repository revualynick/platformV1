"use server";

import { createKudos } from "@/lib/api";
import { revalidatePath } from "next/cache";

export async function sendKudos(formData: FormData) {
  const receiverId = formData.get("receiverId") as string;
  const message = formData.get("message") as string;
  const coreValueId = formData.get("coreValueId") as string | null;

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
