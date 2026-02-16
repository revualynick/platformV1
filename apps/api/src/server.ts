import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { authRoutes } from "./modules/auth/routes.js";
import { chatRoutes, setConversationQueue } from "./modules/chat/routes.js";
import { feedbackRoutes } from "./modules/feedback/routes.js";
import { usersRoutes } from "./modules/users/routes.js";
import { orgRoutes } from "./modules/org/routes.js";
import { engagementRoutes } from "./modules/engagement/routes.js";
import { kudosRoutes } from "./modules/kudos/routes.js";
import { escalationRoutes } from "./modules/escalation/routes.js";
import { relationshipsRoutes } from "./modules/relationships/routes.js";
import { conversationRoutes } from "./modules/conversation/routes.js";
import { calibrationRoutes } from "./modules/calibration/routes.js";
import { tenantPlugin } from "./lib/tenant-context.js";
import { createQueues, createWorkers, initStateRedis } from "./workers/index.js";
import { createLLMGateway } from "@revualy/ai-core";
import { AdapterRegistry } from "@revualy/chat-core";

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const HOST = process.env.HOST ?? "0.0.0.0";
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
    },
  });

  // Plugins
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN ?? "http://localhost:3001",
    credentials: true,
  });
  await app.register(cookie);
  await app.register(tenantPlugin);

  // Global error handler for validation errors
  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    if (error.statusCode === 400) {
      return reply.code(400).send({ error: error.message });
    }
    request.log.error(error);
    return reply.code(500).send({ error: "Internal server error" });
  });

  // Health check
  app.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

  // API routes
  await app.register(authRoutes, { prefix: "/api/v1/auth" });
  await app.register(usersRoutes, { prefix: "/api/v1/users" });
  await app.register(feedbackRoutes, { prefix: "/api/v1" });
  await app.register(engagementRoutes, { prefix: "/api/v1" });
  await app.register(kudosRoutes, { prefix: "/api/v1/kudos" });
  await app.register(escalationRoutes, { prefix: "/api/v1/escalations" });
  await app.register(orgRoutes, { prefix: "/api/v1/admin" });
  await app.register(relationshipsRoutes, { prefix: "/api/v1" });
  await app.register(conversationRoutes, { prefix: "/api/v1/conversations" });
  await app.register(calibrationRoutes, { prefix: "/api/v1" });

  // Webhook routes
  await app.register(chatRoutes, { prefix: "/webhooks" });

  return app;
}

async function start() {
  const app = await buildApp();

  // ── Redis + BullMQ initialization ────────────────────────
  initStateRedis(REDIS_URL);

  const queues = createQueues(REDIS_URL);
  setConversationQueue(queues.conversationQueue);

  // LLM gateway — provider determined by env vars
  const llm = createLLMGateway({
    provider: process.env.LLM_PROVIDER ?? "anthropic",
    apiKey: process.env.LLM_API_KEY ?? "",
    baseUrl: process.env.LLM_BASE_URL || undefined,
    models: {
      ...(process.env.LLM_MODEL_FAST ? { fast: process.env.LLM_MODEL_FAST } : {}),
      ...(process.env.LLM_MODEL_STANDARD ? { standard: process.env.LLM_MODEL_STANDARD } : {}),
      ...(process.env.LLM_MODEL_ADVANCED ? { advanced: process.env.LLM_MODEL_ADVANCED } : {}),
    },
  });
  const adapters = new AdapterRegistry();

  const workers = createWorkers({
    redisUrl: REDIS_URL,
    llm,
    adapters,
    queues,
  });

  app.log.info("BullMQ workers started (conversation, analysis, scheduler, notification)");

  // ── Graceful shutdown ────────────────────────────────────
  const shutdown = async (signal: string) => {
    app.log.info(`${signal} received — shutting down`);
    await Promise.allSettled([
      workers.conversationWorker.close(),
      workers.analysisWorker.close(),
      workers.schedulerWorker.close(),
      workers.notificationWorker.close(),
      queues.conversationQueue.close(),
      queues.analysisQueue.close(),
      queues.schedulerQueue.close(),
      queues.notificationQueue.close(),
    ]);
    await app.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`Server running on ${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
