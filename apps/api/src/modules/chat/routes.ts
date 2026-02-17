import type { FastifyPluginAsync, FastifyInstance } from "fastify";
import { Queue } from "bullmq";
import type { ChatPlatform } from "@revualy/shared";

// Lazy-initialized conversation queue (set by server startup)
let conversationQueue: Queue | null = null;

export function setConversationQueue(queue: Queue) {
  conversationQueue = queue;
}

async function handleWebhook(
  app: FastifyInstance,
  platform: ChatPlatform,
  headers: Record<string, string>,
  verifyBody: unknown, // raw string for HMAC or parsed object depending on platform
  parsedBody: unknown, // always the parsed object for normalizeInbound
  orgId: string,
) {
  if (!app.adapters.has(platform)) return { status: 503, body: { error: `${platform} adapter not configured` } };

  const adapter = app.adapters.get(platform);
  const verification = await adapter.verifyWebhook(headers, verifyBody);

  if (!verification.isValid) return { status: 401, body: { error: "Invalid signature" } };
  if (verification.challenge) return { status: 200, body: { challenge: verification.challenge } };

  const message = await adapter.normalizeInbound(parsedBody);
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
  // Add raw body content type parser for Slack signature verification.
  // Slack HMAC requires the exact raw body bytes, not re-serialized JSON.
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_req, body, done) => {
      try {
        const parsed = JSON.parse(body as string);
        // Stash raw body for signature verification
        (parsed as Record<string, unknown>).__rawBody = body;
        done(null, parsed);
      } catch (err) {
        done(err as Error);
      }
    },
  );

  // Slack webhook
  app.post("/slack/events", async (request, reply) => {
    const orgId = request.tenant?.orgId ?? "unknown";
    const body = request.body as Record<string, unknown>;
    // Pass raw body string to the adapter for HMAC verification
    const rawBody = (body.__rawBody as string) ?? JSON.stringify(body);
    const result = await handleWebhook(
      app,
      "slack",
      request.headers as Record<string, string>,
      rawBody,
      body,
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
      request.body,
      orgId,
    );
    return reply.code(result.status).send(result.body);
  });
};

