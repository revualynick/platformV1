"use server";

import { revalidatePath } from "next/cache";
import { updateEscalation } from "@/lib/api";
import { requireRole } from "@/lib/session-utils";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function transitionEscalationAction(
  id: string,
  status: "investigating" | "resolved" | "dismissed",
  resolution?: string,
): Promise<ActionResult> {
  const guard = await requireRole("admin");
  if (!guard.ok) return { ok: false, error: guard.error };

  const note = resolution?.trim();
  if (status === "resolved" && !note) {
    return { ok: false, error: "A resolution note is required to resolve" };
  }

  try {
    await updateEscalation(id, { status, ...(note && { resolution: note }) });
    revalidatePath("/settings/escalations");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update escalation" };
  }
}
