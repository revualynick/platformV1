import type { FastifyPluginAsync } from "fastify";
import type { Queue } from "bullmq";
import { eq, desc, and, inArray } from "drizzle-orm";
import {
  selfReflections,
  conversationMessages,
  questionnaires,
  questionnaireThemes,
} from "@revualy/db";
import { AdapterRegistry } from "@revualy/chat-core";
import { requireAuth, getAuthenticatedUserId } from "../../lib/rbac.js";
import {
  parseBody,
  completeReflectionSchema,
  idParamSchema,
} from "../../lib/validation.js";
import {
  initiateConversation,
  type ConversationState,
} from "../../lib/conversation-orchestrator.js";
import {
  setConversationState,
} from "../../workers/index.js";
import { extractReflectionData } from "../../lib/reflection-extractor.js";

let analysisQueue: Queue | null = null;

export function setReflectionAnalysisQueue(queue: Queue) {
  analysisQueue = queue;
}

function getCurrentWeekMonday(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - diff);
  return monday.toISOString().slice(0, 10);
}

export const reflectionRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);

  // GET /reflections — List current user's reflections (sorted by week desc)
  app.get("/", async (request, reply) => {
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);

    const rows = await db
      .select()
      .from(selfReflections)
      .where(eq(selfReflections.userId, userId))
      .orderBy(desc(selfReflections.weekStarting))
      .limit(12);

    return reply.send({ data: rows });
  });

  // GET /reflections/stats — Get reflection stats for current user
  app.get("/stats", async (request, reply) => {
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);

    const rows = await db
      .select()
      .from(selfReflections)
      .where(
        and(
          eq(selfReflections.userId, userId),
          eq(selfReflections.status, "completed"),
        ),
      )
      .orderBy(desc(selfReflections.weekStarting));

    const totalCompleted = rows.length;

    const scoresWithValues = rows
      .map((r) => r.engagementScore)
      .filter((s): s is number => s !== null);
    const avgEngagementScore =
      scoresWithValues.length > 0
        ? Math.round(
            scoresWithValues.reduce((sum, s) => sum + s, 0) /
              scoresWithValues.length,
          )
        : null;

    // Current streak: count consecutive weeks from most recent
    let currentStreak = 0;
    if (rows.length > 0) {
      const currentWeek = getCurrentWeekMonday();
      let expectedMs = new Date(currentWeek).getTime();
      const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

      for (const row of rows) {
        const rowWeek = row.weekStarting;
        const expectedStr = new Date(expectedMs).toISOString().slice(0, 10);

        if (rowWeek === expectedStr) {
          currentStreak++;
          expectedMs -= WEEK_MS;
        } else if (currentStreak === 0) {
          const prevExpectedStr = new Date(expectedMs - WEEK_MS).toISOString().slice(0, 10);
          if (rowWeek === prevExpectedStr) {
            currentStreak++;
            expectedMs = expectedMs - 2 * WEEK_MS;
          } else {
            break;
          }
        } else {
          break;
        }
      }
    }

    // Top mood: most frequent mood across completed reflections
    const moodCounts: Record<string, number> = {};
    for (const row of rows) {
      if (row.mood) {
        moodCounts[row.mood] = (moodCounts[row.mood] || 0) + 1;
      }
    }
    const topMood =
      Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    return reply.send({
      totalCompleted,
      avgEngagementScore,
      currentStreak,
      topMood,
    });
  });

  // GET /reflections/:id — Get a single reflection
  app.get("/:id", async (request, reply) => {
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);
    const { id } = parseBody(idParamSchema, request.params);

    const [row] = await db
      .select()
      .from(selfReflections)
      .where(
        and(eq(selfReflections.id, id), eq(selfReflections.userId, userId)),
      );

    if (!row) {
      return reply.code(404).send({ error: "Not found" });
    }

    return reply.send(row);
  });

  // POST /reflections/start — Start a new self-reflection for current week
  app.post("/start", async (request, reply) => {
    const { db, orgId, userId } = request.tenant;
    if (!userId) return reply.code(401).send({ error: "Authentication required" });

    const weekStart = getCurrentWeekMonday();

    // Check if a reflection already exists for this week
    const [existing] = await db
      .select()
      .from(selfReflections)
      .where(
        and(
          eq(selfReflections.userId, userId),
          eq(selfReflections.weekStarting, weekStart),
        ),
      );

    if (existing && existing.status !== "pending") {
      return reply.code(409).send({
        error: "A reflection already exists for this week",
        reflectionId: existing.id,
        status: existing.status,
      });
    }

    // Find a self_reflection questionnaire with themes
    const allQuestionnaires = await db
      .select()
      .from(questionnaires)
      .where(
        and(
          eq(questionnaires.isActive, true),
          eq(questionnaires.category, "self_reflection"),
        ),
      );

    const qIds = allQuestionnaires.map((q) => q.id);
    const allThemes = qIds.length > 0
      ? await db.select().from(questionnaireThemes).where(inArray(questionnaireThemes.questionnaireId, qIds))
      : [];

    const themesByQId = new Map<string, (typeof allThemes)[number][]>();
    for (const t of allThemes) {
      const list = themesByQId.get(t.questionnaireId) ?? [];
      list.push(t);
      themesByQId.set(t.questionnaireId, list);
    }

    let selectedQuestionnaire = null;
    let promptTheme: string | null = null;
    for (const q of allQuestionnaires) {
      const qThemes = themesByQId.get(q.id);
      if (qThemes && qThemes.length > 0) {
        selectedQuestionnaire = q;
        promptTheme = qThemes[0].intent;
        break;
      }
    }

    if (!selectedQuestionnaire) {
      return reply.code(400).send({
        error: "No self-reflection questionnaire with themes found. An admin should create one.",
      });
    }

    // Use empty adapter registry so no messages go to chat platforms
    const emptyAdapters = new AdapterRegistry();

    if (!analysisQueue) {
      return reply.code(500).send({ error: "Analysis queue not initialized" });
    }

    // Claim the slot FIRST to prevent race conditions.
    // If existing row is in "pending" state, update it; otherwise insert.
    let claimedId: string;
    if (existing) {
      claimedId = existing.id;
    } else {
      const [claimed] = await db.insert(selfReflections).values({
        userId,
        weekStarting: weekStart,
        status: "pending",
        promptTheme,
      }).onConflictDoNothing({ target: [selfReflections.userId, selfReflections.weekStarting] }).returning();

      if (!claimed) {
        const [existing2] = await db.select().from(selfReflections).where(
          and(eq(selfReflections.userId, userId), eq(selfReflections.weekStarting, weekStart))
        );
        return reply.code(409).send({
          error: "A reflection already exists for this week",
          reflectionId: existing2?.id,
          status: existing2?.status,
        });
      }
      claimedId = claimed.id;
    }

    // Now safe to create the conversation -- we hold the slot
    const state: ConversationState = await initiateConversation(
      db,
      { llm: app.llm, adapters: emptyAdapters, analysisQueue },
      {
        orgId,
        reviewerId: userId,
        subjectId: userId,
        interactionType: "self_reflection",
        platform: "internal",
        channelId: "self-reflection",
        questionnaireId: selectedQuestionnaire.id,
      },
    );

    await setConversationState(state);

    // Update the claimed row with conversation details
    await db
      .update(selfReflections)
      .set({
        status: "in_progress",
        conversationId: state.conversationId,
        promptTheme,
      })
      .where(eq(selfReflections.id, claimedId));

    const openingMessage =
      state.messages[state.messages.length - 1]?.content ?? "";

    return reply.code(201).send({
      conversationId: state.conversationId,
      message: openingMessage,
      phase: state.phase,
      messageCount: state.messageCount,
      maxMessages: state.maxMessages,
    });
  });

  // POST /reflections/:id/complete — Complete a reflection
  app.post("/:id/complete", async (request, reply) => {
    const { db } = request.tenant;
    const userId = getAuthenticatedUserId(request);
    const { id } = parseBody(idParamSchema, request.params);
    const body = parseBody(completeReflectionSchema, request.body);

    const [row] = await db
      .select()
      .from(selfReflections)
      .where(
        and(eq(selfReflections.id, id), eq(selfReflections.userId, userId)),
      );

    if (!row) {
      return reply.code(404).send({ error: "Not found" });
    }

    if (row.status === "completed") {
      return reply.code(409).send({ error: "Reflection is already completed" });
    }

    // If we have a conversation, try to extract data from it
    let extracted: {
      highlights?: string;
      challenges?: string;
      goalForNextWeek?: string;
      engagementScore?: number;
    } = {};

    if (row.conversationId) {
      try {
        const messages = await db
          .select()
          .from(conversationMessages)
          .where(eq(conversationMessages.conversationId, row.conversationId))
          .orderBy(conversationMessages.createdAt);

        if (messages.length > 0) {
          const llmMessages = messages.map((m) => ({
            role: m.role,
            content: m.content,
          }));
          extracted = await extractReflectionData(app.llm, llmMessages);
        }
      } catch (err) {
        request.log.warn({ err, reflectionId: id }, "Reflection data extraction failed (best-effort)");
      }
    }

    const [updated] = await db
      .update(selfReflections)
      .set({
        status: "completed",
        mood: body.mood,
        highlights: body.highlights ?? extracted.highlights ?? null,
        challenges: body.challenges ?? extracted.challenges ?? null,
        goalForNextWeek: body.goalForNextWeek ?? extracted.goalForNextWeek ?? null,
        engagementScore: extracted.engagementScore ?? null,
        completedAt: new Date(),
      })
      .where(eq(selfReflections.id, id))
      .returning();

    return reply.send(updated);
  });
};
