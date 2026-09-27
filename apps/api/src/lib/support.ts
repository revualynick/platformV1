import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { orgSettings, supportSignposts, type TenantDb } from "@revualy/db";
import type { OrgResources } from "./bot-references.js";
import { EVAL_ORG, wordingPreviews } from "./bot-references.js";

/**
 * Support signposting (docs/bot/concerns-playbook.md, Nick 2026-09-27).
 *
 * Above the threshold the bot points the person to someone at their
 * organisation who is better placed to support them, with the
 * organisation's own details, the way Claude points people to 111 or 999.
 * Nothing is passed on and nothing is recorded about the person. The
 * conversation ends, is never analysed as feedback, and its transcript goes
 * with the usual retention. The only data kept is a monthly count of how
 * often each signpost was shown.
 *
 * Job side: this module reads and writes the database. The chat side
 * (reference path) only sees the wording in bot-references.ts.
 */

type Tx = Parameters<Parameters<TenantDb["transaction"]>[0]>[0];
type DbOrTx = TenantDb | Tx;

export type SignpostLevel = "wellbeing" | "safety" | "conduct";

/** A conversation that ended after a wellbeing or safety signpost. */
export function isSupportPhase(phase: string | null | undefined): boolean {
  return phase === "support";
}

export interface WordingSignoff {
  name: string;
  role: string;
  at: string;
  /** The admin who recorded it in Revualy. */
  recordedBy: string;
  /** wordingHash() of what was signed off. */
  hash: string;
}

export interface SupportSettings {
  contact: string;
  details: string;
  outside: string;
  wording: { support?: string; conduct?: string };
  signoff: WordingSignoff | null;
}

export async function loadSupportSettings(db: DbOrTx): Promise<SupportSettings> {
  const [row] = await db
    .select({
      contact: orgSettings.supportContact,
      details: orgSettings.supportDetails,
      outside: orgSettings.supportOutside,
      wording: orgSettings.supportWording,
      signoff: orgSettings.supportWordingSignoff,
    })
    .from(orgSettings)
    .limit(1);
  return {
    contact: row?.contact ?? "",
    details: row?.details ?? "",
    outside: row?.outside ?? "",
    wording: row?.wording ?? {},
    signoff: row?.signoff ?? null,
  };
}

/** What the bot's fixed wording needs, from the organisation's settings. */
export async function loadSupportResources(db: DbOrTx): Promise<OrgResources> {
  const [settings, [org]] = await Promise.all([
    loadSupportSettings(db),
    db.select({ name: orgSettings.name }).from(orgSettings).limit(1),
  ]);
  const contact = settings.contact.trim() || null;
  return {
    orgName: org?.name ?? EVAL_ORG.orgName,
    // Conduct routing isn't a setting of its own yet (backlog).
    hrContact: contact ?? "your HR team",
    supportContact: contact,
    supportDetails: settings.details,
    supportOutside: settings.outside,
    wording: settings.wording,
  };
}

/**
 * A fingerprint of exactly what people would see (the rendered wording,
 * with the contact and details filled in). A sign-off covers this; any
 * change to the wording, contact or details makes it stale.
 */
export function wordingHash(org: OrgResources): string {
  const p = wordingPreviews(org);
  return createHash("sha256").update(JSON.stringify([p.wellbeing, p.safety, p.conduct])).digest("hex");
}

/** First day of the month, UTC: the counts' key. */
export function monthKey(now: Date): string {
  return `${now.toISOString().slice(0, 7)}-01`;
}

/** Count one signpost shown. No person, conversation or time is stored. */
export async function countSignpost(tx: DbOrTx, level: SignpostLevel, now = new Date()): Promise<void> {
  await tx
    .insert(supportSignposts)
    .values({ month: monthKey(now), level, shown: 1 })
    .onConflictDoUpdate({
      target: [supportSignposts.month, supportSignposts.level],
      set: { shown: sql`${supportSignposts.shown} + 1` },
    });
}
