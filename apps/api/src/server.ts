import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import websocket from "@fastify/websocket";
import rateLimit from "@fastify/rate-limit";
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
import { notificationRoutes } from "./modules/notifications/routes.js";
import { integrationsRoutes } from "./modules/integrations/routes.js";
import { managerRoutes } from "./modules/manager/routes.js";
import { oneOnOneRoutes } from "./modules/one-on-one/routes.js";
import { demoRoutes, setDemoAnalysisQueue } from "./modules/demo/routes.js";
import { registerOneOnOneWs, closeWsRedis } from "./modules/one-on-one/ws.js";
import { tenantPlugin } from "./lib/tenant-context.js";
import { createQueues, createWorkers, initStateRedis, closeStateRedis } from "./workers/index.js";
import { createLLMGateway, type LLMGateway } from "@revualy/ai-core";
import { AdapterRegistry } from "@revualy/chat-core";
import { SlackAdapter } from "@revualy/chat-adapter-slack";
import { GoogleChatAdapter } from "@revualy/chat-adapter-gchat";

// Declaration merging so routes can access app.llm and app.adapters
declare module "fastify" {
  interface FastifyInstance {
    llm: LLMGateway;
    adapters: AdapterRegistry;
  }
}

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
  const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:3001";
  const origins = corsOrigin.includes(",")
    ? corsOrigin.split(",").map((o) => o.trim())
    : corsOrigin;
  await app.register(cors, {
    origin: origins,
    credentials: true,
  });
  await app.register(cookie);
  await app.register(websocket);
  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    keyGenerator: (request) =>
      request.tenant?.userId ?? request.ip,
  });
  await app.register(tenantPlugin);

  // Global error handler — preserve client error status codes, log server errors
  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    const status = error.statusCode ?? 500;

    if (status >= 400 && status < 500) {
      return reply.code(status).send({ error: error.message });
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
  await app.register(notificationRoutes, { prefix: "/api/v1/notifications" });
  await app.register(integrationsRoutes, { prefix: "/api/v1/integrations" });
  await app.register(managerRoutes, { prefix: "/api/v1/manager" });
  await app.register(oneOnOneRoutes, { prefix: "/api/v1/one-on-one-sessions" });
  await app.register(demoRoutes, { prefix: "/api/v1/demo" });

  // WebSocket routes
  registerOneOnOneWs(app, REDIS_URL);

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
  setDemoAnalysisQueue(queues.analysisQueue);

  // LLM gateway — provider determined by env vars
  const llmProvider = process.env.LLM_PROVIDER ?? "anthropic";
  const llmApiKey =
    process.env.LLM_API_KEY ||
    (llmProvider === "anthropic" ? process.env.ANTHROPIC_API_KEY : undefined) ||
    (llmProvider === "openai" ? process.env.OPENAI_API_KEY : undefined) ||
    "";
  const llm = createLLMGateway({
    provider: llmProvider,
    apiKey: llmApiKey,
    baseUrl: process.env.LLM_BASE_URL || undefined,
    models: {
      ...(process.env.LLM_MODEL_FAST ? { fast: process.env.LLM_MODEL_FAST } : {}),
      ...(process.env.LLM_MODEL_STANDARD ? { standard: process.env.LLM_MODEL_STANDARD } : {}),
      ...(process.env.LLM_MODEL_ADVANCED ? { advanced: process.env.LLM_MODEL_ADVANCED } : {}),
    },
  });
  const adapters = new AdapterRegistry();

  // Register chat adapters when credentials are available
  if (process.env.SLACK_BOT_TOKEN && process.env.SLACK_SIGNING_SECRET) {
    adapters.register(new SlackAdapter({
      botToken: process.env.SLACK_BOT_TOKEN,
      signingSecret: process.env.SLACK_SIGNING_SECRET,
      appToken: process.env.SLACK_APP_TOKEN,
    }));
    app.log.info("Slack adapter registered");
  }

  if (process.env.GCHAT_SERVICE_ACCOUNT_KEY && process.env.GCHAT_VERIFICATION_TOKEN) {
    adapters.register(new GoogleChatAdapter({
      serviceAccountKeyJson: process.env.GCHAT_SERVICE_ACCOUNT_KEY,
      projectId: process.env.GCHAT_PROJECT_ID ?? "",
      verificationToken: process.env.GCHAT_VERIFICATION_TOKEN,
    }));
    app.log.info("Google Chat adapter registered");
  }

  // Expose on app so route handlers can access app.llm / app.adapters
  app.decorate("llm", llm);
  app.decorate("adapters", adapters);

  const workers = createWorkers({
    redisUrl: REDIS_URL,
    llm,
    adapters,
    queues,
  });

  app.log.info("BullMQ workers started (conversation, analysis, scheduler, notification)");

  // ── Repeatable cron jobs ───────────────────────────────
  // Weekly digest: Monday 9:00 AM UTC
  await queues.notificationQueue.add(
    "schedule_weekly_digests",
    { type: "schedule_weekly_digests", orgId: "dev-org" },
    { repeat: { pattern: "0 9 * * 1" }, jobId: "weekly-digest-cron" },
  );

  // Calendar sync: every 15 minutes
  await queues.calendarSyncQueue.add(
    "calendar-sync",
    { orgId: "dev-org" },
    { repeat: { pattern: "*/15 * * * *" }, jobId: "calendar-sync-cron" },
  );

  // ── Graceful shutdown ────────────────────────────────────
  const shutdown = async (signal: string) => {
    app.log.info(`${signal} received — shutting down`);
    await Promise.allSettled([
      workers.conversationWorker.close(),
      workers.analysisWorker.close(),
      workers.schedulerWorker.close(),
      workers.notificationWorker.close(),
      workers.calendarSyncWorker.close(),
      queues.conversationQueue.close(),
      queues.analysisQueue.close(),
      queues.schedulerQueue.close(),
      queues.notificationQueue.close(),
      queues.calendarSyncQueue.close(),
      closeStateRedis(),
      closeWsRedis(),
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
