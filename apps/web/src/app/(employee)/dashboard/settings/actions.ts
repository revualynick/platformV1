"use server";

import { updateNotificationPreference } from "@/lib/api";
import { requireLiveSession } from "@/lib/session-utils";
import { revalidatePath } from "next/cache";

export async function togglePreference(
  type: string,
  enabled: boolean,
  channel?: string,
) {
  const guard = await requireLiveSession();
  if (!guard.ok) return { success: false, error: guard.error };

  try {
    await updateNotificationPreference({ type, enabled, channel });
    revalidatePath("/dashboard/settings");
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
