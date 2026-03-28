"use server";

import { updateUser, completeOnboarding, updateNotificationPreference } from "@/lib/api";
import { requireLiveSession } from "@/lib/session-utils";
import { redirect } from "next/navigation";

// IANA timezone validation — check Intl API resolves the name
function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function confirmProfile(data: { name: string; timezone: string }) {
  const guard = await requireLiveSession();
  if (!guard.ok) return { success: false, error: guard.error };
  const userId = guard.session.user?.id;
  if (!userId) return { success: false, error: "Not authenticated" };

  const name = data.name?.trim();
  if (!name || name.length > 255) return { success: false, error: "Invalid name" };

  if (!data.timezone || !isValidTimezone(data.timezone)) {
    return { success: false, error: "Invalid timezone" };
  }

  try {
    await updateUser(userId, { name, timezone: data.timezone });
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function saveNotificationPrefs(prefs: Record<string, boolean>) {
  const guard = await requireLiveSession();
  if (!guard.ok) return { success: false, error: guard.error };

  const results = await Promise.allSettled(
    Object.entries(prefs).map(([type, enabled]) =>
      updateNotificationPreference({ type, enabled }),
    ),
  );
  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    return { success: false, error: `Failed to update ${failures.length} preference(s)` };
  }
  return { success: true };
}

export async function finishOnboarding() {
  const guard = await requireLiveSession();
  if (!guard.ok) return { success: false, error: guard.error };

  try {
    await completeOnboarding();
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to complete onboarding" };
  }
  // redirect() throws internally in Next.js — must stay outside try/catch to avoid being swallowed
  redirect("/dashboard");
}
