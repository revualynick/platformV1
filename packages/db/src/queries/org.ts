import { eq } from "drizzle-orm";
import {
  coreValues,
  teams,
  orgSettings,
  userRelationships,
} from "../schema/tenant.js";
import type { TenantDb } from "../tenant.js";

export async function getActiveCoreValues(db: TenantDb) {
  return db
    .select()
    .from(coreValues)
    .where(eq(coreValues.isActive, true))
    .orderBy(coreValues.sortOrder);
}

export async function getAllTeams(db: TenantDb) {
  return db.select().from(teams);
}

export async function getOrgSettings(db: TenantDb) {
  const [settings] = await db.select().from(orgSettings).limit(1);
  return settings ?? null;
}

export async function getActiveRelationships(db: TenantDb) {
  return db
    .select()
    .from(userRelationships)
    .where(eq(userRelationships.isActive, true));
}
