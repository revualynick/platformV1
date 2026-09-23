import type { TenantDb } from "@revualy/db";
import { userRelationships } from "@revualy/db";

export interface RelationshipInput {
  fromUserId: string;
  toUserId: string;
  label?: string;
  tags?: string[];
  strength?: number;
  source?: "manual" | "calendar" | "chat";
  notes?: string;
}

/**
 * Create a relationship, or reactivate and update the existing row for the
 * same directional pair. Deleting a relationship only sets is_active=false,
 * so a plain insert hit uq_user_relationship_pair and returned a 500 when
 * someone re-created a relationship they had previously removed.
 * (Calendar sync deliberately uses ON CONFLICT DO NOTHING instead, so it
 * never overrides a manual relationship.)
 */
export async function upsertRelationship(db: TenantDb, input: RelationshipInput) {
  const values = {
    fromUserId: input.fromUserId,
    toUserId: input.toUserId,
    label: input.label ?? "",
    tags: input.tags ?? [],
    strength: input.strength ?? 0.5,
    source: input.source ?? "manual",
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
  };
  const [row] = await db
    .insert(userRelationships)
    .values(values)
    .onConflictDoUpdate({
      target: [userRelationships.fromUserId, userRelationships.toUserId],
      set: {
        label: values.label,
        tags: values.tags,
        strength: values.strength,
        source: values.source,
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        isActive: true,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}
