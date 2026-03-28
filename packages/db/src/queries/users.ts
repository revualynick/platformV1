import { eq, and } from "drizzle-orm";
import { users } from "../schema/tenant.js";
import type { TenantDb } from "../tenant.js";

export async function listActiveUsers(
  db: TenantDb,
  filters?: { teamId?: string; managerId?: string; limit?: number },
) {
  const conditions = [eq(users.isActive, true)];
  if (filters?.teamId) conditions.push(eq(users.teamId, filters.teamId));
  if (filters?.managerId) conditions.push(eq(users.managerId, filters.managerId));

  return db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      teamId: users.teamId,
      managerId: users.managerId,
      timezone: users.timezone,
      isActive: users.isActive,
    })
    .from(users)
    .where(and(...conditions))
    .limit(filters?.limit ?? 200);
}

export async function getUserById(db: TenantDb, id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user ?? null;
}

export async function getUserRole(db: TenantDb, id: string) {
  const [row] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, id));
  return row?.role ?? null;
}

export async function getUserWithManager(db: TenantDb, id: string) {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      teamId: users.teamId,
      managerId: users.managerId,
      timezone: users.timezone,
      isActive: users.isActive,
      onboardingCompleted: users.onboardingCompleted,
      preferences: users.preferences,
    })
    .from(users)
    .where(eq(users.id, id));
  return user ?? null;
}
