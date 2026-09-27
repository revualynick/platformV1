import { eq, inArray, sql } from "drizzle-orm";
import type { Queue } from "bullmq";
import { conversations, orgSettings, supportRequests, supportSignals, users, type TenantDb } from "@revualy/db";
import type { OrgResources, SupportLevel } from "./bot-references.js";
import { EVAL_ORG } from "./bot-references.js";

/**
 * The support handover (docs/bot/concerns-playbook.md, Nick 2026-09-27).
 *
 * When the bot recognises that someone may need support (wellbeing or
 * safety), it says it is only a feedback assistant, gives the
 * organisation's own support details, and offers to ask the support
 * contact to get in touch. Only a yes creates a request, and a request
 * holds who asked and how soon, never what they wrote. The conversation is
 * never analysed as feedback, and its transcript goes with the usual
 * retention. Admins see monthly counts only.
 *
 * Job side: this module reads and writes the database. The chat side
 * (reference path) only sees the wording in bot-references.ts.
 */

type Tx = Parameters<Parameters<TenantDb["transaction"]>[0]>[0];
type DbOrTx = TenantDb | Tx;

const HOUR = 60 * 60 * 1000;

export const SUPPORT_PHASES = ["support_offer", "support_retry", "support"] as const;
export function isSupportPhase(phase: string | null | undefined): boolean {
  return (SUPPORT_PHASES as readonly string[]).includes(phase ?? "");
}

export interface SupportSettings {
  contactId: string | null;
  backupId: string | null;
  contactName: string | null;
  details: string;
  outside: string;
}

export async function loadSupportSettings(db: DbOrTx): Promise<SupportSettings> {
  const [row] = await db
    .select({
      contactId: orgSettings.supportContactId,
      backupId: orgSettings.supportBackupId,
      details: orgSettings.supportDetails,
      outside: orgSettings.supportOutside,
    })
    .from(orgSettings)
    .limit(1);
  let contactName: string | null = null;
  if (row?.contactId) {
    const [c] = await db.select({ name: users.name, isActive: users.isActive }).from(users).where(eq(users.id, row.contactId));
    if (c?.isActive) contactName = c.name;
  }
  return {
    contactId: contactName ? (row?.contactId ?? null) : null,
    backupId: row?.backupId ?? null,
    contactName,
    details: row?.details ?? "",
    outside: row?.outside ?? "",
  };
}

/** What the bot's fixed wording needs, from the organisation's settings. */
export async function loadSupportResources(db: DbOrTx): Promise<OrgResources> {
  const [settings, [org]] = await Promise.all([
    loadSupportSettings(db),
    db.select({ name: orgSettings.name }).from(orgSettings).limit(1),
  ]);
  return {
    orgName: org?.name ?? EVAL_ORG.orgName,
    // Conduct routing isn't configurable yet (backlog).
    hrContact: settings.contactName ?? "your HR team",
    supportContact: settings.contactName,
    supportDetails: settings.details,
    supportOutside: settings.outside,
  };
}

/** First day of the month, UTC, as the counts' key. */
function monthKey(now: Date): string {
  return `${now.toISOString().slice(0, 7)}-01`;
}

async function bumpSignal(tx: DbOrTx, now: Date, field: "offers" | "accepted") {
  const month = monthKey(now);
  await tx
    .insert(supportSignals)
    .values({ month, offers: field === "offers" ? 1 : 0, accepted: field === "accepted" ? 1 : 0 })
    .onConflictDoUpdate({
      target: supportSignals.month,
      set: field === "offers" ? { offers: sql`${supportSignals.offers} + 1` } : { accepted: sql`${supportSignals.accepted} + 1` },
    });
}

/**
 * The bot has made the offer: the conversation waits for a yes or no, and
 * the month's offer count goes up. Called in the same transaction as the
 * turn that sent the offer. When there is no support contact the offer
 * can't be made, so the conversation just ends for support.
 */
export async function recordSupportOffer(tx: Tx, conversationId: string, level: SupportLevel, canOffer: boolean, now = new Date()) {
  await tx
    .update(conversations)
    .set(
      canOffer
        ? { phase: "support_offer", supportLevel: level }
        : { phase: "support", supportLevel: level, status: "incomplete", closedAt: now },
    )
    .where(eq(conversations.id, conversationId));
  await bumpSignal(tx, now, "offers");
}

/**
 * When the contact should have been in touch by: the same working day for
 * safety (8 hours), two working days for wellbeing (weekends skipped).
 */
export function supportDueAt(level: SupportLevel, now = new Date()): Date {
  if (level === "safety") return new Date(now.getTime() + 8 * HOUR);
  const due = new Date(now);
  let added = 0;
  while (added < 2) {
    due.setUTCDate(due.getUTCDate() + 1);
    const day = due.getUTCDay();
    if (day !== 0 && day !== 6) added++;
  }
  return due;
}

/** The person said yes: one request, and the month's accepted count goes up. */
export async function createSupportRequest(tx: Tx, userId: string, level: SupportLevel, now = new Date()): Promise<string> {
  const [row] = await tx
    .insert(supportRequests)
    .values({ userId, urgency: level === "safety" ? "today" : "soon", createdAt: now, dueAt: supportDueAt(level, now) })
    .returning({ id: supportRequests.id });
  await bumpSignal(tx, now, "accepted");
  return row.id;
}

/** Email the support contacts. Only the request id travels; the email names no one. */
export async function notifySupportContacts(queue: Queue | undefined, orgId: string, requestId: string, kind: "new" | "overdue" = "new") {
  if (!queue) return;
  await queue.add(
    "support_request",
    { orgId, requestId, kind },
    { jobId: `support-${kind}-${requestId}` },
  );
}

/** Who may work the queue: the support contact and the backup, if still active. */
export async function supportContactIds(db: DbOrTx): Promise<string[]> {
  const s = await loadSupportSettings(db);
  const ids = [s.contactId, s.backupId].filter((v): v is string => Boolean(v));
  if (ids.length === 0) return [];
  const active = await db.select({ id: users.id }).from(users).where(inArray(users.id, ids));
  return active.map((a) => a.id);
}
