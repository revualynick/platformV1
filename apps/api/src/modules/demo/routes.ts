import type { FastifyPluginAsync } from "fastify";
import type { Queue } from "bullmq";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { questionnaires, questionnaireThemes, users } from "@revualy/db";
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
import { parseBody } from "../../lib/validation.js";

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
   * POST /start
   * Start a demo conversation using a real questionnaire and LLM.
   * Uses an empty AdapterRegistry so no messages leak to any chat platform.
   */
  app.post("/start", { preHandler: requireAuth }, async (request, reply) => {
    const { db, orgId, userId } = request.tenant;
    if (!userId) return reply.code(401).send({ error: "Authentication required" });
    if (!analysisQueue) return reply.code(500).send({ error: "Analysis queue not initialized" });

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
        error: "No questionnaires with themes found. Create one first via Admin > Questionnaires.",
      });
    }

    // Use current user as reviewer, first other user as subject
    const allUsers = await db
      .select()
      .from(users)
      .where(eq(users.isActive, true));

    const subject = allUsers.find((u) => u.id !== userId) ?? allUsers[0];
    if (!subject) {
      return reply.code(400).send({ error: "No users found in organization" });
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
  });

  /**
   * POST /:conversationId/reply
   * Send a reply in a demo conversation. LLM generates the next question.
   */
  app.post(
    "/:conversationId/reply",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { db } = request.tenant;
      const { conversationId } = request.params as { conversationId: string };
      const { message } = parseBody(replySchema, request.body);

      if (!analysisQueue) {
        return reply.code(500).send({ error: "Analysis queue not initialized" });
      }

      const state = await getConversationState(conversationId);
      if (!state) {
        return reply.code(404).send({ error: "Conversation not found or expired" });
      }

      // Ownership check: only the conversation's reviewer can reply
      const callerId = request.tenant.userId;
      if (state.reviewerId !== callerId) {
        return reply.code(403).send({ error: "Forbidden" });
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
