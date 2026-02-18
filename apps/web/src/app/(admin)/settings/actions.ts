"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  createCoreValue,
  updateCoreValue,
  createQuestionnaire,
  updateQuestionnaire,
} from "@/lib/api";

type ActionResult = { ok: true } | { ok: false; error: string };

const valueSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  description: z.string().max(500, "Description too long").default(""),
});

const questionnaireSchema = z.object({
  name: z.string().min(1, "Name is required").max(200, "Name too long"),
  category: z.string().min(1, "Category is required"),
  source: z.string().max(50).default("custom"),
});

export async function addValue(formData: FormData): Promise<ActionResult> {
  const parsed = valueSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { name, description } = parsed.data;

  try {
    await createCoreValue({ name: name.trim(), description: description.trim() });
    revalidatePath("/settings");
    revalidatePath("/settings/values");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to add value" };
  }
}

const editValueSchema = z.object({
  id: z.string().uuid("Invalid value ID"),
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  description: z.string().max(500, "Description too long").default(""),
});

export async function editValue(formData: FormData): Promise<ActionResult> {
  const parsed = editValueSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    description: formData.get("description") ?? "",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { id, name, description } = parsed.data;

  try {
    await updateCoreValue(id, { name: name.trim(), description: description.trim() });
    revalidatePath("/settings");
    revalidatePath("/settings/values");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update value" };
  }
}

const idSchema = z.object({ id: z.string().uuid("Invalid ID") });

export async function removeValue(formData: FormData): Promise<ActionResult> {
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { id } = parsed.data;

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
  const parsed = questionnaireSchema.safeParse({
    name: formData.get("name"),
    category: formData.get("category"),
    source: formData.get("source") || "custom",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { name, category, source } = parsed.data;

  try {
    await createQuestionnaire({ name: name.trim(), category, source });
    revalidatePath("/settings/questions");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create questionnaire" };
  }
}

const editQuestionnaireSchema = z.object({
  id: z.string().uuid("Invalid questionnaire ID"),
  name: z.string().min(1, "Name is required").max(200, "Name too long"),
  category: z.string().min(1, "Category is required"),
});

export async function editQuestionnaire(formData: FormData): Promise<ActionResult> {
  const parsed = editQuestionnaireSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    category: formData.get("category"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { id, name, category } = parsed.data;

  try {
    await updateQuestionnaire(id, { name: name.trim(), category });
    revalidatePath("/settings/questions");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update questionnaire" };
  }
}

export async function toggleVerbatim(formData: FormData): Promise<ActionResult> {
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { id } = parsed.data;
  const verbatim = formData.get("verbatim") === "true";

  try {
    await updateQuestionnaire(id, { verbatim });
    revalidatePath("/settings/questions");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to toggle verbatim" };
  }
}
