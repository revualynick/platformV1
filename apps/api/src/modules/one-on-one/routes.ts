import type { FastifyPluginAsync } from "fastify";
import { eq, and, asc, desc, ilike } from "drizzle-orm";
import type { TenantDb } from "@revualy/db";
import { users, oneOnOneEntries, oneOnOneEntryRevisions } from "@revualy/db";
import { requireAuth } from "../../lib/rbac.js";
import {
  parseBody,
  idParamSchema,
  createOneOnOneEntrySchema,
  updateOneOnOneEntrySchema,
  oneOnOneQuerySchema,
} from "../../lib/validation.js";

/**
 * Resolves the manager/employee pair from the current user and their partner.
 * Returns the pair IDs or null if the two users are not in a manager-employee relationship.
 */
async function resolveOneOnOnePair(
  db: TenantDb,
  userId: string,
  partnerId: string,
): Promise<{ managerId: string; employeeId: string } | null> {
  // Fetch both users
  const [currentUser] = await db
    .select({ id: users.id, managerId: users.managerId })
    .from(users)
    .where(eq(users.id, userId));

  const [partner] = await db
    .select({ id: users.id, managerId: users.managerId })
    .from(users)
    .where(eq(users.id, partnerId));

  if (!currentUser || !partner) return null;

  // Current user's manager is the partner → partner is manager
  if (currentUser.managerId === partnerId) {
    return { managerId: partnerId, employeeId: userId };
  }

  // Partner's manager is the current user → current user is manager
  if (partner.managerId === userId) {
    return { managerId: userId, employeeId: partnerId };
  }

  return null;
}

export const oneOnOneRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);

  // GET /?partnerId=X — List entries for a manager-employee pair
  app.get("/", async (request, reply) => {
    const { db } = request.tenant;
    const userId = request.tenant.userId!;
    const query = parseBody(oneOnOneQuerySchema, request.query);

    const pair = await resolveOneOnOnePair(db, userId, query.partnerId);
    if (!pair) {
      return reply.code(403).send({
        error: "You can only view 1:1 notes with your manager or direct report",
      });
    }

    const conditions = [
      eq(oneOnOneEntries.managerId, pair.managerId),
      eq(oneOnOneEntries.employeeId, pair.employeeId),
    ];
    if (query.search) {
      conditions.push(ilike(oneOnOneEntries.content, `%${query.search}%`));
    }

    const entries = await db
      .select({
        id: oneOnOneEntries.id,
        managerId: oneOnOneEntries.managerId,
        employeeId: oneOnOneEntries.employeeId,
        authorId: oneOnOneEntries.authorId,
        authorName: users.name,
        content: oneOnOneEntries.content,
        createdAt: oneOnOneEntries.createdAt,
        updatedAt: oneOnOneEntries.updatedAt,
      })
      .from(oneOnOneEntries)
      .innerJoin(users, eq(users.id, oneOnOneEntries.authorId))
      .where(and(...conditions))
      .orderBy(asc(oneOnOneEntries.createdAt));

    return reply.send({ data: entries });
  });

  // POST / — Create a new entry
  app.post("/", async (request, reply) => {
    const { db } = request.tenant;
    const userId = request.tenant.userId!;
    const body = parseBody(createOneOnOneEntrySchema, request.body);

    const pair = await resolveOneOnOnePair(db, userId, body.partnerId);
    if (!pair) {
      return reply.code(403).send({
        error: "You can only add 1:1 notes with your manager or direct report",
      });
    }

    const [created] = await db
      .insert(oneOnOneEntries)
      .values({
        managerId: pair.managerId,
        employeeId: pair.employeeId,
        authorId: userId,
        content: body.content,
      })
      .returning();

    // Fetch author name for response
    const [author] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, userId));

    return reply.code(201).send({
      ...created,
      authorName: author?.name ?? "Unknown",
    });
  });

  // PATCH /:id — Edit an entry (only the author can edit)
  app.patch("/:id", async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;
    const userId = request.tenant.userId!;
    const body = parseBody(updateOneOnOneEntrySchema, request.body);

    const [existing] = await db
      .select()
      .from(oneOnOneEntries)
      .where(eq(oneOnOneEntries.id, id));

    if (!existing) {
      return reply.code(404).send({ error: "Entry not found" });
    }

    // Only the author can edit their own entry
    if (existing.authorId !== userId) {
      return reply.code(403).send({ error: "You can only edit your own entries" });
    }

    // Verify the current user is part of this pair
    if (existing.managerId !== userId && existing.employeeId !== userId) {
      return reply.code(403).send({ error: "Access denied" });
    }

    // Save old content as a revision
    await db.insert(oneOnOneEntryRevisions).values({
      entryId: id,
      previousContent: existing.content,
    });

    // Update the entry
    const [updated] = await db
      .update(oneOnOneEntries)
      .set({ content: body.content, updatedAt: new Date() })
      .where(eq(oneOnOneEntries.id, id))
      .returning();

    const [author] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, updated.authorId));

    return reply.send({
      ...updated,
      authorName: author?.name ?? "Unknown",
    });
  });

  // GET /:id/history — List revisions for an entry
  app.get("/:id/history", async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;
    const userId = request.tenant.userId!;

    // Verify entry exists and user is part of the pair
    const [entry] = await db
      .select()
      .from(oneOnOneEntries)
      .where(eq(oneOnOneEntries.id, id));

    if (!entry) {
      return reply.code(404).send({ error: "Entry not found" });
    }

    if (entry.managerId !== userId && entry.employeeId !== userId) {
      return reply.code(403).send({ error: "Access denied" });
    }

    const revisions = await db
      .select()
      .from(oneOnOneEntryRevisions)
      .where(eq(oneOnOneEntryRevisions.entryId, id))
      .orderBy(desc(oneOnOneEntryRevisions.editedAt));

    return reply.send({ data: revisions });
  });

  // DELETE /:id — Delete an entry (only the author can delete)
  app.delete("/:id", async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;
    const userId = request.tenant.userId!;

    const [existing] = await db
      .select()
      .from(oneOnOneEntries)
      .where(eq(oneOnOneEntries.id, id));

    if (!existing) {
      return reply.code(404).send({ error: "Entry not found" });
    }

    if (existing.authorId !== userId) {
      return reply.code(403).send({ error: "You can only delete your own entries" });
    }

    if (existing.managerId !== userId && existing.employeeId !== userId) {
      return reply.code(403).send({ error: "Access denied" });
    }

    // Revisions cascade-delete via FK constraint
    await db.delete(oneOnOneEntries).where(eq(oneOnOneEntries.id, id));

    return reply.send({ success: true });
  });
};
