"use server";

import { revalidatePath } from "next/cache";
import {
  createCampaign,
  updateCampaign,
  deleteCampaign,
  advanceCampaign,
  sendCampaignChatMessage,
} from "@/lib/api";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function createCampaignAction(
  formData: FormData,
): Promise<ActionResult> {
  const name = formData.get("name");
  if (!name || typeof name !== "string" || !name.trim()) {
    return { ok: false, error: "Name is required" };
  }

  const description = (formData.get("description") as string | null) ?? "";
  const startDate = (formData.get("startDate") as string | null) || undefined;
  const endDate = (formData.get("endDate") as string | null) || undefined;
  const targetAudience =
    (formData.get("targetAudience") as string | null) || undefined;

  try {
    await createCampaign({
      name: name.trim(),
      description: description.trim() || undefined,
      startDate,
      endDate,
      targetAudience,
    });
    revalidatePath("/settings/campaigns");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to create campaign",
    };
  }
}

export async function updateCampaignAction(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const name = formData.get("name");
  if (!name || typeof name !== "string" || !name.trim()) {
    return { ok: false, error: "Name is required" };
  }

  const description = (formData.get("description") as string | null) ?? "";
  const startDate = (formData.get("startDate") as string | null) || null;
  const endDate = (formData.get("endDate") as string | null) || null;
  const targetAudience =
    (formData.get("targetAudience") as string | null) || null;

  try {
    await updateCampaign(id, {
      name: name.trim(),
      description: description.trim(),
      startDate,
      endDate,
      targetAudience,
    });
    revalidatePath("/settings/campaigns");
    revalidatePath(`/settings/campaigns/${id}`);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to update campaign",
    };
  }
}

export async function deleteCampaignAction(
  id: string,
): Promise<ActionResult> {
  try {
    await deleteCampaign(id);
    revalidatePath("/settings/campaigns");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to delete campaign",
    };
  }
}

export async function advanceCampaignAction(
  id: string,
): Promise<ActionResult & { status?: string }> {
  try {
    const updated = await advanceCampaign(id);
    revalidatePath("/settings/campaigns");
    revalidatePath(`/settings/campaigns/${id}`);
    return { ok: true, status: updated.status };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to advance campaign",
    };
  }
}

export async function sendCampaignChatAction(
  id: string,
  message: string,
): Promise<{ ok: true; reply: string; suggestions: string[] } | { ok: false; error: string }> {
  try {
    const result = await sendCampaignChatMessage(id, message);
    return { ok: true, reply: result.reply, suggestions: result.suggestions };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error ? e.message : "Failed to send message",
    };
  }
}
