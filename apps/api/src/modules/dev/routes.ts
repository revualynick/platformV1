import type { FastifyPluginAsync } from "fastify";
import { eq, and, ne } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { users, questionnaires, questionnaireThemes } from "@revualy/db";
import type { LLMGateway } from "@revualy/ai-core";
import type { AdapterRegistry } from "@revualy/chat-core";
import type { Queue } from "bullmq";
import type { InteractionType } from "@revualy/shared";
import {
  initiateConversation,
  handleReply,
} from "../../lib/conversation-orchestrator.js";
import {
  getConversationState,
  setConversationState,
} from "../../workers/index.js";
import type { InternalSimulatorAdapter } from "../../lib/internal-simulator-adapter.js";

/**
 * Dev-only chat-simulation harness.
 *
 * Drives the real conversation orchestrator (LLM question generation, theme
 * progression, close logic) end-to-end in-process, using the "internal"
 * simulator adapter to capture the bot's replies. Lets `claude -p` (or curl)
 * play the employee side of a feedback conversation locally — no Slack/Teams.
 *
 * Gated exactly like the web test-login endpoint: TEST_LOGIN_ENABLED must be
 * "true" AND the caller must present the matching TEST_LOGIN_KEY. So even if
 * the flag is left on in production, it is inert without the (random) key.
 */

interface SimulatorDeps {
  llm: LLMGateway;
  adapters: AdapterRegistry;
  analysisQueue: Queue;
  simulator: InternalSimulatorAdapter;
}

let deps: SimulatorDeps | null = null;
export function setSimulatorDeps(d: SimulatorDeps) {
  deps = d;
}

function keyOk(provided: string | undefined): boolean {
  const expected = process.env.TEST_LOGIN_KEY;
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const devRoutes: FastifyPluginAsync = async (app) => {
  // Whole plugin is inert unless explicitly enabled.
  if (process.env.TEST_LOGIN_ENABLED !== "true") {
    return;
  }

  app.addHook("preHandler", async (request, reply) => {
    const provided =
      (request.headers["x-test-login-key"] as string | undefined) ??
      (request.query as { key?: string })?.key;
    if (!keyOk(provided)) {
      return reply.code(403).send({ error: "Forbidden" });
    }
  });

  /**
   * POST /dev/simulate-chat
   * body: {
   *   email: string,                // the reviewer (person chatting)
   *   message?: string,             // omit to START a conversation; include to REPLY
   *   conversationId?: string,      // required when replying
   *   interactionType?: InteractionType, // default "self_reflection"
   *   subjectEmail?: string,        // for peer_review/three_sixty; defaults to a peer
   * }
   * returns: { conversationId, reply, closed, messageCount }
   */
  app.post("/simulate-chat", async (request, reply) => {
    if (!deps) {
      return reply.code(503).send({ error: "Simulator not initialised" });
    }
    const { db, orgId } = request.tenant;
    const body = (request.body ?? {}) as {
      email?: string;
      message?: string;
      conversationId?: string;
      interactionType?: InteractionType;
      subjectEmail?: string;
    };

    if (!body.email) {
      return reply.code(400).send({ error: "email is required" });
    }

    const [reviewer] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, body.email));
    if (!reviewer) {
      return reply
        .code(404)
        .send({ error: `No user with email ${body.email}` });
    }

    const channelId = `sim:${reviewer.id}`;

    try {
      // ── Continue an existing conversation ──────────────────
      if (body.conversationId) {
        if (!body.message) {
          return reply
            .code(400)
            .send({ error: "message is required when conversationId is set" });
        }
        const state = await getConversationState(body.conversationId);
        if (!state) {
          return reply
            .code(404)
            .send({ error: "No active conversation state (it may have closed)" });
        }
        deps.simulator.clear(state.channelId);
        const { state: next, closed } = await handleReply(
          db,
          deps,
          state,
          body.message,
        );
        if (!closed) await setConversationState(next);
        return reply.send({
          conversationId: next.conversationId,
          reply: deps.simulator.drain(next.channelId).join("\n\n"),
          closed,
          messageCount: next.messageCount,
        });
      }

      // ── Start a new conversation ───────────────────────────
      const interactionType: InteractionType =
        body.interactionType ?? "self_reflection";

      // Resolve the subject.
      let subjectId = reviewer.id; // self_reflection: reviewer reviews themselves
      if (interactionType !== "self_reflection") {
        if (body.subjectEmail) {
          const [s] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.email, body.subjectEmail));
          if (!s) {
            return reply
              .code(404)
              .send({ error: `No subject with email ${body.subjectEmail}` });
          }
          subjectId = s.id;
        } else {
          const [peer] = await db
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.isActive, true), ne(users.id, reviewer.id)));
          if (!peer) {
            return reply
              .code(400)
              .send({ error: "No peer available; pass subjectEmail" });
          }
          subjectId = peer.id;
        }
      }

      // Pick a questionnaire that actually has themes.
      const qs = await db.select().from(questionnaires).limit(20);
      let questionnaireId: string | null = null;
      for (const q of qs) {
        const [theme] = await db
          .select({ id: questionnaireThemes.id })
          .from(questionnaireThemes)
          .where(eq(questionnaireThemes.questionnaireId, q.id))
          .limit(1);
        if (theme) {
          questionnaireId = q.id;
          break;
        }
      }
      if (!questionnaireId) {
        return reply
          .code(400)
          .send({ error: "No questionnaire with themes is seeded" });
      }

      deps.simulator.clear(channelId);
      const state = await initiateConversation(db, deps, {
        orgId,
        reviewerId: reviewer.id,
        subjectId,
        interactionType,
        platform: "internal",
        channelId,
        questionnaireId,
      });
      await setConversationState(state);

      return reply.send({
        conversationId: state.conversationId,
        reply: deps.simulator.drain(channelId).join("\n\n"),
        closed: false,
        messageCount: state.messageCount,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "simulation failed";
      // Most common local cause: no LLM API key configured.
      request.log.error({ err }, "simulate-chat failed");
      return reply.code(500).send({
        error: msg,
        hint: /api ?key|apikey|401|unauthor|authentication method|authToken/i.test(msg)
          ? "Set ANTHROPIC_API_KEY (or LLM_API_KEY) in .env — the bot needs the LLM to generate turns."
          : undefined,
      });
    }
  });
};
