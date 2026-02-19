import type { FastifyPluginAsync } from "fastify";
import { eq, and, desc } from "drizzle-orm";
import {
  threeSixtyReviews,
  threeSixtyResponses,
  users,
} from "@revualy/db";
import { requireAuth, requireRole, getAuthenticatedUserId } from "../../lib/rbac.js";
import {
  parseBody,
  idParamSchema,
  createThreeSixtySchema,
  updateThreeSixtyResponseSchema,
  threeSixtyCompleteSchema,
} from "../../lib/validation.js";
import { aggregateThreeSixtyReview } from "../../lib/three-sixty-aggregator.js";

const reviewIdParamSchema = idParamSchema;
const responseIdParamSchema = idParamSchema;

export const threeSixtyRoutes: FastifyPluginAsync = async (app) => {
  // POST / — Initiate a 360 review (admin only)
  app.post("/", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);
    const body = parseBody(createThreeSixtySchema, request.body);

    // Verify the subject exists and is a manager
    const [subject] = await db
      .select({ id: users.id, role: users.role, name: users.name })
      .from(users)
      .where(eq(users.id, body.subjectId));

    if (!subject) {
      return reply.code(404).send({ error: "Subject user not found" });
    }

    // Verify all reviewers exist
    for (const reviewerId of body.reviewerIds) {
      const [reviewer] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, reviewerId));

      if (!reviewer) {
        return reply.code(400).send({ error: `Reviewer ${reviewerId} not found` });
      }
    }

    // Subject cannot be one of the reviewers
    if (body.reviewerIds.includes(body.subjectId)) {
      return reply.code(400).send({ error: "Subject cannot be a reviewer of themselves" });
    }

    const result = await db.transaction(async (tx) => {
      const [review] = await tx
        .insert(threeSixtyReviews)
        .values({
          subjectId: body.subjectId,
          initiatedById: userId,
          targetReviewerCount: body.reviewerIds.length,
        })
        .returning();

      // Create response entries for each reviewer
      for (const reviewerId of body.reviewerIds) {
        await tx.insert(threeSixtyResponses).values({
          reviewId: review.id,
          reviewerId,
        });
      }

      return review;
    });

    return reply.code(201).send(result);
  });

  // GET / — List all 360 reviews (admin only)
  app.get("/", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { db } = request.tenant;

    const rows = await db
      .select({
        review: threeSixtyReviews,
        subjectName: users.name,
      })
      .from(threeSixtyReviews)
      .leftJoin(users, eq(threeSixtyReviews.subjectId, users.id))
      .orderBy(desc(threeSixtyReviews.createdAt))
      .limit(100);

    const data = rows.map((r) => ({
      ...r.review,
      subjectName: r.subjectName,
    }));

    return reply.send({ data });
  });

  // GET /my-pending — List pending 360 reviews where current user is a reviewer
  app.get("/my-pending", { preHandler: requireAuth }, async (request, reply) => {
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);

    const rows = await db
      .select({
        response: threeSixtyResponses,
        review: threeSixtyReviews,
        subjectName: users.name,
      })
      .from(threeSixtyResponses)
      .innerJoin(
        threeSixtyReviews,
        eq(threeSixtyResponses.reviewId, threeSixtyReviews.id),
      )
      .leftJoin(users, eq(threeSixtyReviews.subjectId, users.id))
      .where(
        and(
          eq(threeSixtyResponses.reviewerId, userId),
          eq(threeSixtyResponses.status, "pending"),
          eq(threeSixtyReviews.status, "collecting"),
        ),
      )
      .orderBy(desc(threeSixtyResponses.invitedAt));

    const data = rows.map((r) => ({
      responseId: r.response.id,
      reviewId: r.review.id,
      subjectId: r.review.subjectId,
      subjectName: r.subjectName,
      status: r.response.status,
      invitedAt: r.response.invitedAt,
    }));

    return reply.send({ data });
  });

  // GET /:id — Get review detail with aggregated results (admin only)
  app.get("/:id", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { id } = parseBody(reviewIdParamSchema, request.params);
    const { db } = request.tenant;

    const [review] = await db
      .select()
      .from(threeSixtyReviews)
      .where(eq(threeSixtyReviews.id, id));

    if (!review) {
      return reply.code(404).send({ error: "360 review not found" });
    }

    // Get subject name
    const [subject] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, review.subjectId));

    // Get all responses with reviewer names
    const responses = await db
      .select({
        response: threeSixtyResponses,
        reviewerName: users.name,
      })
      .from(threeSixtyResponses)
      .leftJoin(users, eq(threeSixtyResponses.reviewerId, users.id))
      .where(eq(threeSixtyResponses.reviewId, id))
      .orderBy(threeSixtyResponses.invitedAt);

    const completedCount = responses.filter(
      (r) => r.response.status === "completed",
    ).length;

    return reply.send({
      ...review,
      subjectName: subject?.name ?? null,
      completedReviewerCount: completedCount,
      responses: responses.map((r) => ({
        ...r.response,
        reviewerName: r.reviewerName,
      })),
    });
  });

  // POST /:id/complete — Mark review as complete + run aggregation (admin only)
  app.post(
    "/:id/complete",
    { preHandler: requireRole("admin") },
    async (request, reply) => {
      const { id } = parseBody(reviewIdParamSchema, request.params);
      const { db } = request.tenant;
      const body = parseBody(threeSixtyCompleteSchema, request.body ?? {});

      const [review] = await db
        .select()
        .from(threeSixtyReviews)
        .where(eq(threeSixtyReviews.id, id));

      if (!review) {
        return reply.code(404).send({ error: "360 review not found" });
      }

      if (review.status === "completed") {
        return reply.code(400).send({ error: "Review is already completed" });
      }

      if (review.status === "cancelled") {
        return reply.code(400).send({ error: "Review has been cancelled" });
      }

      // Check all responses are completed (unless force override)
      const responses = await db
        .select()
        .from(threeSixtyResponses)
        .where(eq(threeSixtyResponses.reviewId, id));

      const pendingResponses = responses.filter(
        (r) => r.status === "pending" || r.status === "in_progress",
      );

      if (pendingResponses.length > 0 && !body.force) {
        return reply.code(400).send({
          error: `${pendingResponses.length} response(s) still pending. Use { "force": true } to override.`,
        });
      }

      // Set status to analyzing while we aggregate
      await db
        .update(threeSixtyReviews)
        .set({ status: "analyzing", updatedAt: new Date() })
        .where(eq(threeSixtyReviews.id, id));

      // Run aggregation
      const aggregation = await aggregateThreeSixtyReview(db, id);

      const completedCount = responses.filter(
        (r) => r.status === "completed",
      ).length;

      // Update review with aggregated data
      const [updated] = await db
        .update(threeSixtyReviews)
        .set({
          status: "completed",
          aggregatedData: aggregation,
          completedReviewerCount: completedCount,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(threeSixtyReviews.id, id))
        .returning();

      return reply.send(updated);
    },
  );

  // PATCH /responses/:id — Update response status (for tracking)
  app.patch(
    "/responses/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = parseBody(responseIdParamSchema, request.params);
      const { db } = request.tenant;
      const userId = getAuthenticatedUserId(request);
      const body = parseBody(updateThreeSixtyResponseSchema, request.body);

      // Verify the response exists and belongs to the current user
      const [response] = await db
        .select()
        .from(threeSixtyResponses)
        .where(eq(threeSixtyResponses.id, id));

      if (!response) {
        return reply.code(404).send({ error: "Response not found" });
      }

      if (response.reviewerId !== userId) {
        // Check if admin
        const [user] = await db
          .select({ role: users.role })
          .from(users)
          .where(eq(users.id, userId));
        if (!user || user.role !== "admin") {
          return reply.code(403).send({ error: "Insufficient permissions" });
        }
      }

      const updates: Record<string, unknown> = { status: body.status };
      if (body.status === "completed") {
        updates.completedAt = new Date();
      }

      const [updated] = await db
        .update(threeSixtyResponses)
        .set(updates)
        .where(eq(threeSixtyResponses.id, id))
        .returning();

      // Update the review's completed count
      if (body.status === "completed") {
        const completedResponses = await db
          .select()
          .from(threeSixtyResponses)
          .where(
            and(
              eq(threeSixtyResponses.reviewId, response.reviewId),
              eq(threeSixtyResponses.status, "completed"),
            ),
          );

        await db
          .update(threeSixtyReviews)
          .set({
            completedReviewerCount: completedResponses.length,
            updatedAt: new Date(),
          })
          .where(eq(threeSixtyReviews.id, response.reviewId));
      }

      return reply.send(updated);
    },
  );
};
