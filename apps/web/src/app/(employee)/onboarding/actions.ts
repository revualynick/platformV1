"use server";

import { updateUser, completeOnboarding, updateNotificationPreference } from "@/lib/api";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function confirmProfile(data: { name: string; timezone: string }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { success: false, error: "Not authenticated" };

  try {
    await updateUser(userId, { name: data.name, timezone: data.timezone });
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function saveNotificationPrefs(prefs: Record<string, boolean>) {
  try {
    await Promise.allSettled(
      Object.entries(prefs).map(([type, enabled]) =>
        updateNotificationPreference({ type, enabled }),
      ),
    );
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function finishOnboarding() {
  try {
    await completeOnboarding();
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to complete onboarding" };
  }
  redirect("/dashboard");
}
