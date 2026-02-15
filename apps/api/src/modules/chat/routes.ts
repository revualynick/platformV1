import type { FastifyPluginAsync } from "fastify";
import { Queue } from "bullmq";
import { AdapterRegistry } from "@revualy/chat-core";
import type { ChatPlatform } from "@revualy/shared";

const registry = new AdapterRegistry();

// Lazy-initialized conversation queue (set by server startup)
let conversationQueue: Queue | null = null;

export function setConversationQueue(queue: Queue) {
  conversationQueue = queue;
}

async function handleWebhook(
  app: { log: { info: (...args: unknown[]) => void } },
  platform: ChatPlatform,
  headers: Record<string, string>,
  body: unknown,
  orgId: string,
) {
  if (!registry.has(platform)) return { status: 503, body: { error: `${platform} adapter not configured` } };

  const adapter = registry.get(platform);
  const verification = await adapter.verifyWebhook(headers, body);

  if (!verification.isValid) return { status: 401, body: { error: "Invalid signature" } };
  if (verification.challenge) return { status: 200, body: { challenge: verification.challenge } };

  const message = await adapter.normalizeInbound(body);
  if (message && conversationQueue) {
    // Enqueue as a conversation reply job
    await conversationQueue.add("reply", {
      type: "reply",
      orgId,
      conversationId: message.threadId ?? "", // thread maps to conversation
      userMessage: message.text,
      platform,
      platformUserId: message.platformUserId,
      platformChannelId: message.platformChannelId,
    });
    app.log.info({ messageId: message.id, platform }, "Inbound message enqueued");
  } else if (message) {
    app.log.info({ messageId: message.id, platform }, "Inbound message received (no queue)");
  }

  return { status: 200, body: undefined };
}

export const chatRoutes: FastifyPluginAsync = async (app) => {
  // Slack webhook
  app.post("/slack/events", async (request, reply) => {
    const orgId = request.tenant?.orgId ?? "unknown";
    const result = await handleWebhook(
      app,
      "slack",
      request.headers as Record<string, string>,
      request.body,
      orgId,
    );
    return reply.code(result.status).send(result.body);
  });

  // Google Chat webhook
  app.post("/gchat/events", async (request, reply) => {
    const orgId = request.tenant?.orgId ?? "unknown";
    const result = await handleWebhook(
      app,
      "google_chat",
      request.headers as Record<string, string>,
      request.body,
      orgId,
    );
    return reply.code(result.status).send(result.body);
  });

  // Teams webhook
  app.post("/teams/events", async (request, reply) => {
    const orgId = request.tenant?.orgId ?? "unknown";
    const result = await handleWebhook(
      app,
      "teams",
      request.headers as Record<string, string>,
      request.body,
      orgId,
    );
    return reply.code(result.status).send(result.body);
  });
};

export { registry as adapterRegistry };
