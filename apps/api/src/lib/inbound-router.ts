import { and, eq, sql } from "drizzle-orm";
import type { TenantDb, InboundOutcome } from "@revualy/db";
import {
  conversations,
  conversationMessages,
  identityLinkEvents,
  inboundMessages,
  userPlatformIdentities,
  users,
} from "@revualy/db";
import type { ChatPlatform } from "@revualy/shared";
import { findIdentity } from "./chat-identity.js";
import { supportSignpost } from "./bot-references.js";
import { loadSupportResources } from "./support.js";
import {
  appendLateAddition,
  appendUserMessage,
  findLateAdditionTarget,
  findOpenConversation,
  markIncomplete,
  queueAnalysis,
  type OrchestratorDeps,
} from "./conversation-orchestrator.js";

/**
 * Inbound routing (C3 plan, phase 3). The webhook has already stored the
 * message in inbound_messages; this decides what it is, in order:
 *
 *  1. sender has no linked identity           -> unknown_sender
 *  2. manual link awaiting their confirmation -> identity_confirmation
 *  3. help / stop / start                     -> keyword
 *  4. open conversation on this platform      -> conversation_reply (turn queued)
 *  5. conversation finished within 7 days     -> late_addition (re-analysed)
 *  6. check-ins paused                        -> paused
 *  7. otherwise                               -> no_open_conversation
 *
 * Every reply outside a conversation is fixed text, never LLM-generated.
 * Safe to retry: effects are idempotent, then the reply is sent, then the
 * row is marked processed. A crash after sending but before marking can
 * repeat that one reply, which is preferred to losing it.
 */

export interface InboundDeps extends OrchestratorDeps {
  /** Queue (or, in the simulator, run) the turn that answers message `seq`. */
  scheduleTurn(conversationId: string, seq: number, truncated: boolean): Promise<void>;
}

export type InboundResult =
  | { status: "processed"; outcome: InboundOutcome; conversationId?: string }
  | { status: "already_processed" }
  | { status: "not_found" };

type InboundRow = typeof inboundMessages.$inferSelect;
type Identity = typeof userPlatformIdentities.$inferSelect;

export async function handleInbound(
  db: TenantDb,
  deps: InboundDeps,
  inboundId: string,
): Promise<InboundResult> {
  const [msg] = await db.select().from(inboundMessages).where(eq(inboundMessages.id, inboundId));
  if (!msg) return { status: "not_found" };
  if (msg.status === "processed") return { status: "already_processed" };

  const platform = msg.platform as ChatPlatform;
  const reply = (text: string) => sendDirect(deps, msg, text);
  const meta = { platformMessageId: msg.platformMessageId, sentAt: msg.sentAt };

  // 1. Who is this?
  const identity = await findIdentity(db, platform, msg.platformUserId);
  if (!identity) {
    await reply(TEXT.unknownSender);
    return finish(db, msg, "unknown_sender");
  }
  const userId = identity.userId;

  // 2. A manual link they have not confirmed yet: this message is the answer.
  if (identity.linkSource !== "auto" && !identity.confirmedAt) {
    await handleConfirmation(db, identity, msg.content, reply);
    return finish(db, msg, "identity_confirmation", userId);
  }

  // 3. Keywords.
  const keyword = parseKeyword(msg.content);
  if (keyword) {
    if (keyword !== "help") await setPaused(db, userId, keyword === "stop");
    // "stop" also ends a check-in under way: kept and analysed as partial.
    if (keyword === "stop") {
      const open = await findOpenConversation(db, userId, platform);
      if (open) await markIncomplete(db, deps, open.id);
    }
    await reply(TEXT[keyword]);
    return finish(db, msg, "keyword", userId);
  }

  // 4. An answer in an open conversation.
  const open = await findOpenConversation(db, userId, platform);
  if (open) {
    const appended = await appendUserMessage(db, open.id, msg.content, meta);
    // Stored by an earlier attempt of this job: still make sure its turn is queued.
    const seq =
      appended.status === "appended"
        ? appended.seq
        : appended.status === "duplicate"
          ? await storedSeq(db, open.id, msg.platformMessageId)
          : undefined;
    // "not_open": the conversation closed between the lookup and the
    // append, so this becomes a late addition below.
    if (seq !== undefined) {
      await deps.scheduleTurn(open.id, seq, msg.truncated);
      return finish(db, msg, "conversation_reply", userId, open.id);
    }
  }

  // 5. Something they forgot to say in a conversation that just finished.
  const late = await findLateAdditionTarget(db, userId, platform);
  // A check-in that ended with a support signpost is never added to: a
  // follow-up isn't feedback, and saying "added to your feedback" to someone
  // who is struggling would be wrong. They get the signpost again; the
  // message stays only in the ledger, which retention purges.
  if (late && late.phase === "support") {
    await reply(supportSignpost("safety", await loadSupportResources(db)));
    return finish(db, msg, "no_open_conversation", userId);
  }
  if (late) {
    await appendLateAddition(db, late.id, msg.content, meta);
    await queueAnalysis(deps, late.id, "late", msg.id);
    await reply(await lateAdditionText(db, late));
    return finish(db, msg, "late_addition", userId, late.id);
  }

  // 6-7. Nothing to attach it to. Stored (in the ledger), and said so honestly.
  const paused = await isPaused(db, userId);
  await reply(paused ? TEXT.pausedNote : TEXT.noOpenConversation);
  return finish(db, msg, paused ? "paused" : "no_open_conversation", userId);
}

// ── Keywords ─────────────────────────────────────────────

type Keyword = "help" | "stop" | "start";

/** Exact keyword, ignoring case, surrounding space and trailing punctuation. */
export function parseKeyword(text: string): Keyword | null {
  const word = text.trim().toLowerCase().replace(/[.!?]+$/, "");
  return word === "help" || word === "stop" || word === "start" ? word : null;
}

async function setPaused(db: TenantDb, userId: string, paused: boolean): Promise<void> {
  // jsonb merge in one statement: never overwrites other preferences.
  await db
    .update(users)
    .set({
      preferences: sql`coalesce(${users.preferences}, '{}'::jsonb) || jsonb_build_object('chatPaused', ${paused}::boolean)`,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

async function isPaused(db: TenantDb, userId: string): Promise<boolean> {
  const [row] = await db.select({ preferences: users.preferences }).from(users).where(eq(users.id, userId));
  return Boolean((row?.preferences as { chatPaused?: boolean } | null)?.chatPaused);
}

// ── Link confirmation (manual Slack/Teams links) ─────────

async function handleConfirmation(
  db: TenantDb,
  identity: Identity,
  text: string,
  reply: (text: string) => Promise<void>,
): Promise<void> {
  const answer = text.trim().toLowerCase().replace(/[.!?]+$/, "");
  if (answer === "yes" || answer === "y") {
    await db.transaction(async (tx) => {
      await tx
        .update(userPlatformIdentities)
        .set({ confirmedAt: new Date(), updatedAt: new Date() })
        .where(eq(userPlatformIdentities.id, identity.id));
      await tx.insert(identityLinkEvents).values({
        userId: identity.userId,
        platform: identity.platform,
        platformUserId: identity.platformUserId,
        action: "confirm",
      });
    });
    await reply(TEXT.confirmYes);
    return;
  }
  if (answer === "no" || answer === "n") {
    await db.transaction(async (tx) => {
      await tx.delete(userPlatformIdentities).where(eq(userPlatformIdentities.id, identity.id));
      await tx.insert(identityLinkEvents).values({
        userId: identity.userId,
        platform: identity.platform,
        platformUserId: identity.platformUserId,
        action: "reject",
      });
    });
    await reply(TEXT.confirmNo);
    return;
  }
  const [user] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, identity.userId));
  await reply(
    `Your Revualy admin linked this chat account to ${user?.name ?? "a Revualy user"}` +
      `${user?.email ? ` (${user.email})` : ""}. Is that you? Please reply yes or no.`,
  );
}

// ── Helpers ──────────────────────────────────────────────

async function storedSeq(
  db: TenantDb,
  conversationId: string,
  platformMessageId: string,
): Promise<number | undefined> {
  const [row] = await db
    .select({ seq: conversationMessages.seq })
    .from(conversationMessages)
    .where(
      and(
        eq(conversationMessages.conversationId, conversationId),
        eq(conversationMessages.platformMessageId, platformMessageId),
      ),
    );
  return row?.seq;
}

async function lateAdditionText(
  db: TenantDb,
  conv: typeof conversations.$inferSelect,
): Promise<string> {
  if (conv.interactionType === "self_reflection") return "Thanks, I've added that to your reflection.";
  const [subject] = await db.select({ name: users.name }).from(users).where(eq(users.id, conv.subjectId));
  return `Thanks, I've added that to your feedback on ${subject?.name ?? "your colleague"}.`;
}

/** Reply outside a conversation, to the DM the message came from. */
async function sendDirect(deps: InboundDeps, msg: InboundRow, text: string): Promise<void> {
  const platform = msg.platform as ChatPlatform;
  if (!deps.adapters.has(platform)) {
    throw new Error(`No chat adapter registered for ${platform}; cannot reply to inbound ${msg.id}`);
  }
  await deps.adapters.sendMessage({ platform, channelId: msg.platformChannelId, text, blocks: [] });
}

async function finish(
  db: TenantDb,
  msg: InboundRow,
  outcome: InboundOutcome,
  userId?: string,
  conversationId?: string,
): Promise<InboundResult> {
  await db
    .update(inboundMessages)
    .set({
      status: "processed",
      outcome,
      userId: userId ?? null,
      conversationId: conversationId ?? null,
      processedAt: new Date(),
    })
    .where(eq(inboundMessages.id, msg.id));
  return { status: "processed", outcome, conversationId };
}

export const TEXT = {
  help:
    "I'm Revualy's feedback assistant. A couple of times a week I'll ask a few quick questions here, " +
    "about working with your colleagues or about your own week. Just reply in your own words. " +
    "Message stop to pause check-ins, start to turn them back on, or help to see this again.",
  stop: "Done, I've paused your check-ins. Message start whenever you'd like them back.",
  start: "Check-ins are back on. I'll be in touch at your next scheduled time.",
  pausedNote: "Your check-ins are paused, so there's nothing open to add that to. Message start to turn them back on.",
  noOpenConversation: "Thanks, I've saved that. I'll be in touch for your next check-in.",
  unknownSender:
    "Hi, I couldn't match you to a Revualy account yet. Please ask your Revualy admin to add you, then message me again.",
  confirmYes: "Thanks, you're all set. I'll check in with you here from now on.",
  confirmNo:
    "Thanks for letting me know. I've removed the link and won't message this account. Please let your Revualy admin know.",
} as const;
