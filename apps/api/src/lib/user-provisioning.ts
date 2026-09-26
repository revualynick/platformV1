import { users, type TenantDb } from "@revualy/db";

export interface NewUser {
  email: string;
  name: string;
  role?: string;
  teamId?: string | null;
  managerId?: string | null;
  timezone?: string;
  jobTitle?: string | null;
  startDate?: string | null;
}

/**
 * Insert users, skipping any whose email already exists. Shared by
 * POST /users/bulk and data imports so both create users the same way.
 * Returns only the rows actually created. Accepts a transaction.
 */
export async function insertUsersSkippingExisting(db: Pick<TenantDb, "insert">, rows: NewUser[]) {
  if (rows.length === 0) return [];
  return db
    .insert(users)
    .values(
      rows.map((u) => ({
        email: u.email,
        name: u.name,
        role: u.role ?? "employee",
        teamId: u.teamId ?? null,
        managerId: u.managerId ?? null,
        timezone: u.timezone ?? "UTC",
        jobTitle: u.jobTitle ?? null,
        startDate: u.startDate ?? null,
      })),
    )
    .onConflictDoNothing({ target: users.email })
    .returning();
}
