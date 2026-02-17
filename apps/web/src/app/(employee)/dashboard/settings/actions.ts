"use server";

import { updateNotificationPreference } from "@/lib/api";
import { revalidatePath } from "next/cache";

export async function togglePreference(
  type: string,
  enabled: boolean,
  channel?: string,
) {
  try {
    await updateNotificationPreference({ type, enabled, channel });
    revalidatePath("/dashboard/settings");
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
