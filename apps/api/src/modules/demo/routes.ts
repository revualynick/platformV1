import type { FastifyPluginAsync } from "fastify";
import type { Queue } from "bullmq";
import { eq, and, gte, sql } from "drizzle-orm";
import { z } from "zod";
import {
  questionnaires,
  questionnaireThemes,
  users,
  leads,
} from "@revualy/db";
import { AdapterRegistry } from "@revualy/chat-core";
import type { InteractionType } from "@revualy/shared";
import {
  initiateConversation,
  handleReply,
} from "../../lib/conversation-orchestrator.js";
import {
  getConversationState,
  setConversationState,
  deleteConversationState,
} from "../../workers/index.js";
import { requireAuth } from "../../lib/rbac.js";
import { parseBody, leadCaptureSchema } from "../../lib/validation.js";

const DEMO_MODE = process.env.DEMO_MODE === "true";
const MAX_DEMO_CONVERSATIONS_PER_DAY = 3;

// Lazy-initialized analysis queue (set by server startup)
let analysisQueue: Queue | null = null;

export function setDemoAnalysisQueue(queue: Queue) {
  analysisQueue = queue;
}

const replySchema = z.object({
  message: z.string().min(1).max(5000),
});

export const demoRoutes: FastifyPluginAsync = async (app) => {
  /**
   * POST /lead — Capture a lead email (demo mode only).
   * Returns the lead record. Rate-limited by email.
   */
  if (DEMO_MODE) {
    app.post("/lead", async (request, reply) => {
      const { db } = request.tenant;
      const body = parseBody(leadCaptureSchema, request.body);

      // Upsert lead record
      const [existing] = await db
        .select()
        .from(leads)
        .where(eq(leads.email, body.email));

      if (existing) {
        return reply.send({
          id: existing.id,
          email: existing.email,
          name: existing.name,
          conversationsRemaining: Math.max(
            0,
            MAX_DEMO_CONVERSATIONS_PER_DAY - dailyCount(existing),
          ),
        });
      }

      const [lead] = await db
        .insert(leads)
        .values({ email: body.email, name: body.name ?? null })
        .returning();

      return reply.send({
        id: lead.id,
        email: lead.email,
        name: lead.name,
        conversationsRemaining: MAX_DEMO_CONVERSATIONS_PER_DAY,
      });
    });
  }

  /**
   * POST /start
   * Start a demo conversation using a real questionnaire and LLM.
   * Uses an empty AdapterRegistry so no messages leak to any chat platform.
   *
   * In DEMO_MODE: requires x-demo-email header (lead-gated, no auth).
   * Otherwise: requires auth.
   */
  app.post(
    "/start",
    { preHandler: DEMO_MODE ? undefined : requireAuth },
    async (request, reply) => {
      const { db, orgId } = request.tenant;

      let userId: string | null = request.tenant.userId;

      // In demo mode, use lead email instead of auth
      if (DEMO_MODE) {
        const demoEmail = request.headers["x-demo-email"] as
          | string
          | undefined;
        if (!demoEmail) {
          return reply
            .code(400)
            .send({ error: "x-demo-email header required for demo mode" });
        }

        // Check lead exists and rate limit
        const [lead] = await db
          .select()
          .from(leads)
          .where(eq(leads.email, demoEmail));

        if (!lead) {
          return reply
            .code(403)
            .send({ error: "Please register your email first via /lead" });
        }

        if (dailyCount(lead) >= MAX_DEMO_CONVERSATIONS_PER_DAY) {
          return reply.code(429).send({
            error: `Rate limit: max ${MAX_DEMO_CONVERSATIONS_PER_DAY} demo conversations per day`,
          });
        }

        // Increment conversation count
        await db
          .update(leads)
          .set({
            conversationCount: sql`${leads.conversationCount} + 1`,
            lastConversationAt: new Date(),
          })
          .where(eq(leads.id, lead.id));

        // Use first active user as the demo reviewer
        const [demoUser] = await db
          .select()
          .from(users)
          .where(eq(users.isActive, true))
          .limit(1);

        userId = demoUser?.id ?? null;
      }

      if (!userId) {
        return reply
          .code(401)
          .send({ error: "Authentication required" });
      }

      if (!analysisQueue) {
        return reply
          .code(500)
          .send({ error: "Analysis queue not initialized" });
      }

      // Find first active questionnaire that has themes
      const allQuestionnaires = await db
        .select()
        .from(questionnaires)
        .where(eq(questionnaires.isActive, true));

      let selectedQuestionnaire = null;
      for (const q of allQuestionnaires) {
        const qThemes = await db
          .select()
          .from(questionnaireThemes)
          .where(eq(questionnaireThemes.questionnaireId, q.id));

        if (qThemes.length > 0) {
          selectedQuestionnaire = q;
          break;
        }
      }

      if (!selectedQuestionnaire) {
        return reply.code(400).send({
          error:
            "No questionnaires with themes found. Create one first via Admin > Questionnaires.",
        });
      }

      // Use current user as reviewer, first other user as subject
      const allUsers = await db
        .select()
        .from(users)
        .where(eq(users.isActive, true));

      const subject = allUsers.find((u) => u.id !== userId) ?? allUsers[0];
      if (!subject) {
        return reply
          .code(400)
          .send({ error: "No users found in organization" });
      }

      // Empty AdapterRegistry — sendMessage in orchestrator checks has() and returns early
      const emptyAdapters = new AdapterRegistry();

      const state = await initiateConversation(
        db,
        { llm: app.llm, adapters: emptyAdapters, analysisQueue },
        {
          orgId,
          reviewerId: userId,
          subjectId: subject.id,
          interactionType: selectedQuestionnaire.category as InteractionType,
          platform: "slack", // dummy — adapter not registered, sends are no-op
          channelId: "demo",
          questionnaireId: selectedQuestionnaire.id,
        },
      );

      await setConversationState(state);

      return {
        conversationId: state.conversationId,
        message: state.messages[state.messages.length - 1]?.content ?? "",
        phase: state.phase,
        messageCount: state.messageCount,
        maxMessages: state.maxMessages,
        interactionType: state.interactionType,
      };
    },
  );

  /**
   * POST /:conversationId/reply
   * Send a reply in a demo conversation. LLM generates the next question.
   *
   * In DEMO_MODE: no auth required (conversation state has ownership).
   * Otherwise: requires auth.
   */
  app.post(
    "/:conversationId/reply",
    { preHandler: DEMO_MODE ? undefined : requireAuth },
    async (request, reply) => {
      const { db } = request.tenant;
      const { conversationId } = request.params as {
        conversationId: string;
      };
      const { message } = parseBody(replySchema, request.body);

      if (!analysisQueue) {
        return reply
          .code(500)
          .send({ error: "Analysis queue not initialized" });
      }

      const state = await getConversationState(conversationId);
      if (!state) {
        return reply
          .code(404)
          .send({ error: "Conversation not found or expired" });
      }

      // Ownership check: only the conversation's reviewer can reply
      // In demo mode, skip check (no authenticated user to compare)
      if (!DEMO_MODE) {
        const callerId = request.tenant.userId;
        if (state.reviewerId !== callerId) {
          return reply.code(403).send({ error: "Forbidden" });
        }
      }

      const emptyAdapters = new AdapterRegistry();

      const result = await handleReply(
        db,
        { llm: app.llm, adapters: emptyAdapters, analysisQueue },
        state,
        message,
      );

      if (result.closed) {
        await deleteConversationState(conversationId);
      } else {
        await setConversationState(result.state);
      }

      // Return the last assistant message
      const lastAssistantMsg = result.state.messages
        .filter((m) => m.role === "assistant")
        .pop();

      return {
        message: lastAssistantMsg?.content ?? "",
        closed: result.closed,
        phase: result.state.phase,
        messageCount: result.state.messageCount,
        maxMessages: result.state.maxMessages,
      };
    },
  );
};

/** Count conversations today for a lead (simple check using lastConversationAt) */
function dailyCount(lead: {
  conversationCount: number;
  lastConversationAt: Date | null;
}): number {
  if (!lead.lastConversationAt) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (lead.lastConversationAt < today) return 0; // Last conversation was before today — reset
  return lead.conversationCount;
}
