import type { FastifyPluginAsync } from "fastify";
import { eq, and, asc } from "drizzle-orm";
import {
  assessmentQuestions,
  assessmentSessions,
  profileSnapshots,
} from "@revualy/db";
import {
  parseBody,
  idParamSchema,
  frameworkParamSchema,
  startSessionSchema,
  submitSessionSchema,
} from "../../lib/validation.js";
import { requireAuth, getAuthenticatedUserId } from "../../lib/rbac.js";
import { scoreAssessment } from "../../lib/profile-scorer.js";
import type { ProfilingFramework } from "@revualy/shared";

export const assessmentRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);

  // GET /assessments/frameworks — list available frameworks with question counts
  app.get("/frameworks", async (request, reply) => {
    const { db } = request.tenant;

    const questions = await db
      .select({
        framework: assessmentQuestions.framework,
        id: assessmentQuestions.id,
      })
      .from(assessmentQuestions)
      .where(eq(assessmentQuestions.isActive, true));

    const counts: Record<string, number> = {};
    for (const q of questions) {
      counts[q.framework] = (counts[q.framework] ?? 0) + 1;
    }

    const frameworks = Object.entries(counts).map(([framework, questionCount]) => ({
      framework,
      questionCount,
    }));

    return reply.send({ data: frameworks });
  });

  // GET /assessments/frameworks/:framework/questions — get quiz questions
  app.get("/frameworks/:framework/questions", async (request, reply) => {
    const { framework } = parseBody(frameworkParamSchema, request.params);
    const { db } = request.tenant;

    const questions = await db
      .select()
      .from(assessmentQuestions)
      .where(
        and(
          eq(assessmentQuestions.framework, framework),
          eq(assessmentQuestions.isActive, true),
        ),
      )
      .orderBy(asc(assessmentQuestions.sortOrder));

    // Strip scores from options — client shouldn't see scoring weights
    const sanitized = questions.map((q) => ({
      id: q.id,
      framework: q.framework,
      questionType: q.questionType,
      text: q.text,
      options: (q.options as Array<{ key: string; text: string; scores: Record<string, number> }>).map(
        ({ key, text }) => ({ key, text }),
      ),
      sortOrder: q.sortOrder,
    }));

    return reply.send({ data: sanitized });
  });

  // POST /assessments/sessions — start a new assessment session
  app.post("/sessions", async (request, reply) => {
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);
    const body = parseBody(startSessionSchema, request.body);

    const [session] = await db
      .insert(assessmentSessions)
      .values({
        userId,
        framework: body.framework,
        context: body.context ?? "onboarding",
      })
      .returning();

    return reply.code(201).send(session);
  });

  // PUT /assessments/sessions/:id — submit responses and complete session
  app.put("/sessions/:id", async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);
    const body = parseBody(submitSessionSchema, request.body);

    // Fetch the session
    const [session] = await db
      .select()
      .from(assessmentSessions)
      .where(and(eq(assessmentSessions.id, id), eq(assessmentSessions.userId, userId)));

    if (!session) {
      return reply.code(404).send({ error: "Session not found" });
    }

    if (session.completedAt) {
      return reply.code(400).send({ error: "Session already completed" });
    }

    // Fetch questions for this framework to validate + score
    const questions = await db
      .select()
      .from(assessmentQuestions)
      .where(
        and(
          eq(assessmentQuestions.framework, session.framework),
          eq(assessmentQuestions.isActive, true),
        ),
      );

    // Validate all response questionIds exist
    const questionIds = new Set(questions.map((q) => q.id));
    for (const qId of Object.keys(body.responses)) {
      if (!questionIds.has(qId)) {
        return reply.code(400).send({ error: `Unknown question ID: ${qId}` });
      }
    }

    // Score the assessment
    const dimensions = scoreAssessment(
      session.framework as ProfilingFramework,
      questions.map((q) => ({
        id: q.id,
        framework: q.framework,
        options: q.options as Array<{ key: string; text: string; scores: Record<string, number> }>,
      })),
      body.responses,
    );

    // Update session + create profile snapshot atomically
    const result = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(assessmentSessions)
        .set({
          responses: body.responses,
          completedAt: new Date(),
        })
        .where(eq(assessmentSessions.id, id))
        .returning();

      const [snapshot] = await tx
        .insert(profileSnapshots)
        .values({
          userId,
          framework: session.framework,
          source: "assessment",
          sessionId: id,
          dimensions: dimensions as unknown as Record<string, number>,
          signalCount: Object.keys(body.responses).length,
        })
        .returning();

      return { session: updated, profile: snapshot };
    });

    return reply.send(result);
  });

  // GET /assessments/sessions — list user's past sessions
  app.get("/sessions", async (request, reply) => {
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);

    const sessions = await db
      .select()
      .from(assessmentSessions)
      .where(eq(assessmentSessions.userId, userId))
      .orderBy(asc(assessmentSessions.startedAt))
      .limit(50);

    return reply.send({ data: sessions });
  });

  // GET /assessments/sessions/:id — get a single session detail
  app.get("/sessions/:id", async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);

    const [session] = await db
      .select()
      .from(assessmentSessions)
      .where(and(eq(assessmentSessions.id, id), eq(assessmentSessions.userId, userId)));

    if (!session) {
      return reply.code(404).send({ error: "Session not found" });
    }

    return reply.send(session);
  });
};
