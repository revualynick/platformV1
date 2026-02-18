import type { FastifyPluginAsync } from "fastify";
import { eq, or, desc, inArray } from "drizzle-orm";
import { kudos, users } from "@revualy/db";
import { requireAuth, getAuthenticatedUserId } from "../../lib/rbac.js";
import {
  parseBody,
  createKudosSchema,
  kudosQuerySchema,
} from "../../lib/validation.js";

export const kudosRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);

  // GET /kudos?userId=X — List kudos where user is giver or receiver
  // If userId is provided and differs from caller, require manager/admin role
  app.get("/", async (request, reply) => {
    const { db } = request.tenant;
    const query = parseBody(kudosQuerySchema, request.query);
    const callerId = getAuthenticatedUserId(request);
    const userId = query.userId ?? callerId;

    // Scope check: employees can only view their own kudos
    if (userId !== callerId) {
      const [caller] = await db.select({ role: users.role }).from(users).where(eq(users.id, callerId));
      if (!caller || (caller.role !== "manager" && caller.role !== "admin")) {
        return reply.code(403).send({ error: "Forbidden" });
      }
    }

    // Fetch kudos for this user (given or received), newest first
    const rows = await db
      .select()
      .from(kudos)
      .where(or(eq(kudos.giverId, userId), eq(kudos.receiverId, userId)))
      .orderBy(desc(kudos.createdAt))
      .limit(100);

    // Batch-fetch user names for all givers/receivers
    const userIds = new Set<string>();
    rows.forEach((k) => {
      userIds.add(k.giverId);
      userIds.add(k.receiverId);
    });

    const nameMap = new Map<string, string>();
    if (userIds.size > 0) {
      const userRows = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, [...userIds]));
      userRows.forEach((u) => nameMap.set(u.id, u.name));
    }

    const data = rows.map((k) => ({
      ...k,
      giverName: nameMap.get(k.giverId) ?? "Unknown",
      receiverName: nameMap.get(k.receiverId) ?? "Unknown",
    }));

    return reply.send({ data, userId });
  });

  // POST /kudos — Create a kudos
  app.post("/", async (request, reply) => {
    const { db } = request.tenant;
    const body = parseBody(createKudosSchema, request.body);

    const [created] = await db
      .insert(kudos)
      .values({
        giverId: getAuthenticatedUserId(request),
        receiverId: body.receiverId,
        message: body.message,
        coreValueId: body.coreValueId,
        source: "dashboard",
      })
      .returning();

    return reply.code(201).send(created);
  });
};
