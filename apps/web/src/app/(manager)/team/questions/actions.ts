"use server";

import { createManagerQuestionnaire } from "@/lib/api";
import { revalidatePath } from "next/cache";

export async function createManagerQuestionnaireAction(formData: FormData) {
  const name = formData.get("name") as string;
  const category = formData.get("category") as string;
  const verbatim = formData.get("verbatim") === "on";

  if (!name || !category) {
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
