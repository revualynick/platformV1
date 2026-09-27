"use server";

import { revalidatePath } from "next/cache";
import { createAccessGrant, revokeAccessGrant, liftAccessGrantHold, friendlyError } from "@/lib/api";
import { requireRole } from "@/lib/session-utils";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function createGrantAction(data: {
  subjectId: string;
  reason: string;
  periodStart: string;
  periodEnd: string;
  days: number;
  holdReason?: string;
}): Promise<ActionResult> {
  const guard = await requireRole("admin");
  if (!guard.ok) return { ok: false, error: guard.error };
  try {
    await createAccessGrant({ ...data, holdReason: data.holdReason?.trim() || undefined });
    revalidatePath("/settings/break-glass");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: friendlyError(err, "Couldn't open access") };
  }
}

export async function revokeGrantAction(id: string): Promise<ActionResult> {
  const guard = await requireRole("admin");
  if (!guard.ok) return { ok: false, error: guard.error };
  try {
    await revokeAccessGrant(id);
    revalidatePath("/settings/break-glass");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: friendlyError(err, "Couldn't end access") };
  }
}

export async function liftHoldAction(id: string): Promise<ActionResult> {
  const guard = await requireRole("admin");
  if (!guard.ok) return { ok: false, error: guard.error };
  try {
    await liftAccessGrantHold(id);
    revalidatePath("/settings/break-glass");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: friendlyError(err, "Couldn't lift the hold") };
  }
}
