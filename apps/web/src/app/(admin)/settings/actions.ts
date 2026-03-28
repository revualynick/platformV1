"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session-utils";
import { z } from "zod";
import {
  createCoreValue,
  updateCoreValue,
  bulkCreateCoreValues,
  createQuestionnaire,
  updateQuestionnaire,
  createUser,
  bulkCreateUsers,
  updateOrgSettings,
  updateUser,
  connectIntegration,
  disconnectIntegration,
  deactivateUser,
  reactivateUser,
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
  const guard = await requireRole("admin");
  if (!guard.ok) return { ok: false, error: guard.error };

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
  const guard = await requireRole("admin");
  if (!guard.ok) return { ok: false, error: guard.error };

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
const userIdSchema = z.object({ userId: z.string().uuid("Invalid user ID") });

const roleEnum = z.enum(["employee", "manager", "admin", "super_admin"], {
  errorMap: () => ({ message: "Invalid role" }),
});

const addPersonSchema = z.object({
  email: z.string().email("Invalid email address"),
  name: z.string().min(1, "Name is required").max(200, "Name too long"),
  role: roleEnum.default("employee"),
  teamId: z.string().uuid("Invalid team ID").optional(),
  timezone: z.string().max(50).optional(),
});

const importPersonSchema = z.object({
  email: z.string().email("Invalid email"),
  name: z.string().min(1).max(200),
  role: roleEnum.optional(),
  timezone: z.string().max(50).optional(),
});

const importValuesItemSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  description: z.string().max(500).optional(),
});

const changeRoleSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
  role: roleEnum,
});

const connectPlatformSchema = z.object({
  id: z.string().uuid("Invalid integration ID"),
  workspace: z.string().max(255).optional(),
  config: z.record(z.unknown()).optional(),
});

const updateOrgSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  timezone: z.string().max(50).optional(),
  allowedDomains: z.array(z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "Invalid domain format")).optional(),
});

export async function removeValue(formData: FormData): Promise<ActionResult> {
  const guard = await requireRole("admin");
  if (!guard.ok) return { ok: false, error: guard.error };

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

export async function importValues(
  data: Array<{ name: string; description?: string }>,
): Promise<ActionResult & { created?: number; skipped?: number }> {
  const guard = await requireRole("admin");
  if (!guard.ok) return { ok: false, error: guard.error };

  if (!data.length) return { ok: false, error: "No valid entries to import" };
  if (data.length > 200) return { ok: false, error: "Maximum 200 values per import" };

  const parsed = z.array(importValuesItemSchema).safeParse(data);
  if (!parsed.success) return { ok: false, error: `Row validation failed: ${parsed.error.issues[0].message}` };

  try {
    const result = await bulkCreateCoreValues(parsed.data);
    revalidatePath("/settings");
    revalidatePath("/settings/values");
    return { ok: true, created: result.created, skipped: result.skipped };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to import values" };
  }
}

export async function addQuestionnaire(formData: FormData): Promise<ActionResult> {
  const guard = await requireRole("admin");
  if (!guard.ok) return { ok: false, error: guard.error };

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
  const guard = await requireRole("admin");
  if (!guard.ok) return { ok: false, error: guard.error };

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
  const guard = await requireRole("admin");
  if (!guard.ok) return { ok: false, error: guard.error };

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

export async function addPerson(formData: FormData): Promise<ActionResult> {
  const guard = await requireRole("admin");
  if (!guard.ok) return { ok: false, error: guard.error };
  const { role: callerRole } = guard as { role: string };

  const parsed = addPersonSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    role: formData.get("role") || "employee",
    teamId: formData.get("teamId") || undefined,
    timezone: formData.get("timezone") || undefined,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  if ((parsed.data.role === "admin" || parsed.data.role === "super_admin") && callerRole !== "super_admin") {
    return { ok: false, error: "Only super_admin can assign admin or super_admin roles" };
  }

  try {
    await createUser(parsed.data);
    revalidatePath("/settings/people");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to add person" };
  }
}

export async function importPeople(
  data: Array<{ email: string; name: string; role?: string; timezone?: string }>,
): Promise<ActionResult & { created?: number; skipped?: number }> {
  const guard = await requireRole("admin");
  if (!guard.ok) return { ok: false, error: guard.error };
  const { role: callerRole } = guard as { role: string };

  if (!data.length) return { ok: false, error: "No valid entries to import" };
  if (data.length > 500) return { ok: false, error: "Maximum 500 entries per import" };

  const parsed = z.array(importPersonSchema).safeParse(data);
  if (!parsed.success) return { ok: false, error: `Row validation failed: ${parsed.error.issues[0].message}` };

  const hasElevatedRole = parsed.data.some((p) => p.role === "admin" || p.role === "super_admin");
  if (hasElevatedRole && callerRole !== "super_admin") {
    return { ok: false, error: "Only super_admin can assign admin or super_admin roles" };
  }

  try {
    const result = await bulkCreateUsers(parsed.data);
    revalidatePath("/settings/people");
    return { ok: true, created: result.created, skipped: result.skipped };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to import people" };
  }
}

export async function connectPlatform(formData: FormData): Promise<ActionResult> {
  const guard = await requireRole("admin");
  if (!guard.ok) return { ok: false, error: guard.error };

  const configRaw = formData.get("config") as string;
  let config: Record<string, unknown> | undefined;
  if (configRaw) {
    try {
      config = JSON.parse(configRaw);
    } catch {
      return { ok: false, error: "Invalid config JSON" };
    }
  }

  const parsed = connectPlatformSchema.safeParse({
    id: formData.get("id"),
    workspace: formData.get("workspace") || undefined,
    config,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await connectIntegration(parsed.data.id, {
      config: parsed.data.config,
      workspace: parsed.data.workspace,
    });
    revalidatePath("/settings/integrations");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to connect integration" };
  }
}

export async function disconnectPlatform(formData: FormData): Promise<ActionResult> {
  const guard = await requireRole("admin");
  if (!guard.ok) return { ok: false, error: guard.error };

  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await disconnectIntegration(parsed.data.id);
    revalidatePath("/settings/integrations");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to disconnect integration" };
  }
}

export async function updateOrg(formData: FormData): Promise<ActionResult> {
  const guard = await requireRole("admin");
  if (!guard.ok) return { ok: false, error: guard.error };

  const domainsRaw = formData.get("allowedDomains") as string;
  const allowedDomains = domainsRaw
    ? domainsRaw.split(",").map((d) => d.trim()).filter(Boolean)
    : undefined;

  const parsed = updateOrgSchema.safeParse({
    name: (formData.get("name") as string) || undefined,
    timezone: (formData.get("timezone") as string) || undefined,
    allowedDomains,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await updateOrgSettings(parsed.data);
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update organization" };
  }
}

export async function deactivateUserAction(formData: FormData): Promise<ActionResult> {
  const guard = await requireRole("admin");
  if (!guard.ok) return { ok: false, error: guard.error };

  const parsed = userIdSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await deactivateUser(parsed.data.userId);
    revalidatePath("/settings/people");
    revalidatePath("/settings/access");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to deactivate user" };
  }
}

export async function reactivateUserAction(formData: FormData): Promise<ActionResult> {
  const guard = await requireRole("admin");
  if (!guard.ok) return { ok: false, error: guard.error };

  const parsed = userIdSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await reactivateUser(parsed.data.userId);
    revalidatePath("/settings/people");
    revalidatePath("/settings/access");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to reactivate user" };
  }
}

export async function changeUserRole(formData: FormData): Promise<ActionResult> {
  const guard = await requireRole("admin");
  if (!guard.ok) return { ok: false, error: guard.error };
  const { role: callerRole } = guard as { role: string };

  const parsed = changeRoleSchema.safeParse({
    userId: formData.get("userId"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  if ((parsed.data.role === "admin" || parsed.data.role === "super_admin") && callerRole !== "super_admin") {
    return { ok: false, error: "Only super_admin can assign admin or super_admin roles" };
  }

  try {
    await updateUser(parsed.data.userId, { role: parsed.data.role });
    revalidatePath("/settings/access");
    revalidatePath("/settings/people");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to change role" };
  }
}
