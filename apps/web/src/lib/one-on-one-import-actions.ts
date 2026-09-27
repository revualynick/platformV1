"use server";

import { revalidatePath } from "next/cache";
import {
  decideImport,
  friendlyError,
  setIngestionMode,
  updateBetweenMeetingGoal,
  updateOrgSettings,
  uploadOneOnOne,
  type IngestionMode,
  type UploadOutcome,
} from "@/lib/api";
import { requireLiveSession, requireRole } from "@/lib/session-utils";

/**
 * Server actions for 1:1 notes: approving calendar imports, uploads,
 * between-meeting goals and the ingestion mode. The API enforces who may do
 * what (the meeting's organiser approves; only the two people in a 1:1 see
 * or edit its goals); these only check that someone is signed in, except
 * the admin limits.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

const MODES: IngestionMode[] = ["manual", "semi_automatic", "automatic"];
// Server actions are callable with any arguments: check them before they go
// into API paths and bodies (review finding 2026-09-28).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

function revalidateOneOnOnePages() {
  revalidatePath("/team/one-on-ones");
  revalidatePath("/team/members", "layout");
  revalidatePath("/dashboard/one-on-ones");
}

export async function decideImportAction(id: string, action: "approve" | "decline"): Promise<ActionResult> {
  const guard = await requireLiveSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!UUID.test(id) || (action !== "approve" && action !== "decline")) return { ok: false, error: "Unknown import" };
  try {
    await decideImport(id, action);
    revalidateOneOnOnePages();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: friendlyError(err, `Couldn't ${action} this import`) };
  }
}

export async function uploadNotesAction(
  formData: FormData,
): Promise<{ ok: true; outcome: UploadOutcome } | { ok: false; error: string }> {
  const guard = await requireLiveSession();
  if (!guard.ok) return { ok: false, error: guard.error };

  const file = formData.get("file");
  const counterpartId = formData.get("counterpartId");
  const meetingDate = formData.get("meetingDate");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file to upload" };
  if (typeof counterpartId !== "string" || !UUID.test(counterpartId)) return { ok: false, error: "Choose who the 1:1 was with" };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "File is too large (5 MB limit)" };

  try {
    const contentBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const outcome = await uploadOneOnOne({
      counterpartId,
      fileName: file.name,
      contentBase64,
      ...(typeof meetingDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(meetingDate) ? { meetingDate } : {}),
    });
    revalidateOneOnOnePages();
    return { ok: true, outcome };
  } catch (err) {
    return { ok: false, error: friendlyError(err, "Couldn't process that file. Please try again.") };
  }
}

export async function updateGoalAction(
  id: string,
  change: { text?: string; status?: "active" | "done" | "dropped" },
): Promise<ActionResult> {
  const guard = await requireLiveSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!UUID.test(id)) return { ok: false, error: "Unknown goal" };
  // Only the fields the page can change, whatever the caller sent.
  const text = typeof change?.text === "string" ? change.text : undefined;
  const status = change?.status && ["active", "done", "dropped"].includes(change.status) ? change.status : undefined;
  if (text !== undefined && !text.trim()) return { ok: false, error: "The goal can't be empty" };
  if (text === undefined && status === undefined) return { ok: false, error: "Nothing to change" };
  try {
    await updateBetweenMeetingGoal(id, { ...(text !== undefined ? { text: text.trim() } : {}), ...(status ? { status } : {}) });
    revalidateOneOnOnePages();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: friendlyError(err, "Couldn't update the goal") };
  }
}

export async function setMyModeAction(mode: IngestionMode | null): Promise<ActionResult> {
  const guard = await requireRole("manager", "admin");
  if (!guard.ok) return { ok: false, error: guard.error };
  if (mode !== null && !MODES.includes(mode)) return { ok: false, error: "Unknown mode" };
  try {
    await setIngestionMode(mode);
    revalidatePath("/team/one-on-ones");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: friendlyError(err, "Couldn't change your mode") };
  }
}

export async function saveOrgModeLimitsAction(formData: FormData): Promise<ActionResult> {
  const guard = await requireRole("admin");
  if (!guard.ok) return { ok: false, error: guard.error };
  const maxMode = formData.get("maxMode");
  const defaultMode = formData.get("defaultMode");
  if (!MODES.includes(maxMode as IngestionMode) || !MODES.includes(defaultMode as IngestionMode)) {
    return { ok: false, error: "Choose a limit and a default" };
  }
  if (MODES.indexOf(defaultMode as IngestionMode) > MODES.indexOf(maxMode as IngestionMode)) {
    return { ok: false, error: "The default can't be more automatic than the limit" };
  }
  try {
    await updateOrgSettings({
      oneOnOneMaxMode: maxMode as IngestionMode,
      oneOnOneIngestionMode: defaultMode as IngestionMode,
    });
    revalidatePath("/settings/one-on-ones");
    revalidatePath("/team/one-on-ones");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: friendlyError(err, "Couldn't save the 1:1 settings") };
  }
}
