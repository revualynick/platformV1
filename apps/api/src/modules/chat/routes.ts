import type { FastifyPluginAsync } from "fastify";
import { AdapterRegistry } from "@revualy/chat-core";

const registry = new AdapterRegistry();

export const chatRoutes: FastifyPluginAsync = async (app) => {
  // Slack webhook
  app.post("/slack/events", async (request, reply) => {
    if (!registry.has("slack")) {
      return reply.code(503).send({ error: "Slack adapter not configured" });
    }

    const adapter = registry.get("slack");
    const headers = request.headers as Record<string, string>;
    const verification = await adapter.verifyWebhook(headers, request.body);

    if (!verification.isValid) {
      return reply.code(401).send({ error: "Invalid signature" });
    }

    if (verification.challenge) {
      return reply.send({ challenge: verification.challenge });
    }

    const message = await adapter.normalizeInbound(request.body);
    if (message) {
      // TODO: Publish to BullMQ event bus for conversation manager
      app.log.info({ messageId: message.id, platform: "slack" }, "Inbound message received");
    }

    return reply.code(200).send();
  });

  // Google Chat webhook
  app.post("/gchat/events", async (request, reply) => {
    if (!registry.has("google_chat")) {
      return reply.code(503).send({ error: "Google Chat adapter not configured" });
    }

    const adapter = registry.get("google_chat");
    const headers = request.headers as Record<string, string>;
    const verification = await adapter.verifyWebhook(headers, request.body);

    if (!verification.isValid) {
      return reply.code(401).send({ error: "Invalid signature" });
    }

    const message = await adapter.normalizeInbound(request.body);
    if (message) {
      app.log.info({ messageId: message.id, platform: "google_chat" }, "Inbound message received");
    }

    return reply.code(200).send();
  });

  // Teams webhook
  app.post("/teams/events", async (request, reply) => {
    if (!registry.has("teams")) {
      return reply.code(503).send({ error: "Teams adapter not configured" });
    }

    const adapter = registry.get("teams");
    const headers = request.headers as Record<string, string>;
    const verification = await adapter.verifyWebhook(headers, request.body);

    if (!verification.isValid) {
      return reply.code(401).send({ error: "Invalid signature" });
    }

    const message = await adapter.normalizeInbound(request.body);
    if (message) {
      app.log.info({ messageId: message.id, platform: "teams" }, "Inbound message received");
    }

    return reply.code(200).send();
  });
};

export { registry as adapterRegistry };
