import type { FastifyPluginAsync } from "fastify";
import { eq, and, ne } from "drizzle-orm";
import crypto, { timingSafeEqual } from "node:crypto";
import {
  users,
  questionnaires,
  questionnaireThemes,
  inboundMessages,
  userPlatformIdentities,
} from "@revualy/db";
import type { LLMGateway } from "@revualy/ai-core";
import type { AdapterRegistry } from "@revualy/chat-core";
import type { Queue } from "bullmq";
import type { InteractionType } from "@revualy/shared";
import {
  initiateConversation,
  getConversationView,
  processTurn,
} from "../../lib/conversation-orchestrator.js";
import { handleInbound } from "../../lib/inbound-router.js";
import type { InternalSimulatorAdapter } from "../../lib/internal-simulator-adapter.js";

/**
 * Dev-only chat-simulation harness.
 *
 * Drives the real conversation engine end-to-end in-process, using the
 * "internal" simulator adapter to capture the bot's replies. Replies go
 * through the same path as a chat webhook (stored in inbound_messages, then
 * routed by the sender's identity), so routing bugs are not hidden; only
 * the queue hop is skipped, so the turn runs within the request. Lets `claude -p` (or curl)
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
   *                                 // (routed like a real DM, by sender)
   *   interactionType?: InteractionType, // default "self_reflection"
   *   subjectEmail?: string,        // for peer_review/three_sixty; defaults to a peer
   * }
   * returns: { conversationId, reply, closed, messageCount, outcome? }
   */
  app.post("/simulate-chat", async (request, reply) => {
    if (!deps) {
      return reply.code(503).send({ error: "Simulator not initialised" });
    }
    const { db, orgId } = request.tenant;
    const body = (request.body ?? {}) as {
      email?: string;
      message?: string;
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
    // The simulated chat account, linked and confirmed like a real one.
    await db
      .insert(userPlatformIdentities)
      .values({
        userId: reviewer.id,
        platform: "internal",
        platformUserId: channelId,
        dmAddress: channelId,
        status: "reachable",
        linkSource: "admin",
        confirmedAt: new Date(),
      })
      .onConflictDoNothing();

    try {
      // ── Reply: exactly what a chat webhook does, minus the queue ──
      if (body.message) {
        const [inbound] = await db
          .insert(inboundMessages)
          .values({
            platform: "internal",
            platformMessageId: `sim-${crypto.randomUUID()}`,
            platformUserId: channelId,
            platformChannelId: channelId,
            content: body.message.slice(0, 2000),
            truncated: body.message.length > 2000,
          })
          .returning({ id: inboundMessages.id });
        deps.simulator.clear(channelId);
        const simDeps = deps;
        const result = await handleInbound(db, {
          ...simDeps,
          scheduleTurn: async (conversationId, _seq, truncated) => {
            await processTurn(db, simDeps, conversationId, { truncatedInbound: truncated });
          },
        }, inbound.id);
        const conversationId = result.status === "processed" ? result.conversationId : undefined;
        const view = conversationId ? await getConversationView(db, conversationId) : undefined;
        return reply.send({
          conversationId: conversationId ?? null,
          reply: deps.simulator.drain(channelId).join("\n\n"),
          closed: view?.closed ?? false,
          messageCount: view?.messageCount ?? 0,
          outcome: result.status === "processed" ? result.outcome : result.status,
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
      const started = await initiateConversation(db, deps, {
        orgId,
        reviewerId: reviewer.id,
        subjectId,
        interactionType,
        platform: "internal",
        channelId,
        questionnaireId,
        // Same rule as scheduled check-ins: one open conversation at a time.
        skipIfOpen: true,
      });
      if (started.status === "skipped_open") {
        return reply.code(409).send({
          error: "This person already has an open simulated conversation; reply to it or let it finish",
          conversationId: started.openConversationId,
        });
      }

      return reply.send({
        conversationId: started.conversationId,
        reply: deps.simulator.drain(channelId).join("\n\n"),
        closed: false,
        messageCount: 1,
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
