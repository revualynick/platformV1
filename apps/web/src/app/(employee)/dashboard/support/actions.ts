"use server";

import { revalidatePath } from "next/cache";
import { acknowledgeSupportRequest, closeSupportRequest, friendlyError } from "@/lib/api";
import { requireLiveSession } from "@/lib/session-utils";

type ActionResult = { ok: true } | { ok: false; error: string };

// The API checks that the caller is a support contact and audits the change.
async function run(fn: () => Promise<unknown>, fallback: string): Promise<ActionResult> {
  const live = await requireLiveSession();
  if (!live.ok) return { ok: false, error: live.error };
  try {
    await fn();
    revalidatePath("/dashboard/support");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: friendlyError(err, fallback) };
  }
}

export async function acknowledgeAction(id: string) {
  return run(() => acknowledgeSupportRequest(id), "Couldn't update the request");
}

export async function closeAction(id: string) {
  return run(() => closeSupportRequest(id), "Couldn't close the request");
}
