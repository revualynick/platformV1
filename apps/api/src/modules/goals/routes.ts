import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type { GoalLevel } from "@revualy/shared";
import { eq, and, desc, inArray } from "drizzle-orm";
import {
  goals,
  goalCycles,
  goalUpdates,
  goalUpdateSuggestions,
  checkInMeetings,
  teams,
  users,
} from "@revualy/db";
import {
  getGoalCycles,
  getCurrentCycle,
  getGoalLadder,
  getMyGoals,
  getReportingTree,
} from "@revualy/db/queries";
import {
  parseBody,
  idParamSchema,
  createGoalCycleSchema,
  updateGoalCycleSchema,
  createGoalSchema,
  updateGoalSchema,
  createGoalUpdateSchema,
  goalListQuerySchema,
  goalLadderQuerySchema,
  applySuggestionSchema,
  suggestionListQuerySchema,
} from "../../lib/validation.js";
import { requireAuth, requireRole, getAuthenticatedUserId } from "../../lib/rbac.js";
import {
  canViewGoal,
  canManageGoal,
  isMeetingParticipant,
  canCreateGoal,
  type GoalPermissionContext,
  type Role,
} from "./permissions.js";

/** Parent level each child level must ladder to. */
const REQUIRED_PARENT_LEVEL: Record<string, string> = {
  team: "org",
  individual: "team",
};

async function buildPermissionContext(
  request: FastifyRequest,
): Promise<GoalPermissionContext> {
  const { db } = request.tenant;
  const userId = getAuthenticatedUserId(request);

  const [user] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) {
    throw Object.assign(new Error("User not found"), { statusCode: 401 });
  }
  const role = user.role as Role;

  // Employees manage no one — skip the org-wide lookups.
  if (role === "employee") {
    return {
      userId,
      role,
      ownedTeamIds: new Set(),
      reportingTree: new Set([userId]),
    };
  }

  const [ownedTeams, reportingTree] = await Promise.all([
    db.select({ id: teams.id }).from(teams).where(eq(teams.managerId, userId)),
    getReportingTree(db, userId),
  ]);

  return {
    userId,
    role,
    ownedTeamIds: new Set(ownedTeams.map((t) => t.id)),
    reportingTree,
  };
}

export const goalsRoutes: FastifyPluginAsync = async (app) => {
  // ── Cycles ───────────────────────────────────────────

  app.get("/cycles", { preHandler: requireAuth }, async (request, reply) => {
    const { db } = request.tenant;
    const [cycles, current] = await Promise.all([
      getGoalCycles(db),
      getCurrentCycle(db),
    ]);
    return reply.send({ data: cycles, currentCycleId: current?.id ?? null });
  });

  app.post(
    "/cycles",
    { preHandler: requireRole("admin") },
    async (request, reply) => {
      const { db } = request.tenant;
      const body = parseBody(createGoalCycleSchema, request.body);
      const [created] = await db.insert(goalCycles).values(body).returning();
      return reply.code(201).send(created);
    },
  );

  app.patch(
    "/cycles/:id",
    { preHandler: requireRole("admin") },
    async (request, reply) => {
      const { db } = request.tenant;
      const { id } = parseBody(idParamSchema, request.params);
      const body = parseBody(updateGoalCycleSchema, request.body);

      const updates: Record<string, unknown> = {};
      if (body.name !== undefined) updates.name = body.name;
      if (body.startDate !== undefined) updates.startDate = body.startDate;
      if (body.endDate !== undefined) updates.endDate = body.endDate;
      if (Object.keys(updates).length === 0) {
        return reply.code(400).send({ error: "No fields to update" });
      }

      const [updated] = await db
        .update(goalCycles)
        .set(updates)
        .where(eq(goalCycles.id, id))
        .returning();
      if (!updated) return reply.code(404).send({ error: "Cycle not found" });
      return reply.send(updated);
    },
  );

  // ── Goals ────────────────────────────────────────────

  app.get("/", { preHandler: requireAuth }, async (request, reply) => {
    const { db } = request.tenant;
    const query = parseBody(goalListQuerySchema, request.query);
    const ctx = await buildPermissionContext(request);

    const conditions = [];
    if (query.level) conditions.push(eq(goals.level, query.level));
    if (query.cycleId) conditions.push(eq(goals.cycleId, query.cycleId));
    if (query.teamId) conditions.push(eq(goals.teamId, query.teamId));
    if (query.ownerId) conditions.push(eq(goals.ownerId, query.ownerId));
    if (query.parentGoalId)
      conditions.push(eq(goals.parentGoalId, query.parentGoalId));

    // Fetch one extra row to signal whether another page exists.
    const rows = await db
      .select()
      .from(goals)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(goals.createdAt))
      .limit(query.limit + 1)
      .offset(query.offset);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;

    // Personal-goal privacy is enforced regardless of query params.
    const visible = page.filter((g) =>
      canViewGoal(ctx, { ...g, level: g.level as GoalLevel }),
    );
    return reply.send({ data: visible, hasMore, offset: query.offset });
  });

  app.get("/mine", { preHandler: requireAuth }, async (request, reply) => {
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);
    const query = parseBody(goalLadderQuerySchema, request.query);
    const data = await getMyGoals(db, userId, query.cycleId);
    return reply.send({ data });
  });

  app.get("/ladder", { preHandler: requireAuth }, async (request, reply) => {
    const { db } = request.tenant;
    const query = parseBody(goalLadderQuerySchema, request.query);

    let cycleId = query.cycleId;
    if (!cycleId) {
      const current = await getCurrentCycle(db);
      if (!current) return reply.send({ data: [], cycleId: null });
      cycleId = current.id;
    }

    const data = await getGoalLadder(db, cycleId);
    return reply.send({ data, cycleId });
  });

  app.get("/:id", { preHandler: requireAuth }, async (request, reply) => {
    const { db } = request.tenant;
    const { id } = parseBody(idParamSchema, request.params);
    const ctx = await buildPermissionContext(request);

    const [goal] = await db.select().from(goals).where(eq(goals.id, id));
    if (!goal || !canViewGoal(ctx, { ...goal, level: goal.level as GoalLevel })) {
      // 404 (not 403) so unshared personal goals aren't discoverable
      return reply.code(404).send({ error: "Goal not found" });
    }

    const [children, updates] = await Promise.all([
      db.select().from(goals).where(eq(goals.parentGoalId, id)),
      db
        .select()
        .from(goalUpdates)
        .where(eq(goalUpdates.goalId, id))
        .orderBy(desc(goalUpdates.createdAt))
        .limit(10),
    ]);

    return reply.send({ ...goal, children, updates });
  });

  app.post("/", { preHandler: requireAuth }, async (request, reply) => {
    const { db } = request.tenant;
    const body = parseBody(createGoalSchema, request.body);
    const ctx = await buildPermissionContext(request);

    let teamId = body.teamId ?? null;

    // Validate the ladder: parent must exist, be one level up, share the cycle.
    if (body.parentGoalId) {
      const [parent] = await db
        .select()
        .from(goals)
        .where(eq(goals.id, body.parentGoalId));
      if (!parent) {
        return reply.code(400).send({ error: "Parent goal not found" });
      }
      const requiredParent = REQUIRED_PARENT_LEVEL[body.level];
      if (parent.level !== requiredParent) {
        return reply.code(400).send({
          error: `A ${body.level} goal must ladder to a ${requiredParent} goal`,
        });
      }
      if (parent.cycleId !== body.cycleId) {
        return reply
          .code(400)
          .send({ error: "Parent goal belongs to a different cycle" });
      }
      // Individual goals inherit their team from the parent team goal.
      if (body.level === "individual") {
        teamId = parent.teamId;
      }
    }

    if (
      !canCreateGoal(ctx, {
        level: body.level,
        ownerId: body.ownerId,
        teamId,
        shareWithManager: body.shareWithManager,
      })
    ) {
      return reply.code(403).send({ error: "Insufficient permissions" });
    }

    const [created] = await db
      .insert(goals)
      .values({
        level: body.level,
        title: body.title,
        description: body.description,
        parentGoalId: body.parentGoalId ?? null,
        cycleId: body.cycleId ?? null,
        teamId,
        ownerId: body.ownerId,
        createdById: ctx.userId,
        status: body.status,
        progressPercent: body.progressPercent,
        metricName: body.metricName ?? null,
        metricStartValue: body.metricStartValue ?? null,
        metricTargetValue: body.metricTargetValue ?? null,
        metricCurrentValue: body.metricCurrentValue ?? null,
        shareWithManager: body.shareWithManager,
        targetDate: body.targetDate ?? null,
      })
      .returning();
    return reply.code(201).send(created);
  });

  app.patch("/:id", { preHandler: requireAuth }, async (request, reply) => {
    const { db } = request.tenant;
    const { id } = parseBody(idParamSchema, request.params);
    const body = parseBody(updateGoalSchema, request.body);
    const ctx = await buildPermissionContext(request);

    const [goal] = await db.select().from(goals).where(eq(goals.id, id));
    if (!goal || !canViewGoal(ctx, { ...goal, level: goal.level as GoalLevel })) {
      return reply.code(404).send({ error: "Goal not found" });
    }
    if (!canManageGoal(ctx, { ...goal, level: goal.level as GoalLevel })) {
      return reply.code(403).send({ error: "Insufficient permissions" });
    }

    // Re-laddering: validate the new parent like on create.
    if (body.parentGoalId !== undefined && body.parentGoalId !== null) {
      const requiredParent = REQUIRED_PARENT_LEVEL[goal.level];
      if (!requiredParent) {
        return reply
          .code(400)
          .send({ error: `${goal.level} goals cannot have a parent` });
      }
      const [parent] = await db
        .select()
        .from(goals)
        .where(eq(goals.id, body.parentGoalId));
      if (!parent || parent.level !== requiredParent) {
        return reply.code(400).send({
          error: `A ${goal.level} goal must ladder to a ${requiredParent} goal`,
        });
      }
      if (parent.cycleId !== goal.cycleId) {
        return reply
          .code(400)
          .send({ error: "Parent goal belongs to a different cycle" });
      }
    }
    if (body.parentGoalId === null && REQUIRED_PARENT_LEVEL[goal.level]) {
      return reply
        .code(400)
        .send({ error: `${goal.level} goals must keep a parent goal` });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.parentGoalId !== undefined) updates.parentGoalId = body.parentGoalId;
    if (body.status !== undefined) updates.status = body.status;
    if (body.progressPercent !== undefined)
      updates.progressPercent = body.progressPercent;
    if (body.metricName !== undefined) updates.metricName = body.metricName;
    if (body.metricStartValue !== undefined)
      updates.metricStartValue = body.metricStartValue;
    if (body.metricTargetValue !== undefined)
      updates.metricTargetValue = body.metricTargetValue;
    if (body.metricCurrentValue !== undefined)
      updates.metricCurrentValue = body.metricCurrentValue;
    if (body.shareWithManager !== undefined) {
      if (goal.level !== "personal") {
        return reply
          .code(400)
          .send({ error: "Only personal goals have manager sharing" });
      }
      updates.shareWithManager = body.shareWithManager;
    }
    if (body.targetDate !== undefined) updates.targetDate = body.targetDate;

    const [updated] = await db
      .update(goals)
      .set(updates)
      .where(eq(goals.id, id))
      .returning();
    return reply.send(updated);
  });

  // ── Check-ins ────────────────────────────────────────

  app.post(
    "/:id/updates",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { db } = request.tenant;
      const { id } = parseBody(idParamSchema, request.params);
      const body = parseBody(createGoalUpdateSchema, request.body);
      const ctx = await buildPermissionContext(request);

      const [goal] = await db.select().from(goals).where(eq(goals.id, id));
      if (!goal || !canViewGoal(ctx, { ...goal, level: goal.level as GoalLevel })) {
        return reply.code(404).send({ error: "Goal not found" });
      }
      if (!canManageGoal(ctx, { ...goal, level: goal.level as GoalLevel })) {
        return reply.code(403).send({ error: "Insufficient permissions" });
      }

      // Insert the check-in and apply it to the goal atomically —
      // a retry after a partial write must not duplicate either side.
      const { update, updatedGoal } = await db.transaction(async (tx) => {
        const [update] = await tx
          .insert(goalUpdates)
          .values({
            goalId: id,
            authorId: ctx.userId,
            progressPercent: body.progressPercent ?? null,
            metricCurrentValue: body.metricCurrentValue ?? null,
            status: body.status ?? null,
            note: body.note,
            source: "dashboard",
          })
          .returning();

        const goalChanges: Record<string, unknown> = { updatedAt: new Date() };
        if (body.progressPercent !== undefined)
          goalChanges.progressPercent = body.progressPercent;
        if (body.metricCurrentValue !== undefined)
          goalChanges.metricCurrentValue = body.metricCurrentValue;
        if (body.status !== undefined) goalChanges.status = body.status;

        const [updatedGoal] = await tx
          .update(goals)
          .set(goalChanges)
          .where(eq(goals.id, id))
          .returning();

        return { update, updatedGoal };
      });

      return reply.code(201).send({ update, goal: updatedGoal });
    },
  );

  app.get(
    "/:id/updates",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { db } = request.tenant;
      const { id } = parseBody(idParamSchema, request.params);
      const ctx = await buildPermissionContext(request);

      const [goal] = await db.select().from(goals).where(eq(goals.id, id));
      if (!goal || !canViewGoal(ctx, { ...goal, level: goal.level as GoalLevel })) {
        return reply.code(404).send({ error: "Goal not found" });
      }

      const updates = await db
        .select()
        .from(goalUpdates)
        .where(eq(goalUpdates.goalId, id))
        .orderBy(desc(goalUpdates.createdAt))
        .limit(100);
      return reply.send({ data: updates });
    },
  );

  app.delete("/:id", { preHandler: requireAuth }, async (request, reply) => {
    const { db } = request.tenant;
    const { id } = parseBody(idParamSchema, request.params);
    const ctx = await buildPermissionContext(request);

    const [goal] = await db.select().from(goals).where(eq(goals.id, id));
    if (!goal || !canViewGoal(ctx, { ...goal, level: goal.level as GoalLevel })) {
      return reply.code(404).send({ error: "Goal not found" });
    }
    if (!canManageGoal(ctx, { ...goal, level: goal.level as GoalLevel })) {
      return reply.code(403).send({ error: "Insufficient permissions" });
    }

    const [child] = await db
      .select({ id: goals.id })
      .from(goals)
      .where(eq(goals.parentGoalId, id))
      .limit(1);
    if (child) {
      return reply.code(400).send({
        error: "Goal has child goals — re-ladder or archive them first",
      });
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(goalUpdateSuggestions)
        .where(eq(goalUpdateSuggestions.goalId, id));
      await tx.delete(goalUpdates).where(eq(goalUpdates.goalId, id));
      await tx.delete(goals).where(eq(goals.id, id));
    });
    return reply.send({ id, deleted: true });
  });

  // ── Transcript suggestions (suggest + confirm) ───────

  // GET /suggestions — pending suggestions on goals the caller manages
  app.get("/suggestions", { preHandler: requireAuth }, async (request, reply) => {
    const { db } = request.tenant;
    const query = parseBody(suggestionListQuerySchema, request.query);
    const ctx = await buildPermissionContext(request);

    const rows = await db
      .select()
      .from(goalUpdateSuggestions)
      .where(eq(goalUpdateSuggestions.status, query.status ?? "pending"))
      .orderBy(desc(goalUpdateSuggestions.createdAt))
      .limit(200);
    if (rows.length === 0) return reply.send({ data: [] });

    const goalIds = [...new Set(rows.map((s) => s.goalId))];
    const goalRows = await db
      .select()
      .from(goals)
      .where(inArray(goals.id, goalIds));
    const goalMap = new Map(goalRows.map((g) => [g.id, g]));

    const meetingIds = [...new Set(rows.map((s) => s.meetingId))];
    const meetings = await db
      .select({
        id: checkInMeetings.id,
        title: checkInMeetings.title,
        eventStart: checkInMeetings.eventStart,
        organizerId: checkInMeetings.organizerId,
        subjectUserId: checkInMeetings.subjectUserId,
      })
      .from(checkInMeetings)
      .where(inArray(checkInMeetings.id, meetingIds));
    const meetingMap = new Map(meetings.map((m) => [m.id, m]));

    // Only suggestions from 1:1s the caller was in, on goals the caller can
    // manage (that is who may apply them). Personal-goal privacy rides
    // along: canManageGoal for personal goals is owner-only.
    const data = rows
      .filter((s) => {
        const goal = goalMap.get(s.goalId);
        const meeting = meetingMap.get(s.meetingId);
        return (
          goal &&
          meeting &&
          isMeetingParticipant(ctx, meeting) &&
          canManageGoal(ctx, { ...goal, level: goal.level as GoalLevel })
        );
      })
      .map((s) => ({
        ...s,
        goal: (() => {
          const g = goalMap.get(s.goalId)!;
          return {
            id: g.id,
            title: g.title,
            level: g.level,
            status: g.status,
            progressPercent: g.progressPercent,
            metricName: g.metricName,
            metricCurrentValue: g.metricCurrentValue,
            metricTargetValue: g.metricTargetValue,
          };
        })(),
        meeting: (() => {
          const m = meetingMap.get(s.meetingId)!;
          return { id: m.id, title: m.title, eventStart: m.eventStart };
        })(),
      }));

    return reply.send({ data });
  });

  // POST /suggestions/:id/apply — apply (optionally edited) values
  app.post(
    "/suggestions/:id/apply",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { db } = request.tenant;
      const { id } = parseBody(idParamSchema, request.params);
      const edits = parseBody(applySuggestionSchema, request.body ?? {});
      const ctx = await buildPermissionContext(request);

      const [suggestion] = await db
        .select()
        .from(goalUpdateSuggestions)
        .where(eq(goalUpdateSuggestions.id, id));
      if (!suggestion) {
        return reply.code(404).send({ error: "Suggestion not found" });
      }

      const [goal] = await db
        .select()
        .from(goals)
        .where(eq(goals.id, suggestion.goalId));
      const [meeting] = await db
        .select({ organizerId: checkInMeetings.organizerId, subjectUserId: checkInMeetings.subjectUserId })
        .from(checkInMeetings)
        .where(eq(checkInMeetings.id, suggestion.meetingId));
      if (
        !goal ||
        !meeting ||
        !isMeetingParticipant(ctx, meeting) ||
        !canManageGoal(ctx, { ...goal, level: goal.level as GoalLevel })
      ) {
        return reply.code(403).send({ error: "Insufficient permissions" });
      }

      if (suggestion.status !== "pending") {
        return reply
          .code(409)
          .send({ error: `Suggestion already ${suggestion.status}` });
      }

      // Edited values override the suggested ones
      const progressPercent =
        edits.progressPercent ?? suggestion.suggestedProgressPercent;
      const metricCurrentValue =
        edits.metricCurrentValue ?? suggestion.suggestedMetricCurrentValue;
      const status = edits.status ?? suggestion.suggestedStatus;
      const note = edits.note ?? suggestion.suggestedNote;

      // Apply is three writes (audit row, goal values, suggestion state)
      // that must land together — a retry mid-way would otherwise
      // duplicate the goal_updates row.
      const { reviewed, update, updatedGoal } = await db.transaction(
        async (tx) => {
          const [update] = await tx
            .insert(goalUpdates)
            .values({
              goalId: goal.id,
              authorId: ctx.userId,
              progressPercent,
              metricCurrentValue,
              status,
              note,
              source: "meet_transcript",
            })
            .returning();

          const goalChanges: Record<string, unknown> = { updatedAt: new Date() };
          if (progressPercent !== null)
            goalChanges.progressPercent = progressPercent;
          if (metricCurrentValue !== null)
            goalChanges.metricCurrentValue = metricCurrentValue;
          if (status !== null) goalChanges.status = status;

          const [updatedGoal] = await tx
            .update(goals)
            .set(goalChanges)
            .where(eq(goals.id, goal.id))
            .returning();

          const [reviewed] = await tx
            .update(goalUpdateSuggestions)
            .set({
              status: "applied",
              reviewedById: ctx.userId,
              reviewedAt: new Date(),
              appliedUpdateId: update.id,
            })
            .where(eq(goalUpdateSuggestions.id, id))
            .returning();

          return { reviewed, update, updatedGoal };
        },
      );

      return reply.send({ suggestion: reviewed, update, goal: updatedGoal });
    },
  );

  // POST /suggestions/:id/dismiss
  app.post(
    "/suggestions/:id/dismiss",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { db } = request.tenant;
      const { id } = parseBody(idParamSchema, request.params);
      const ctx = await buildPermissionContext(request);

      const [suggestion] = await db
        .select()
        .from(goalUpdateSuggestions)
        .where(eq(goalUpdateSuggestions.id, id));
      if (!suggestion) {
        return reply.code(404).send({ error: "Suggestion not found" });
      }

      const [goal] = await db
        .select()
        .from(goals)
        .where(eq(goals.id, suggestion.goalId));
      const [meeting] = await db
        .select({ organizerId: checkInMeetings.organizerId, subjectUserId: checkInMeetings.subjectUserId })
        .from(checkInMeetings)
        .where(eq(checkInMeetings.id, suggestion.meetingId));
      if (
        !goal ||
        !meeting ||
        !isMeetingParticipant(ctx, meeting) ||
        !canManageGoal(ctx, { ...goal, level: goal.level as GoalLevel })
      ) {
        return reply.code(403).send({ error: "Insufficient permissions" });
      }

      if (suggestion.status !== "pending") {
        return reply
          .code(409)
          .send({ error: `Suggestion already ${suggestion.status}` });
      }

      const [reviewed] = await db
        .update(goalUpdateSuggestions)
        .set({
          status: "dismissed",
          reviewedById: ctx.userId,
          reviewedAt: new Date(),
        })
        .where(eq(goalUpdateSuggestions.id, id))
        .returning();

      return reply.send({ suggestion: reviewed });
    },
  );
};
