import { eq } from "drizzle-orm";
import { authUsers, type TenantDb } from "@revualy/db";

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
