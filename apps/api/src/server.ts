import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import websocket from "@fastify/websocket";
import rateLimit from "@fastify/rate-limit";
import helmet from "@fastify/helmet";
import { authRoutes } from "./modules/auth/routes.js";
import { setCheckInQueue } from "./modules/one-on-one/imports.js";
import { chatRoutes, setConversationQueue } from "./modules/chat/routes.js";
import { devRoutes, setSimulatorDeps } from "./modules/dev/routes.js";
import { InternalSimulatorAdapter } from "./lib/internal-simulator-adapter.js";
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
import { pulseRoutes } from "./modules/pulse/routes.js";
import { threeSixtyRoutes } from "./modules/three-sixty/routes.js";
import { themeRoutes } from "./modules/themes/routes.js";
import { campaignRoutes } from "./modules/campaigns/routes.js";
import { demoRoutes, setDemoAnalysisQueue } from "./modules/demo/routes.js";
import { goalsRoutes } from "./modules/goals/routes.js";
import { importRoutes } from "./modules/imports/routes.js";
import { reflectionRoutes, setReflectionAnalysisQueue } from "./modules/reflections/routes.js";
import { exportRoutes } from "./modules/export/routes.js";
import { assessmentRoutes } from "./modules/assessments/routes.js";
import { privacyRoutes } from "./modules/privacy/routes.js";
import { accessGrantRoutes } from "./modules/access-grants/routes.js";
import { supportRoutes } from "./modules/support/routes.js";
import { opsRoutes, setOpsQueues } from "./modules/ops/routes.js";
import { assertPseudonymReady } from "./lib/pseudonym.js";
import { profileRoutes, setProfilesNotificationQueue } from "./modules/profiles/routes.js";
import { registerOneOnOneWs, closeWsRedis } from "./modules/one-on-one/ws.js";
import { tenantPlugin, rateLimitKey } from "./lib/tenant-context.js";
import { createQueues, createWorkers, initStateRedis, closeStateRedis, getStateRedis } from "./workers/index.js";
import { RedisAsyncStore } from "./lib/redis-async-store.js";
import { createLLMGateway, type LLMGateway } from "@revualy/ai-core";
import { runMigrations } from "@revualy/db/migrate";
import { assertEncryptionReady } from "@revualy/shared/server";
import { AdapterRegistry } from "@revualy/chat-core";
import { SlackAdapter } from "@revualy/chat-adapter-slack";
import { GoogleChatAdapter } from "@revualy/chat-adapter-gchat";
import { TeamsAdapter } from "@revualy/chat-adapter-teams";

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

export async function buildApp() {
  const app = Fastify({
    // Behind Railway's proxy request.ip is the proxy unless we trust the
    // forwarded header. Set TRUST_PROXY to the hop count (1 on Railway);
    // leave unset locally so X-Forwarded-For cannot be spoofed.
    trustProxy: Number(process.env.TRUST_PROXY) || false,
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
  await app.register(helmet, {
    contentSecurityPolicy: false, // CSP managed by Next.js frontend
    hsts: false, // HSTS set on Next.js frontend — API is internal
  });
  await app.register(cookie);
  await app.register(websocket, { options: { maxPayload: 1_000_000 } });
  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    keyGenerator: rateLimitKey,
    // Chat platforms deliver webhooks from shared IP pools, so IP-keyed
    // limiting would let one busy workspace throttle another. Webhooks
    // are already authenticated by per-platform signature verification.
    allowList: (request) => request.url.startsWith("/webhooks"),
  });
  await app.register(tenantPlugin);

  // Global error handler — preserve client error status codes, log server errors
  app.setErrorHandler((error: Error & { statusCode?: number; validation?: unknown }, request, reply) => {
    const status = error.statusCode ?? 500;

    if (status >= 400 && status < 500) {
      // Sanitize: only expose validation errors and known safe messages
      const safeMessage = error.validation
        ? "Validation failed"
        : status === 401
          ? "Unauthorized"
          : status === 403
            ? "Forbidden"
            : status === 404
              ? "Not found"
              : status === 400
                ? (error.message.startsWith("Validation failed:") ? error.message : "Bad request")
                : "Request error";
      return reply.code(status).send({ error: safeMessage });
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
  await app.register(campaignRoutes, { prefix: "/api/v1/admin/campaigns" });
  await app.register(relationshipsRoutes, { prefix: "/api/v1" });
  await app.register(conversationRoutes, { prefix: "/api/v1/conversations" });
  await app.register(calibrationRoutes, { prefix: "/api/v1" });
  await app.register(notificationRoutes, { prefix: "/api/v1/notifications" });
  await app.register(integrationsRoutes, { prefix: "/api/v1/integrations" });
  await app.register(managerRoutes, { prefix: "/api/v1/manager" });
  await app.register(oneOnOneRoutes, { prefix: "/api/v1/one-on-one-sessions" });
  await app.register(pulseRoutes, { prefix: "/api/v1/pulse" });
  await app.register(threeSixtyRoutes, { prefix: "/api/v1/three-sixty" });
  await app.register(reflectionRoutes, { prefix: "/api/v1/reflections" });
  await app.register(exportRoutes, { prefix: "/api/v1/export" });
  await app.register(themeRoutes, { prefix: "/api/v1/themes" });
  await app.register(assessmentRoutes, { prefix: "/api/v1/assessments" });
  await app.register(profileRoutes, { prefix: "/api/v1/profiles" });
  await app.register(demoRoutes, { prefix: "/api/v1/demo" });
  await app.register(goalsRoutes, { prefix: "/api/v1/goals" });
  await app.register(importRoutes, { prefix: "/api/v1/admin/imports" });
  await app.register(privacyRoutes, { prefix: "/api/v1/admin/privacy" });
  await app.register(accessGrantRoutes, { prefix: "/api/v1/access-grants" });
  await app.register(supportRoutes, { prefix: "/api/v1/support" });
  await app.register(opsRoutes, { prefix: "/api/v1/ops" });
  await app.register(devRoutes, { prefix: "/api/v1/dev" });

  // WebSocket routes
  registerOneOnOneWs(app, REDIS_URL);

  // Webhook routes
  await app.register(chatRoutes, { prefix: "/webhooks" });

  return app;
}

async function start() {
  const isProduction = process.env.NODE_ENV === "production";
  const required = ["DATABASE_URL"];
  if (isProduction) {
    required.push("ORG_ID", "INTERNAL_API_SECRET", "NEXTAUTH_SECRET", "NEXTAUTH_URL", "WS_TOKEN_SECRET");
  }
  const missing = required.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    console.error(`Fatal: missing required env vars: ${missing.join(", ")}`);
    process.exit(1);
  }

  // Fail closed: feedback content is encrypted at rest, so refuse to start
  // (in every environment) rather than fail on the first request.
  try {
    assertEncryptionReady();
    // Peer feedback is stored under a pseudonym (tier A): same rule.
    assertPseudonymReady();
  } catch (err) {
    console.error(`Fatal: ${(err as Error).message}`);
    process.exit(1);
  }

  try {
    await runMigrations(process.env.DATABASE_URL!);
    console.log("Database migrations applied successfully");
  } catch (err) {
    console.error("Fatal: database migration failed", err);
    process.exit(1);
  }

  const app = await buildApp();

  // ── Redis + BullMQ initialization ────────────────────────
  initStateRedis(REDIS_URL);

  const queues = createQueues(REDIS_URL);
  setOpsQueues(queues);
  setConversationQueue(queues.conversationQueue);
  setCheckInQueue(queues.checkInQueue);
  setDemoAnalysisQueue(queues.analysisQueue);
  setProfilesNotificationQueue(queues.notificationQueue);
  setReflectionAnalysisQueue(queues.analysisQueue);

  // LLM gateway — provider determined by env vars
  const llmProvider = (process.env.LLM_PROVIDER ?? "anthropic") as import("@revualy/ai-core").LLMProvider;
  const llmApiKey =
    process.env.LLM_API_KEY ||
    (llmProvider === "anthropic" ? process.env.ANTHROPIC_API_KEY : undefined) ||
    (llmProvider === "openai" ? process.env.OPENAI_API_KEY : undefined) ||
    "";
  if (!llmApiKey) {
    app.log.warn(`No LLM API key found for provider "${llmProvider}" — LLM calls will fail at runtime`);
  }
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
  if (process.env.SLACK_BOT_TOKEN) {
    if (!process.env.SLACK_SIGNING_SECRET) {
      app.log.warn("SLACK_BOT_TOKEN is set but SLACK_SIGNING_SECRET is missing — Slack adapter not registered");
    } else {
      adapters.register(new SlackAdapter({
        botToken: process.env.SLACK_BOT_TOKEN,
        signingSecret: process.env.SLACK_SIGNING_SECRET,
        appToken: process.env.SLACK_APP_TOKEN,
      }));
      app.log.info("Slack adapter registered");
    }
  }

  if (process.env.GCHAT_SERVICE_ACCOUNT_KEY) {
    // Webhooks are verified against Google's signed token for this audience
    // (the Chat API "Authentication audience": project number or endpoint URL).
    const audience = process.env.GOOGLE_CHAT_AUDIENCE;
    if (!audience) {
      app.log.error("GCHAT_SERVICE_ACCOUNT_KEY is set but GOOGLE_CHAT_AUDIENCE is missing: Google Chat adapter not registered");
    } else {
      try {
        adapters.register(new GoogleChatAdapter({
          serviceAccountKeyJson: process.env.GCHAT_SERVICE_ACCOUNT_KEY,
          projectId: process.env.GCHAT_PROJECT_ID ?? "",
          audience,
          // Deprecated shared token: honoured only with an explicit opt-in.
          verificationToken: process.env.GCHAT_VERIFICATION_TOKEN,
          allowLegacyToken: process.env.GCHAT_ALLOW_LEGACY_TOKEN === "true",
        }));
        app.log.info("Google Chat adapter registered");
      } catch (err) {
        app.log.error({ err }, "Google Chat adapter not registered: invalid configuration");
      }
    }
  }

  if (process.env.TEAMS_APP_ID) {
    if (!process.env.TEAMS_APP_PASSWORD) {
      app.log.warn("TEAMS_APP_ID is set but TEAMS_APP_PASSWORD is missing — Teams adapter not registered");
    } else {
      // Use the shared state Redis so conversation refs survive process restarts.
      adapters.register(new TeamsAdapter({
        appId: process.env.TEAMS_APP_ID,
        appPassword: process.env.TEAMS_APP_PASSWORD,
        store: new RedisAsyncStore(getStateRedis()),
      }));
      app.log.info("Teams adapter registered");
    }
  }

  // Validate encryption key early if set (fails at runtime otherwise)
  if (process.env.ENCRYPTION_KEY) {
    const key = process.env.ENCRYPTION_KEY;
    if (key.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(key)) {
      app.log.error("ENCRYPTION_KEY must be 64 hex characters — encryption operations will fail");
    }
  }

  // Internal chat-simulation harness (dev only — the /dev routes are inert
  // unless TEST_LOGIN_ENABLED=true, and still require the TEST_LOGIN_KEY).
  const simulator = new InternalSimulatorAdapter();
  adapters.register(simulator);
  setSimulatorDeps({
    llm,
    adapters,
    analysisQueue: queues.analysisQueue,
    simulator,
  });

  // Expose on app so route handlers can access app.llm / app.adapters
  app.decorate("llm", llm);
  app.decorate("adapters", adapters);

  const workers = createWorkers({
    redisUrl: REDIS_URL,
    llm,
    adapters,
    queues,
  });

  app.log.info("BullMQ workers started (conversation, analysis, scheduler, notification, calendar-sync, profile-signals, check-in)");

  // ── Repeatable cron jobs ───────────────────────────────
  // Per-tenant deployment: single org per instance.
  const cronOrgId = process.env.ORG_ID ?? "dev-org";

  // Clean up stale repeatable jobs before re-adding
  for (const queue of [queues.conversationQueue, queues.schedulerQueue, queues.notificationQueue, queues.calendarSyncQueue, queues.profileSignalsQueue, queues.checkInQueue]) {
    const repeatableJobs = await queue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      await queue.removeRepeatableByKey(job.key);
    }
  }

  // Calendar model: daily at 03:00 UTC, an hour before the scheduling pass,
  // so its proposals are ready when the pass looks for them. Same queue and
  // a single worker, so the pass waits if this runs long.
  await queues.schedulerQueue.add(
    "calendar-model",
    { orgId: cronOrgId },
    { repeat: { pattern: "0 3 * * *" }, jobId: "calendar-model-cron" },
  );

  // Interaction scheduler: daily at 04:00 UTC. Each conversation is timed
  // for the user's own preferred local time and skipped if that lands on
  // one of their quiet days. Running early means the preferred time is
  // still ahead the same day for the UK, Europe and the Americas (a 10:00
  // UTC run pushed every UK/Europe send to the next day). The connected chat
  // integration decides the platform; SCHEDULER_PLATFORM is a dev fallback.
  await queues.schedulerQueue.add(
    "scheduling-pass",
    { orgId: cronOrgId, platform: (process.env.SCHEDULER_PLATFORM ?? "slack") },
    { repeat: { pattern: "0 4 * * *" }, jobId: "scheduling-pass-cron" },
  );

  // Conversation sweeper: every 5 minutes. Marks conversations quiet for
  // 24 h incomplete, and re-sends or re-queues anything stuck for over
  // 5 minutes (unsent replies, unprocessed messages, unanswered turns,
  // missing analysis). See lib/conversation-sweeper.ts.
  await queues.conversationQueue.add(
    "sweep",
    { type: "sweep", orgId: cronOrgId },
    { repeat: { pattern: "*/5 * * * *" }, jobId: "conversation-sweep-cron" },
  );

  // Ops check: every 15 minutes. Emails OPS_ALERT_EMAIL (the operator) when
  // a pipeline check goes wrong; counts only. See lib/ops-alerts.ts. On the
  // notification queue, so it never holds up people's chat replies.
  await queues.notificationQueue.add(
    "ops_check",
    { type: "ops_check", orgId: cronOrgId },
    { repeat: { pattern: "*/15 * * * *" }, jobId: "ops-check-cron" },
  );

  // Weekly digest: Monday 9:00 AM UTC
  await queues.notificationQueue.add(
    "schedule_weekly_digests",
    { type: "schedule_weekly_digests", orgId: cronOrgId },
    { repeat: { pattern: "0 9 * * 1" }, jobId: "weekly-digest-cron" },
  );

  // Nudge reminders: Wednesday and Friday 9:00 AM UTC — remind users behind their weekly target
  await queues.notificationQueue.add(
    "schedule_nudges",
    { type: "schedule_nudges", orgId: cronOrgId },
    { repeat: { pattern: "0 9 * * 3,5" }, jobId: "nudge-cron" },
  );

  // Calendar sync: every 15 minutes
  await queues.calendarSyncQueue.add(
    "calendar-sync",
    { orgId: cronOrgId },
    { repeat: { pattern: "*/15 * * * *" }, jobId: "calendar-sync-cron" },
  );

  // Profile signal aggregation: 1st of each month at 2 AM UTC
  await queues.profileSignalsQueue.add(
    "aggregate_all",
    { type: "aggregate_all", orgId: cronOrgId },
    { repeat: { pattern: "0 2 1 * *" }, jobId: "profile-signals-aggregate-cron" },
  );

  // Check-in transcript pipeline: hourly (transcripts appear hours
  // after meetings; hourly retries double as the discovery backoff)
  await queues.checkInQueue.add(
    "check-in-poll",
    { orgId: cronOrgId },
    { repeat: { pattern: "0 * * * *" }, jobId: "check-in-poll-cron" },
  );

  // ── Graceful shutdown ────────────────────────────────────
  const shutdown = async (signal: string) => {
    app.log.info(`${signal} received — shutting down`);
    const SHUTDOWN_TIMEOUT = 10_000;
    await Promise.race([
      Promise.allSettled([
        workers.conversationWorker.close(),
        workers.analysisWorker.close(),
        workers.schedulerWorker.close(),
        workers.notificationWorker.close(),
        workers.calendarSyncWorker.close(),
        workers.profileSignalsWorker.close(),
        workers.checkInWorker.close(),
        queues.conversationQueue.close(),
        queues.analysisQueue.close(),
        queues.schedulerQueue.close(),
        queues.notificationQueue.close(),
        queues.calendarSyncQueue.close(),
        queues.profileSignalsQueue.close(),
        queues.checkInQueue.close(),
        closeStateRedis(),
        closeWsRedis(),
      ]),
      new Promise((resolve) => setTimeout(resolve, SHUTDOWN_TIMEOUT)),
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

// Only auto-start when run directly (not when imported for testing)
const isDirectRun =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("/server.js");
if (isDirectRun) {
  start();
}
