"use server";

import { revalidatePath } from "next/cache";
import { saveSupportSettings, friendlyError } from "@/lib/api";
import { requireRole } from "@/lib/session-utils";

export async function saveSupportSettingsAction(data: {
  supportContact: string;
  supportDetails: string;
  supportOutside: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const guard = await requireRole("admin");
  if (!guard.ok) return { ok: false, error: guard.error };
  try {
    await saveSupportSettings(data);
    revalidatePath("/settings/support");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: friendlyError(err, "Couldn't save the support settings") };
  }
}
