"use server";

import { revalidatePath } from "next/cache";
import { reviewFlaggedEscalation } from "@/lib/api";
import { requireRole } from "@/lib/session-utils";

type ActionResult = { ok: true } | { ok: false; error: string };

/** Manager review of a flag on one of their reports — opens an
 * investigation or dismisses it as a false positive. */
export async function reviewFlagAction(
  escalationId: string,
  action: "investigate" | "dismiss",
  note?: string,
): Promise<ActionResult> {
  const guard = await requireRole("manager", "admin");
  if (!guard.ok) return { ok: false, error: guard.error };

  try {
    await reviewFlaggedEscalation(escalationId, action, note);
    revalidatePath("/team/flagged");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to review flag",
    };
  }
}
