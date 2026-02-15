"use server";

import { revalidatePath } from "next/cache";
import {
  createCoreValue,
  updateCoreValue,
  createQuestionnaire,
  updateQuestionnaire,
} from "@/lib/api";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function addValue(formData: FormData): Promise<ActionResult> {
  const name = formData.get("name") as string;
  const description = (formData.get("description") as string) ?? "";
  if (!name?.trim()) return { ok: false, error: "Name is required" };

  try {
    await createCoreValue({ name: name.trim(), description: description.trim() });
    revalidatePath("/settings");
    revalidatePath("/settings/values");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to add value" };
  }
}

export async function editValue(formData: FormData): Promise<ActionResult> {
  const id = formData.get("id") as string;
  const name = formData.get("name") as string;
  const description = (formData.get("description") as string) ?? "";
  if (!id || !name?.trim()) return { ok: false, error: "Name is required" };

  try {
    await updateCoreValue(id, { name: name.trim(), description: description.trim() });
    revalidatePath("/settings");
    revalidatePath("/settings/values");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update value" };
  }
}

export async function removeValue(formData: FormData): Promise<ActionResult> {
  const id = formData.get("id") as string;
  if (!id) return { ok: false, error: "ID is required" };

  try {
    await updateCoreValue(id, { isActive: false });
    revalidatePath("/settings");
    revalidatePath("/settings/values");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to remove value" };
  }
}

export async function addQuestionnaire(formData: FormData): Promise<ActionResult> {
  const name = formData.get("name") as string;
  const category = formData.get("category") as string;
  const source = (formData.get("source") as string) || "custom";
  if (!name?.trim()) return { ok: false, error: "Name is required" };
  if (!category) return { ok: false, error: "Category is required" };

  try {
    await createQuestionnaire({ name: name.trim(), category, source });
    revalidatePath("/settings/questions");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create questionnaire" };
  }
}

export async function editQuestionnaire(formData: FormData): Promise<ActionResult> {
  const id = formData.get("id") as string;
  const name = formData.get("name") as string;
  const category = formData.get("category") as string;
  if (!id || !name?.trim()) return { ok: false, error: "Name is required" };

  try {
    await updateQuestionnaire(id, { name: name.trim(), category });
    revalidatePath("/settings/questions");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update questionnaire" };
  }
}

export async function toggleVerbatim(formData: FormData): Promise<ActionResult> {
  const id = formData.get("id") as string;
  const verbatim = formData.get("verbatim") === "true";
  if (!id) return { ok: false, error: "ID is required" };

  try {
    await updateQuestionnaire(id, { verbatim });
    revalidatePath("/settings/questions");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to toggle verbatim" };
  }
}
