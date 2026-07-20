"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createGoal, createGoalCheckIn } from "@/lib/api";
import { requireRole } from "@/lib/session-utils";
import { getString, getNumber } from "@/lib/form-helpers";

type ActionResult = { ok: true } | { ok: false; error: string };


const createSchema = z.object({
  level: z.enum(["team", "individual"]),
  title: z.string().min(1, "Title is required").max(255),
  description: z.string().max(5000).default(""),
  parentGoalId: z.string().uuid("Pick a goal to ladder to"),
  cycleId: z.string().uuid("No active cycle"),
});

/** Managers create team goals (laddered to org goals) and individual
 * goals for their reports (laddered to team goals). */
export async function createTeamScopedGoalAction(
  formData: FormData,
): Promise<ActionResult> {
  const guard = await requireRole("manager", "admin");
  if (!guard.ok) return { ok: false, error: guard.error };

  const parsed = createSchema.safeParse({
    level: formData.get("level"),
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    parentGoalId: formData.get("parentGoalId"),
    cycleId: formData.get("cycleId"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { level, title, description, parentGoalId, cycleId } = parsed.data;

  const ownerId =
    getString(formData, "ownerId") ?? guard.session.user.id;
  const teamId = getString(formData, "teamId");
  if (level === "team" && !teamId) {
    return { ok: false, error: "Pick a team" };
  }

  const metricName = getString(formData, "metricName");
  const metricStartValue = getNumber(formData, "metricStartValue");
  const metricTargetValue = getNumber(formData, "metricTargetValue");
  const hasMetric =
    metricName !== null && metricStartValue !== null && metricTargetValue !== null;

  try {
    await createGoal({
      level,
      title: title.trim(),
      description: description.trim(),
      ownerId,
      parentGoalId,
      cycleId,
      ...(level === "team" && { teamId }),
      ...(hasMetric && {
        metricName,
        metricStartValue,
        metricTargetValue,
        metricCurrentValue: metricStartValue,
      }),
    });
    revalidatePath("/team/goals");
    revalidatePath("/dashboard/goals");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create goal" };
  }
}

export async function managerCheckInAction(
  formData: FormData,
): Promise<ActionResult> {
  const guard = await requireRole("manager", "admin");
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
    revalidatePath("/team/goals");
    revalidatePath("/dashboard/goals");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to check in" };
  }
}
