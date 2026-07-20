"use server";

import { createDevelopmentGoal, updateDevelopmentGoal } from "@/lib/api";
import { requireRole } from "@/lib/session-utils";

export async function setDevelopmentGoal(
  userId: string,
  data: {
    framework: string;
    dimension: string;
    targetDirection: string;
    baselineSnapshotId?: string;
    notes?: string;
  },
) {
  const guard = await requireRole("manager", "admin");
  if (!guard.ok) return { success: false, error: guard.error };

  if (!userId) return { success: false, error: "Missing user ID" };
  if (data.framework !== "colour" && data.framework !== "cdm") {
    return { success: false, error: "Invalid framework" };
  }
  if (data.targetDirection !== "increase" && data.targetDirection !== "decrease") {
    return { success: false, error: "Invalid direction" };
  }

  try {
    const goal = await createDevelopmentGoal(userId, data);
    return { success: true, goalId: goal.id };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to create goal" };
  }
}

export async function updateGoalStatus(
  goalId: string,
  data: { status?: string; notes?: string },
) {
  const guard = await requireRole("manager", "admin");
  if (!guard.ok) return { success: false, error: guard.error };

  if (!goalId) return { success: false, error: "Missing goal ID" };

  try {
    await updateDevelopmentGoal(goalId, data);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to update goal" };
  }
}
