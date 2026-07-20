"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  createGoal,
  createGoalCheckIn,
  updateGoal,
  applyGoalSuggestion,
  dismissGoalSuggestion,
} from "@/lib/api";
import { requireLiveSession } from "@/lib/session-utils";
import { getString, getNumber } from "@/lib/form-helpers";

type ActionResult = { ok: true } | { ok: false; error: string };


const createSchema = z.object({
  level: z.enum(["individual", "personal"]),
  title: z.string().min(1, "Title is required").max(255),
  description: z.string().max(5000).default(""),
});

export async function createMyGoalAction(
  formData: FormData,
): Promise<ActionResult> {
  const guard = await requireLiveSession();
  if (!guard.ok) return { ok: false, error: guard.error };

  const parsed = createSchema.safeParse({
    level: formData.get("level"),
    title: formData.get("title"),
    description: formData.get("description") ?? "",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { level, title, description } = parsed.data;

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
      ownerId: guard.session.user.id,
      parentGoalId: level === "individual" ? getString(formData, "parentGoalId") : null,
      cycleId: level === "individual" ? getString(formData, "cycleId") : null,
      targetDate: level === "personal" ? getString(formData, "targetDate") : null,
      shareWithManager:
        level === "personal" && formData.get("shareWithManager") !== null,
      ...(hasMetric && {
        metricName,
        metricStartValue,
        metricTargetValue,
        metricCurrentValue: metricStartValue,
      }),
    });
    revalidatePath("/dashboard/goals");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create goal" };
  }
}

export async function checkInAction(formData: FormData): Promise<ActionResult> {
  const guard = await requireLiveSession();
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
    revalidatePath("/dashboard/goals");
    revalidatePath("/team/goals");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to check in" };
  }
}

export async function applySuggestionAction(
  suggestionId: string,
  edits: {
    progressPercent?: number;
    metricCurrentValue?: number;
    status?: string;
    note?: string;
  },
): Promise<ActionResult> {
  const guard = await requireLiveSession();
  if (!guard.ok) return { ok: false, error: guard.error };

  try {
    await applyGoalSuggestion(suggestionId, edits as Parameters<typeof applyGoalSuggestion>[1]);
    revalidatePath("/dashboard/goals");
    revalidatePath("/team/goals");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to apply suggestion" };
  }
}

export async function dismissSuggestionAction(
  suggestionId: string,
): Promise<ActionResult> {
  const guard = await requireLiveSession();
  if (!guard.ok) return { ok: false, error: guard.error };

  try {
    await dismissGoalSuggestion(suggestionId);
    revalidatePath("/dashboard/goals");
    revalidatePath("/team/goals");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to dismiss suggestion" };
  }
}

export async function toggleShareAction(
  goalId: string,
  share: boolean,
): Promise<ActionResult> {
  const guard = await requireLiveSession();
  if (!guard.ok) return { ok: false, error: guard.error };

  try {
    await updateGoal(goalId, { shareWithManager: share });
    revalidatePath("/dashboard/goals");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update sharing" };
  }
}
