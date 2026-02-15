import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import { getTenantDb } from "@revualy/db";
import type { LLMGateway } from "@revualy/ai-core";
import type { AdapterRegistry } from "@revualy/chat-core";
import type { ChatPlatform, InteractionType } from "@revualy/shared";
import {
  initiateConversation,
  handleReply,
  type ConversationState,
} from "../lib/conversation-orchestrator.js";
import { runAnalysisPipeline } from "../lib/analysis-pipeline.js";
import { runSchedulingPass } from "../lib/interaction-scheduler.js";

export interface WorkerConfig {
  redisUrl: string;
  llm: LLMGateway;
  adapters: AdapterRegistry;
  queues: ReturnType<typeof createQueues>;
}

function parseRedisConnection(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379"),
    password: parsed.password || undefined,
  };
}

export function createQueues(redisUrl: string) {
  const connection = parseRedisConnection(redisUrl);

  return {
    conversationQueue: new Queue("conversation", { connection }),
    analysisQueue: new Queue("analysis", { connection }),
    schedulerQueue: new Queue("scheduler", { connection }),
    notificationQueue: new Queue("notification", { connection }),
  };
}

// ── Redis-backed conversation state store ────────────────
// State is stored as JSON with a 24h TTL via SETEX.
// No manual cleanup needed — Redis handles expiry automatically.
// Survives process restarts and supports horizontal scaling.

const CONVERSATION_TTL_SECONDS = 24 * 60 * 60; // 24 hours
const STATE_KEY_PREFIX = "conv:";

let stateRedis: Redis | null = null;

function getStateRedis(redisUrl?: string): Redis {
  if (!stateRedis) {
    const url = redisUrl ?? process.env.REDIS_URL ?? "redis://localhost:6379";
    stateRedis = new Redis(url, { maxRetriesPerRequest: null, lazyConnect: true });
    stateRedis.connect().catch(() => {
      // Connection errors are logged by ioredis; callers handle missing state gracefully
    });
  }
  return stateRedis;
}

export async function getConversationState(conversationId: string): Promise<ConversationState | undefined> {
  const redis = getStateRedis();
  const raw = await redis.get(`${STATE_KEY_PREFIX}${conversationId}`);
  if (!raw) return undefined;
  return JSON.parse(raw) as ConversationState;
}

export async function setConversationState(state: ConversationState): Promise<void> {
  const redis = getStateRedis();
  await redis.setex(
    `${STATE_KEY_PREFIX}${state.conversationId}`,
    CONVERSATION_TTL_SECONDS,
    JSON.stringify(state),
  );
}

export async function deleteConversationState(conversationId: string): Promise<void> {
  const redis = getStateRedis();
  await redis.del(`${STATE_KEY_PREFIX}${conversationId}`);
}

/** Initialize the state Redis connection (called during server startup). */
export function initStateRedis(redisUrl: string): void {
  getStateRedis(redisUrl);
}

// ── Worker factory ────────────────────────────────────────

export function createWorkers(config: WorkerConfig) {
  const connection = parseRedisConnection(config.redisUrl);
  const { llm, adapters, queues } = config;

  // Conversation worker — handles initiating, follow-ups, and closing
  const conversationWorker = new Worker(
    "conversation",
    async (job) => {
      const { type } = job.data as { type: string };

      switch (type) {
        case "initiate": {
          const data = job.data as {
            orgId: string;
            reviewerId: string;
            subjectId: string;
            interactionType: InteractionType;
            platform: ChatPlatform;
            channelId?: string;
            questionnaireId: string;
          };

          const db = getTenantDb(
            data.orgId,
            process.env.TENANT_DATABASE_URL ?? "",
          );

          const state = await initiateConversation(db, { llm, adapters, analysisQueue: queues.analysisQueue }, {
            orgId: data.orgId,
            reviewerId: data.reviewerId,
            subjectId: data.subjectId,
            interactionType: data.interactionType,
            platform: data.platform,
            channelId: data.channelId ?? "",
            questionnaireId: data.questionnaireId,
          });

          // Store conversation state for reply handling
          await setConversationState(state);
          break;
        }

        case "reply": {
          const data = job.data as {
            conversationId: string;
            orgId: string;
            userMessage: string;
          };

          const state = await getConversationState(data.conversationId);
          if (!state) {
            job.log(`No active state for conversation ${data.conversationId}`);
            return;
          }

          const db = getTenantDb(
            data.orgId,
            process.env.TENANT_DATABASE_URL ?? "",
          );

          const result = await handleReply(
            db,
            { llm, adapters, analysisQueue: queues.analysisQueue },
            state,
            data.userMessage,
          );

          if (result.closed) {
            await deleteConversationState(data.conversationId);
          } else {
            await setConversationState(result.state);
          }
          break;
        }

        case "close": {
          const data = job.data as { conversationId: string };
          await deleteConversationState(data.conversationId);
          break;
        }
      }
    },
    { connection },
  );

  // Analysis worker — runs AI pipeline on closed conversations
  const analysisWorker = new Worker(
    "analysis",
    async (job) => {
      const { conversationId, orgId } = job.data as {
        conversationId: string;
        orgId: string;
      };

      const db = getTenantDb(
        orgId,
        process.env.TENANT_DATABASE_URL ?? "",
      );

      await runAnalysisPipeline(db, llm, conversationId);
    },
    { connection, concurrency: 3 },
  );

  // Scheduler worker — daily cron for interaction scheduling
  const schedulerWorker = new Worker(
    "scheduler",
    async (job) => {
      const { orgId, platform } = job.data as {
        orgId: string;
        platform: ChatPlatform;
      };

      const db = getTenantDb(
        orgId,
        process.env.TENANT_DATABASE_URL ?? "",
      );

      const result = await runSchedulingPass(
        db,
        queues.conversationQueue,
        orgId,
        platform,
      );

      job.log(`Scheduled ${result.scheduled}, skipped ${result.skipped}`);
    },
    { connection },
  );

  // Notification worker — sends digests, leaderboard updates
  const notificationWorker = new Worker(
    "notification",
    async (job) => {
      const { type } = job.data as { type: string };
      switch (type) {
        case "weekly_digest":
          // TODO Phase 4: Generate and send weekly digest
          break;
        case "leaderboard_update":
          // TODO Phase 4: Compute and publish leaderboard
          break;
      }
    },
    { connection },
  );

  return {
    conversationWorker,
    analysisWorker,
    schedulerWorker,
    notificationWorker,
  };
}
