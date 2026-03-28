"use server";

import { createManagerQuestionnaire } from "@/lib/api";
import { requireRole } from "@/lib/session-utils";
import { revalidatePath } from "next/cache";

export async function createManagerQuestionnaireAction(formData: FormData) {
  const guard = await requireRole("manager", "admin");
  if (!guard.ok) return { error: guard.error };

  const name = formData.get("name");
  const category = formData.get("category");
  const verbatim = formData.get("verbatim") === "on";

  if (!name || typeof name !== "string" || !name.trim() || !category || typeof category !== "string" || !category.trim()) {
    return { error: "Name and category are required" };
  }

  // Collect themes from form data
  const themes: Array<{ intent: string; dataGoal: string }> = [];
  let i = 0;
  while (true) {
    const intent = formData.get(`theme_intent_${i}`) as string | null;
    const dataGoal = formData.get(`theme_dataGoal_${i}`) as string | null;
    if (intent === null) break;
    if (intent.trim() || dataGoal?.trim()) {
      themes.push({
        intent: intent.trim(),
        dataGoal: (dataGoal ?? "").trim(),
      });
    }
    i++;
  }

  try {
    await createManagerQuestionnaire({
      name,
      category,
      verbatim,
      themes: themes.length > 0 ? themes : undefined,
    });
    revalidatePath("/team/questions");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create questionnaire" };
  }
}
