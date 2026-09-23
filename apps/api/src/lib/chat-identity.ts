import { and, eq, sql } from "drizzle-orm";
import type { TenantDb } from "@revualy/db";
import { users, userPlatformIdentities, identityLinkEvents, authAccounts, authUsers } from "@revualy/db";
import type { ChatPlatform } from "@revualy/shared";

/**
 * Chat identity: which chat account belongs to which Revualy user, and
 * whether we can DM them.
 *
 * Only Google Chat links automatically: its accounts are the same Google
 * accounts people sign in with, so a verified email match is the identity.
 * Slack and Teams accounts are linked by an admin or manager (C3 plan,
 * phase 7) and confirmed by the person before feedback flows.
 */

const AUTO_LINK_PLATFORMS: ReadonlySet<ChatPlatform> = new Set(["google_chat"]);

type Identity = typeof userPlatformIdentities.$inferSelect;

export type AutoLinkResult =
  | { status: "linked"; identity: Identity; created: boolean }
  /** No active Revualy user has this email (or the event had no email). */
  | { status: "unknown_sender" }
  /** The user already has a different account linked on this platform. */
  | { status: "conflict"; existingPlatformUserId: string }
  /** This platform does not auto-link (Slack/Teams need a manual link). */
  | { status: "not_auto_linkable" };

export interface AutoLinkInput {
  platform: ChatPlatform;
  platformUserId: string;
  email?: string;
  displayName?: string;
  /** Known DM address (e.g. from ADDED_TO_SPACE); makes them reachable. */
  dmAddress?: string;
}

/**
 * Link a chat account to the Revualy user with the same email, or refresh
 * an existing link (display name, DM address). Idempotent and safe under
 * concurrent webhooks for the same person.
 */
export async function autoLinkByEmail(
  db: TenantDb,
  input: AutoLinkInput,
): Promise<AutoLinkResult> {
  const existing = await findIdentity(db, input.platform, input.platformUserId);
  if (existing) {
    const refreshed = await refreshIdentity(db, existing, input);
    return { status: "linked", identity: refreshed, created: false };
  }

  if (!AUTO_LINK_PLATFORMS.has(input.platform)) {
    return { status: "not_auto_linkable" };
  }

  const user =
    (input.email ? await activeUserByEmail(db, input.email) : undefined) ??
    (await activeUserByGoogleAccount(db, input.platformUserId));
  if (!user) return { status: "unknown_sender" };

  const [other] = await db
    .select({ platformUserId: userPlatformIdentities.platformUserId })
    .from(userPlatformIdentities)
    .where(
      and(
        eq(userPlatformIdentities.userId, user.id),
        eq(userPlatformIdentities.platform, input.platform),
      ),
    );
  if (other) {
    // Same account: a concurrent webhook linked it between our first read
    // and now, so this is a success, not a conflict.
    if (other.platformUserId === input.platformUserId) {
      const current = await findIdentity(db, input.platform, input.platformUserId);
      if (current) {
        const refreshed = await refreshIdentity(db, current, input);
        return { status: "linked", identity: refreshed, created: false };
      }
    }
    return { status: "conflict", existingPlatformUserId: other.platformUserId };
  }

  const reachable = Boolean(input.dmAddress);
  const now = new Date();
  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(userPlatformIdentities)
      .values({
        userId: user.id,
        platform: input.platform,
        platformUserId: input.platformUserId,
        displayName: input.displayName ?? "",
        dmAddress: input.dmAddress ?? null,
        status: reachable ? "reachable" : "linked",
        linkSource: "auto",
        confirmedAt: now,
      })
      // A concurrent webhook for the same person may have won the race.
      .onConflictDoNothing()
      .returning();
    if (!row) return null;
    await tx.insert(identityLinkEvents).values([
      { userId: user.id, platform: input.platform, platformUserId: input.platformUserId, action: "link" },
      ...(reachable
        ? [{ userId: user.id, platform: input.platform, platformUserId: input.platformUserId, action: "reachable" as const }]
        : []),
    ]);
    return row;
  });

  if (created) return { status: "linked", identity: created, created: true };

  // Lost the race: the winner's row is authoritative.
  const winner = await findIdentity(db, input.platform, input.platformUserId);
  if (winner) return { status: "linked", identity: winner, created: false };
  return { status: "conflict", existingPlatformUserId: input.platformUserId };
}

/**
 * The bot was removed from the person's DM: keep the link, drop the
 * address, so the scheduler stops trying to message them.
 */
export async function markUnreachable(
  db: TenantDb,
  platform: ChatPlatform,
  platformUserId: string,
): Promise<boolean> {
  const identity = await findIdentity(db, platform, platformUserId);
  if (!identity || identity.status !== "reachable") return false;

  await db.transaction(async (tx) => {
    await tx
      .update(userPlatformIdentities)
      .set({ status: "linked", dmAddress: null, updatedAt: new Date() })
      .where(eq(userPlatformIdentities.id, identity.id));
    await tx.insert(identityLinkEvents).values({
      userId: identity.userId,
      platform,
      platformUserId,
      action: "unreachable",
    });
  });
  return true;
}

export async function findIdentity(
  db: TenantDb,
  platform: ChatPlatform,
  platformUserId: string,
): Promise<Identity | undefined> {
  const [row] = await db
    .select()
    .from(userPlatformIdentities)
    .where(
      and(
        eq(userPlatformIdentities.platform, platform),
        eq(userPlatformIdentities.platformUserId, platformUserId),
      ),
    );
  return row;
}

async function refreshIdentity(
  db: TenantDb,
  identity: Identity,
  input: AutoLinkInput,
): Promise<Identity> {
  const nameChanged = input.displayName && input.displayName !== identity.displayName;
  const becomesReachable = input.dmAddress && input.dmAddress !== identity.dmAddress;
  if (!nameChanged && !becomesReachable) return identity;

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(userPlatformIdentities)
      .set({
        ...(nameChanged ? { displayName: input.displayName } : {}),
        ...(becomesReachable ? { dmAddress: input.dmAddress, status: "reachable" as const } : {}),
        updatedAt: new Date(),
      })
      .where(eq(userPlatformIdentities.id, identity.id))
      .returning();
    if (becomesReachable && identity.status !== "reachable") {
      await tx.insert(identityLinkEvents).values({
        userId: identity.userId,
        platform: identity.platform as ChatPlatform,
        platformUserId: identity.platformUserId,
        action: "reachable",
      });
    }
    return row;
  });
}

async function activeUserByEmail(db: TenantDb, email: string) {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(sql`lower(${users.email}) = ${email.toLowerCase()}`, eq(users.isActive, true)));
  return user;
}

/**
 * Fallback when a Chat event carries no email: Chat addresses people as
 * users/{id}, and for Google accounts that id is expected to be the same
 * as the OAuth subject we stored at sign-in (auth_account.providerAccountId).
 * UNVERIFIED on a real Workspace (see docs/c3-plan.md "Google Chat facts"),
 * so it is only used after email matching fails.
 */
async function activeUserByGoogleAccount(db: TenantDb, platformUserId: string) {
  const accountId = googleAccountIdFromChatUser(platformUserId);
  if (!accountId) return undefined;
  const [row] = await db
    .select({ id: users.id })
    .from(authAccounts)
    .innerJoin(authUsers, eq(authUsers.id, authAccounts.userId))
    .innerJoin(users, eq(users.id, authUsers.tenantUserId))
    .where(
      and(
        eq(authAccounts.provider, "google"),
        eq(authAccounts.providerAccountId, accountId),
        eq(users.isActive, true),
      ),
    );
  return row;
}

/** "users/1234567890" -> "1234567890" (numeric ids only; not email aliases). */
export function googleAccountIdFromChatUser(platformUserId: string): string | null {
  const m = /^users\/(\d+)$/.exec(platformUserId);
  return m ? m[1] : null;
}

/**
 * Proactive reach for Google Chat before the person has messaged the bot:
 * look up the DM space for their Google account (pre-created by a
 * domain-wide admin install) and link it. Returns the DM address, or null
 * if they have no Google sign-in yet or no DM exists.
 */
export async function discoverGoogleChatDm(
  db: TenantDb,
  userId: string,
  findDirectMessage: (platformUserRef: string) => Promise<string | null>,
): Promise<string | null> {
  const [account] = await db
    .select({ accountId: authAccounts.providerAccountId })
    .from(authAccounts)
    .innerJoin(authUsers, eq(authUsers.id, authAccounts.userId))
    .where(and(eq(authAccounts.provider, "google"), eq(authUsers.tenantUserId, userId)));
  if (!account) return null;

  const platformUserId = `users/${account.accountId}`;
  const dmAddress = await findDirectMessage(platformUserId);
  if (!dmAddress) return null;

  const res = await autoLinkByEmail(db, { platform: "google_chat", platformUserId, dmAddress });
  return res.status === "linked" && res.identity.userId === userId ? dmAddress : null;
}
