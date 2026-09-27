import { and, eq, gt, isNull } from "drizzle-orm";
import { accessGrants, users, type TenantDb } from "@revualy/db";

/**
 * Break-glass grants (docs/design/privacy-and-agent-access.md): an admin
 * records a reason and gets read-only access to one person's content for a
 * dated period, for a limited time. The routes live in
 * modules/access-grants; this is the check the content routes share.
 */

export const GRANT_MAX_DAYS = 30;
export const GRANT_DEFAULT_DAYS = 14;
/** The longest period of someone's history one grant may cover. */
export const GRANT_MAX_PERIOD_DAYS = 366;

export type GrantRow = typeof accessGrants.$inferSelect;
export type GrantStatus = "active" | "expired" | "revoked";

export function grantStatus(g: Pick<GrantRow, "revokedAt" | "expiresAt">, now = new Date()): GrantStatus {
  if (g.revokedAt) return "revoked";
  return g.expiresAt > now ? "active" : "expired";
}

/**
 * Whether the subject may see this grant: always, unless a hold is set, and
 * a hold ends when it is lifted or the grant stops being active.
 */
export function subjectNotified(g: Pick<GrantRow, "holdReason" | "holdLiftedAt" | "revokedAt" | "expiresAt">, now = new Date()): boolean {
  if (!g.holdReason) return true;
  if (g.holdLiftedAt) return true;
  return grantStatus(g, now) !== "active";
}

/**
 * The caller's active grant for this subject, if any. The caller must still
 * be an active admin: a grant stops working the moment its holder is
 * demoted or deactivated.
 */
export async function findActiveGrant(db: TenantDb, granteeId: string, subjectId: string): Promise<GrantRow | null> {
  const [row] = await db
    .select({ grant: accessGrants, role: users.role, isActive: users.isActive })
    .from(accessGrants)
    .innerJoin(users, eq(users.id, accessGrants.granteeId))
    .where(
      and(
        eq(accessGrants.granteeId, granteeId),
        eq(accessGrants.subjectId, subjectId),
        isNull(accessGrants.revokedAt),
        gt(accessGrants.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row || !row.isActive || (row.role !== "admin" && row.role !== "super_admin")) return null;
  return row.grant;
}
