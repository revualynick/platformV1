import { eq } from "drizzle-orm";
import { getControlPlaneDb } from "@revualy/db";
import { authUsers } from "@revualy/db/schema";

/**
 * Sync Revualy user fields to the authUsers table in the control plane DB.
 * This keeps database session data fresh when admins change a user's
 * role, team, or onboarding status via the API.
 *
 * Fire-and-forget: logs errors but never throws (callers shouldn't fail
 * if the control plane DB is temporarily unreachable).
 */
export async function syncAuthUser(
  tenantUserId: string,
  updates: {
    role?: string;
    teamId?: string | null;
    onboardingCompleted?: boolean;
  },
): Promise<void> {
  try {
    const cpDb = getControlPlaneDb();
    await cpDb
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
