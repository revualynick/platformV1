import type { FastifyPluginAsync } from "fastify";
import { eq, and, desc, inArray } from "drizzle-orm";
import {
  profileSnapshots,
  profileDevelopmentGoals,
  users,
  teams,
} from "@revualy/db";
import {
  parseBody,
  idParamSchema,
  userIdParamSchema,
  profileQuerySchema,
  profileTimelineQuerySchema,
  teamProfileQuerySchema,
  createDevelopmentGoalSchema,
  updateDevelopmentGoalSchema,
  teamIdParamSchema,
} from "../../lib/validation.js";

import {
  requireAuth,
  requireRole,
  getAuthenticatedUserId,
  assertContentAccess,
  withinAccess,
  assertCanAccessUsers,
  getUserRole,
  isAdminRole,
} from "../../lib/rbac.js";
import type { Queue } from "bullmq";
import { getReportingTree } from "@revualy/db/queries";

// Injected by server startup (same pattern as demo/campaign queues)
let notificationQueue: Queue | null = null;
export function setProfilesNotificationQueue(queue: Queue) {
  notificationQueue = queue;
}

export const profileRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);

  // GET /profiles/me — my latest profiles (both frameworks)
  app.get("/me", async (request, reply) => {
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);
    const query = parseBody(profileQuerySchema, request.query);

    const conditions = [eq(profileSnapshots.userId, userId)];
    if (query.framework) {
      conditions.push(eq(profileSnapshots.framework, query.framework));
    }

    const snapshots = await db
      .select()
      .from(profileSnapshots)
      .where(and(...conditions))
      .orderBy(desc(profileSnapshots.createdAt));

    // Return latest per framework
    const latest: Record<string, typeof snapshots[number]> = {};
    for (const s of snapshots) {
      if (!latest[s.framework]) {
        latest[s.framework] = s;
      }
    }

    return reply.send({ data: Object.values(latest) });
  });

  // GET /profiles/me/timeline — profile snapshots over time
  app.get("/me/timeline", async (request, reply) => {
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);
    const query = parseBody(profileTimelineQuerySchema, request.query);

    const conditions = [
      eq(profileSnapshots.userId, userId),
      eq(profileSnapshots.framework, query.framework),
    ];
    if (query.source && query.source !== "all") {
      conditions.push(eq(profileSnapshots.source, query.source));
    }

    const snapshots = await db
      .select()
      .from(profileSnapshots)
      .where(and(...conditions))
      .orderBy(profileSnapshots.createdAt);

    return reply.send({ data: snapshots });
  });

  // GET /profiles/users/:userId — view someone's profile (manager+ only)
  app.get(
    "/users/:userId",
    { preHandler: requireRole("manager") },
    async (request, reply) => {
      const { userId } = parseBody(userIdParamSchema, request.params);
      const access = await assertContentAccess(request, userId);
      const { db } = request.tenant;
      const query = parseBody(profileQuerySchema, request.query);

      const conditions = [eq(profileSnapshots.userId, userId)];
      if (query.framework) {
        conditions.push(eq(profileSnapshots.framework, query.framework));
      }

      const snapshots = (
        await db
          .select()
          .from(profileSnapshots)
          .where(and(...conditions))
          .orderBy(desc(profileSnapshots.createdAt))
      ).filter((snap) => withinAccess(access, snap.createdAt));

      const latest: Record<string, typeof snapshots[number]> = {};
      for (const s of snapshots) {
        if (!latest[s.framework]) {
          latest[s.framework] = s;
        }
      }

      // Also fetch development goals
      const goalConditions = [eq(profileDevelopmentGoals.userId, userId)];
      if (query.framework) {
        goalConditions.push(eq(profileDevelopmentGoals.framework, query.framework));
      }

      const goals = (
        await db
          .select()
          .from(profileDevelopmentGoals)
          .where(and(...goalConditions))
          .orderBy(desc(profileDevelopmentGoals.createdAt))
      ).filter((g) => withinAccess(access, g.createdAt));

      return reply.send({
        profiles: Object.values(latest),
        goals,
      });
    },
  );

  // GET /profiles/users/:userId/timeline — view someone's timeline (manager+)
  app.get(
    "/users/:userId/timeline",
    { preHandler: requireRole("manager") },
    async (request, reply) => {
      const { userId } = parseBody(userIdParamSchema, request.params);
      const access = await assertContentAccess(request, userId);
      const { db } = request.tenant;
      const query = parseBody(profileTimelineQuerySchema, request.query);

      const conditions = [
        eq(profileSnapshots.userId, userId),
        eq(profileSnapshots.framework, query.framework),
      ];
      if (query.source && query.source !== "all") {
        conditions.push(eq(profileSnapshots.source, query.source));
      }

      const snapshots = (
        await db
          .select()
          .from(profileSnapshots)
          .where(and(...conditions))
          .orderBy(profileSnapshots.createdAt)
      ).filter((snap) => withinAccess(access, snap.createdAt));

      return reply.send({ data: snapshots });
    },
  );

  // GET /profiles/users/:userId/drift — compare baseline vs behavioral
  app.get(
    "/users/:userId/drift",
    { preHandler: requireRole("manager") },
    async (request, reply) => {
      const { userId } = parseBody(userIdParamSchema, request.params);
      const access = await assertContentAccess(request, userId);
      const { db } = request.tenant;
      const query = parseBody(profileTimelineQuerySchema, request.query);

      const conditions = [
        eq(profileSnapshots.userId, userId),
        eq(profileSnapshots.framework, query.framework),
      ];

      const snapshots = (
        await db
          .select()
          .from(profileSnapshots)
          .where(and(...conditions))
          .orderBy(desc(profileSnapshots.createdAt))
      ).filter((snap) => withinAccess(access, snap.createdAt));

      const latestAssessment = snapshots.find((s) => s.source === "assessment");
      const latestBehavioral = snapshots.find((s) => s.source === "behavioral");

      if (!latestAssessment) {
        return reply.code(404).send({ error: "No assessment profile found" });
      }

      if (!latestBehavioral) {
        return reply.send({
          baseline: latestAssessment,
          observed: null,
          drift: null,
          message: "No behavioral data yet",
        });
      }

      // Compute per-dimension drift
      const baselineDims = latestAssessment.dimensions as Record<string, number>;
      const observedDims = latestBehavioral.dimensions as Record<string, number>;
      const drift: Record<string, number> = {};

      for (const dim of Object.keys(baselineDims)) {
        drift[dim] = Math.round(((observedDims[dim] ?? 0) - (baselineDims[dim] ?? 0)) * 1000) / 1000;
      }

      return reply.send({
        baseline: latestAssessment,
        observed: latestBehavioral,
        drift,
      });
    },
  );

  // GET /profiles/team/:teamId — team composition view (manager+)
  app.get(
    "/team/:teamId",
    { preHandler: requireRole("manager") },
    async (request, reply) => {
      const { teamId } = parseBody(teamIdParamSchema, request.params);
      const { db } = request.tenant;
      const query = parseBody(teamProfileQuerySchema, request.query);

      // Team-ownership is the primary gate: the caller must oversee the team's
      // manager (be them, an ancestor manager, or an admin). Relying only on the
      // per-member tree check below would leak a whole team's profiles to any
      // manager who merely shares a single skip-level report with that team.
      const [team] = await db
        .select({ managerId: teams.managerId })
        .from(teams)
        .where(eq(teams.id, teamId));
      if (!team) {
        return reply.code(404).send({ error: "Team not found" });
      }
      // Per-person profiles are self data (two-party): only the team's own
      // manager sees them, not managers above or admins (privacy design,
      // "Who sees what about a person", 2026-09-27).
      if (!team.managerId || team.managerId !== getAuthenticatedUserId(request)) {
        return reply.code(403).send({ error: "Insufficient permissions" });
      }

      // Get team members
      const teamMembers = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(and(eq(users.teamId, teamId), eq(users.isActive, true)));

      if (teamMembers.length === 0) {
        return reply.send({ data: [] });
      }

      const memberIds = teamMembers.map((m) => m.id);

      // Defence-in-depth: also confirm every returned member is in the caller's
      // tree (catches data inconsistencies where a member's teamId != manager).
      await assertCanAccessUsers(request, memberIds);

      // Get latest profile snapshot per member for the requested framework
      const allSnapshots = await db
        .select()
        .from(profileSnapshots)
        .where(
          and(
            inArray(profileSnapshots.userId, memberIds),
            eq(profileSnapshots.framework, query.framework),
          ),
        )
        .orderBy(desc(profileSnapshots.createdAt));

      // Latest per user (prefer assessment, fall back to behavioral)
      const latestByUser = new Map<string, typeof allSnapshots[number]>();
      for (const s of allSnapshots) {
        const existing = latestByUser.get(s.userId);
        if (!existing) {
          latestByUser.set(s.userId, s);
        }
      }

      const data = teamMembers.map((m) => ({
        user: m,
        profile: latestByUser.get(m.id) ?? null,
      }));

      return reply.send({ data });
    },
  );

  // POST /profiles/users/:userId/goals — create development goal (manager+)
  app.post(
    "/users/:userId/goals",
    { preHandler: requireRole("manager") },
    async (request, reply) => {
      const { userId } = parseBody(userIdParamSchema, request.params);
      const { db } = request.tenant;
      const setById = getAuthenticatedUserId(request);
      const body = parseBody(createDevelopmentGoalSchema, request.body);

      const [goal] = await db
        .insert(profileDevelopmentGoals)
        .values({
          userId,
          framework: body.framework,
          dimension: body.dimension,
          targetDirection: body.targetDirection,
          setById,
          baselineSnapshotId: body.baselineSnapshotId ?? null,
          notes: body.notes ?? null,
        })
        .returning();

      return reply.code(201).send(goal);
    },
  );

  // POST /profiles/users/:userId/assessment-invite — nudge a report to
  // take an assessment (manager+, subject must be in reporting tree).
  app.post(
    "/users/:userId/assessment-invite",
    { preHandler: requireRole("manager") },
    async (request, reply) => {
      const { userId } = parseBody(userIdParamSchema, request.params);
      const { db, orgId } = request.tenant;
      const managerId = getAuthenticatedUserId(request);

      // Direct reports only (privacy design: a person's profile is two-party).
      const [target] = await db.select({ managerId: users.managerId }).from(users).where(eq(users.id, userId));
      if (!target || target.managerId !== managerId || userId === managerId) {
        return reply
          .code(403)
          .send({ error: "You can only invite your own reports" });
      }

      const [[subject], [manager]] = await Promise.all([
        db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(eq(users.id, userId)),
        db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, managerId)),
      ]);
      if (!subject) return reply.code(404).send({ error: "User not found" });

      if (!notificationQueue) {
        return reply
          .code(503)
          .send({ error: "Notifications are not available right now" });
      }

      await notificationQueue.add("assessment_invite", {
        type: "assessment_invite",
        orgId,
        userId: subject.id,
        email: subject.email,
        userName: subject.name,
        managerName: manager?.name ?? "Your manager",
      });

      return reply.code(202).send({ invited: true });
    },
  );

  // PATCH /profiles/goals/:id — update goal status (manager+)
  app.patch(
    "/goals/:id",
    { preHandler: requireRole("manager") },
    async (request, reply) => {
      const { id } = parseBody(idParamSchema, request.params);
      const { db } = request.tenant;
      const body = parseBody(updateDevelopmentGoalSchema, request.body);

      const [goal] = await db
        .select()
        .from(profileDevelopmentGoals)
        .where(eq(profileDevelopmentGoals.id, id));

      if (!goal) {
        return reply.code(404).send({ error: "Goal not found" });
      }

      await assertContentAccess(request, goal.userId, { write: true });

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (body.status !== undefined) updates.status = body.status;
      if (body.notes !== undefined) updates.notes = body.notes;

      const [updated] = await db
        .update(profileDevelopmentGoals)
        .set(updates)
        .where(eq(profileDevelopmentGoals.id, id))
        .returning();

      // The row can vanish between the pre-fetch and the UPDATE (concurrent
      // delete); without this guard reply.send(undefined) would 200 with no body.
      if (!updated) {
        return reply.code(404).send({ error: "Goal not found" });
      }

      return reply.send(updated);
    },
  );

  // GET /profiles/me/goals — my development goals
  app.get("/me/goals", async (request, reply) => {
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);

    const goals = await db
      .select()
      .from(profileDevelopmentGoals)
      .where(eq(profileDevelopmentGoals.userId, userId))
      .orderBy(desc(profileDevelopmentGoals.createdAt));

    return reply.send({ data: goals });
  });
};
