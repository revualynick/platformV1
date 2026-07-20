"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  createGoal,
  createGoalCheckIn,
  createGoalCycle,
  updateGoal,
  updateOrgSettings,
} from "@/lib/api";
import { requireRole } from "@/lib/session-utils";
import { getString, getNumber } from "@/lib/form-helpers";

type ActionResult = { ok: true } | { ok: false; error: string };


const cycleSchema = z
  .object({
    name: z.string().min(1, "Name is required").max(100),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a start date"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick an end date"),
  })
  .refine((c) => c.endDate > c.startDate, {
    message: "End date must be after start date",
  });

export async function createCycleAction(formData: FormData): Promise<ActionResult> {
  const guard = await requireRole("admin");
  if (!guard.ok) return { ok: false, error: guard.error };

  const parsed = cycleSchema.safeParse({
    name: formData.get("name"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await createGoalCycle(parsed.data);
    revalidatePath("/settings/goals");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create cycle" };
  }
}

const orgGoalSchema = z.object({
  title: z.string().min(1, "Title is required").max(255),
  description: z.string().max(5000).default(""),
  cycleId: z.string().uuid("No cycle selected"),
});

export async function createOrgGoalAction(formData: FormData): Promise<ActionResult> {
  const guard = await requireRole("admin");
  if (!guard.ok) return { ok: false, error: guard.error };

  const parsed = orgGoalSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    cycleId: formData.get("cycleId"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const metricName = getString(formData, "metricName");
  const metricStartValue = getNumber(formData, "metricStartValue");
  const metricTargetValue = getNumber(formData, "metricTargetValue");
  const hasMetric =
    metricName !== null && metricStartValue !== null && metricTargetValue !== null;

  try {
    await createGoal({
      level: "org",
      title: parsed.data.title.trim(),
      description: parsed.data.description.trim(),
      cycleId: parsed.data.cycleId,
      ownerId: guard.session.user.id,
      ...(hasMetric && {
        metricName,
        metricStartValue,
        metricTargetValue,
        metricCurrentValue: metricStartValue,
      }),
    });
    revalidatePath("/settings/goals");
    revalidatePath("/dashboard/goals/alignment");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create goal" };
  }
}

export async function adminCheckInAction(formData: FormData): Promise<ActionResult> {
  const guard = await requireRole("admin");
  if (!guard.ok) return { ok: false, error: guard.error };

  const goalId = getString(formData, "goalId");
  if (!goalId) return { ok: false, error: "Missing goal" };

  const progressPercent = getNumber(formData, "progressPercent");
  const metricCurrentValue = getNumber(formData, "metricCurrentValue");
  const status = getString(formData, "status");
  const note = getString(formData, "note") ?? "";

  try {
    await createGoalCheckIn(goalId, {
      ...(progressPercent !== null && { progressPercent }),
      ...(metricCurrentValue !== null && { metricCurrentValue }),
      ...(status !== null && { status: status as never }),
      note,
    });
    revalidatePath("/settings/goals");
    revalidatePath("/dashboard/goals/alignment");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to check in" };
  }
}

export async function saveCheckInMarkerAction(
  formData: FormData,
): Promise<ActionResult> {
  const guard = await requireRole("admin");
  if (!guard.ok) return { ok: false, error: guard.error };

  const marker = getString(formData, "checkInTitleMarker");
  if (!marker) return { ok: false, error: "Marker is required" };

  try {
    await updateOrgSettings({ checkInTitleMarker: marker.trim() });
    revalidatePath("/settings/goals");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to save marker" };
  }
}

export async function archiveGoalAction(goalId: string): Promise<ActionResult> {
  const guard = await requireRole("admin");
  if (!guard.ok) return { ok: false, error: guard.error };

  try {
    await updateGoal(goalId, { status: "archived" });
    revalidatePath("/settings/goals");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to archive goal" };
  }
}
