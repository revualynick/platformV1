import { eq, inArray } from "drizzle-orm";
import { authUsers, authSessions, type TenantDb } from "@revualy/db";

/**
 * Sync Revualy user fields to the authUsers table.
 * Per-tenant deployment: auth tables are in the same DB as business data.
 *
 * Fire-and-forget: logs errors but never throws (callers shouldn't fail
 * if the update encounters a transient error).
 */
export async function syncAuthUser(
  db: TenantDb,
  tenantUserId: string,
  updates: {
    role?: string;
    teamId?: string | null;
    onboardingCompleted?: boolean;
  },
): Promise<void> {
  try {
    await db
      .update(authUsers)
      .set(updates)
      .where(eq(authUsers.tenantUserId, tenantUserId));
  } catch (err) {
    console.error(
      `[auth-sync] Failed to sync authUser for tenant user ${tenantUserId}:`,
      err,
    );
  }
}

/**
 * Delete every web session belonging to a Revualy user, so deactivation
 * takes effect immediately instead of when the session expires. Unlike
 * syncAuthUser this throws: callers must not report success if access
 * was not actually revoked. Accepts a transaction.
 */
export async function revokeSessionsForUser(
  db: Pick<TenantDb, "select" | "delete">,
  tenantUserId: string,
): Promise<number> {
  const authIds = db
    .select({ id: authUsers.id })
    .from(authUsers)
    .where(eq(authUsers.tenantUserId, tenantUserId));
  const deleted = await db
    .delete(authSessions)
    .where(inArray(authSessions.userId, authIds))
    .returning({ token: authSessions.sessionToken });
  return deleted.length;
}
