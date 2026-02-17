import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import { getTenantDb } from "@revualy/db";
import {
  users,
  feedbackEntries,
  kudos,
  engagementScores,
  escalations,
  notificationPreferences,
  calendarTokens,
} from "@revualy/db";
import { eq, and, gte, lte, desc, inArray } from "drizzle-orm";
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
import { sendEmail } from "../lib/email.js";
import { syncCalendarForUser } from "../lib/calendar-sync.js";
import {
  weeklyDigestTemplate,
  flagAlertTemplate,
  nudgeTemplate,
  type WeeklyDigestData,
  type FlagAlertData,
  type NudgeData,
} from "../lib/email-templates.js";

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
    calendarSyncQueue: new Queue("calendar-sync", { connection }),
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

  // Notification worker — sends digests, alerts, nudges
  const notificationWorker = new Worker(
    "notification",
    async (job) => {
      const { type } = job.data as { type: string };

      switch (type) {
        case "schedule_weekly_digests": {
          // Dispatcher: enqueue individual digest jobs per active user
          const { orgId } = job.data as { orgId: string };
          const db = getTenantDb(orgId, process.env.TENANT_DATABASE_URL ?? "");

          const activeUsers = await db
            .select({ id: users.id, email: users.email })
            .from(users)
            .where(and(eq(users.isActive, true), eq(users.onboardingCompleted, true)));

          for (const user of activeUsers) {
            await queues.notificationQueue.add("weekly_digest", {
              type: "weekly_digest",
              orgId,
              userId: user.id,
              email: user.email,
            });
          }
          job.log(`Dispatched ${activeUsers.length} weekly digest jobs`);
          break;
        }

        case "weekly_digest": {
          const data = job.data as {
            orgId: string;
            userId: string;
            email: string;
          };
          const db = getTenantDb(data.orgId, process.env.TENANT_DATABASE_URL ?? "");

          // Check preference
          const [pref] = await db
            .select()
            .from(notificationPreferences)
            .where(
              and(
                eq(notificationPreferences.userId, data.userId),
                eq(notificationPreferences.type, "weekly_digest"),
              ),
            );
          if (pref && !pref.enabled) {
            job.log(`Digest disabled for user ${data.userId}`);
            break;
          }

          // Gather data for the past week
          const now = new Date();
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

          const [user] = await db.select().from(users).where(eq(users.id, data.userId));
          if (!user) break;

          const [feedbackReceived, feedbackGiven, kudosRows, engRows] = await Promise.all([
            db.select().from(feedbackEntries).where(
              and(eq(feedbackEntries.subjectId, data.userId), gte(feedbackEntries.createdAt, weekAgo)),
            ),
            db.select().from(feedbackEntries).where(
              and(eq(feedbackEntries.reviewerId, data.userId), gte(feedbackEntries.createdAt, weekAgo)),
            ),
            db.select().from(kudos).where(
              and(eq(kudos.receiverId, data.userId), gte(kudos.createdAt, weekAgo)),
            ),
            db.select().from(engagementScores).where(eq(engagementScores.userId, data.userId))
              .orderBy(desc(engagementScores.weekStarting)).limit(1),
          ]);

          const digestData: WeeklyDigestData = {
            userName: user.name.split(" ")[0],
            weekLabel: weekAgo.toLocaleDateString("en-US", { month: "short", day: "numeric" })
              + " – " + now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
            feedbackReceived: feedbackReceived.length,
            feedbackGiven: feedbackGiven.length,
            engagementScore: engRows[0]?.averageQualityScore ?? 0,
            kudosReceived: kudosRows.length,
            topValue: null, // Would require value scores join — simplified
            streak: engRows[0]?.streak ?? 0,
          };

          const html = weeklyDigestTemplate(digestData);
          await sendEmail({
            to: data.email,
            subject: `Your weekly review digest — ${digestData.weekLabel}`,
            html,
            unsubscribeUrl: `${process.env.APP_URL ?? "http://localhost:3001"}/settings/notifications`,
          });
          break;
        }

        case "flag_alert": {
          const data = job.data as {
            orgId: string;
            managerId: string;
            managerEmail: string;
            managerName: string;
            subjectName: string;
            severity: string;
            reason: string;
            flaggedContent: string;
            escalationId: string;
          };

          const db = getTenantDb(data.orgId, process.env.TENANT_DATABASE_URL ?? "");

          // Check preference
          const [pref] = await db
            .select()
            .from(notificationPreferences)
            .where(
              and(
                eq(notificationPreferences.userId, data.managerId),
                eq(notificationPreferences.type, "flag_alert"),
              ),
            );
          if (pref && !pref.enabled) break;

          const alertData: FlagAlertData = {
            managerName: data.managerName.split(" ")[0],
            subjectName: data.subjectName,
            severity: data.severity,
            reason: data.reason,
            flaggedContent: data.flaggedContent,
            escalationId: data.escalationId,
          };

          await sendEmail({
            to: data.managerEmail,
            subject: `Flag alert: ${data.subjectName} — ${data.severity}`,
            html: flagAlertTemplate(alertData),
            unsubscribeUrl: `${process.env.APP_URL ?? "http://localhost:3001"}/settings/notifications`,
          });
          break;
        }

        case "nudge": {
          const data = job.data as {
            orgId: string;
            userId: string;
            email: string;
            userName: string;
            interactionsPending: number;
            targetThisWeek: number;
          };

          const db = getTenantDb(data.orgId, process.env.TENANT_DATABASE_URL ?? "");

          // Check preference
          const [pref] = await db
            .select()
            .from(notificationPreferences)
            .where(
              and(
                eq(notificationPreferences.userId, data.userId),
                eq(notificationPreferences.type, "nudge"),
              ),
            );
          if (pref && !pref.enabled) break;

          const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
          const nudgeData: NudgeData = {
            userName: data.userName.split(" ")[0],
            interactionsPending: data.interactionsPending,
            targetThisWeek: data.targetThisWeek,
            dayOfWeek: days[new Date().getUTCDay()],
          };

          await sendEmail({
            to: data.email,
            subject: `Friendly reminder: ${data.interactionsPending} review${data.interactionsPending !== 1 ? "s" : ""} this week`,
            html: nudgeTemplate(nudgeData),
            unsubscribeUrl: `${process.env.APP_URL ?? "http://localhost:3001"}/settings/notifications`,
          });
          break;
        }

        case "leaderboard_update":
          // TODO Phase 5: Compute and publish leaderboard
          break;
      }
    },
    { connection },
  );

  // Calendar sync worker — syncs events for users with connected calendars
  const calendarSyncWorker = new Worker(
    "calendar-sync",
    async (job) => {
      const { orgId } = job.data as { orgId: string };
      const db = getTenantDb(orgId, process.env.TENANT_DATABASE_URL ?? "");

      // Get all users with calendar tokens
      const tokens = await db
        .select({ userId: calendarTokens.userId })
        .from(calendarTokens);

      let synced = 0;
      const BATCH_SIZE = 5;
      for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
        const batch = tokens.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map((t) => syncCalendarForUser(db, t.userId)),
        );
        for (let j = 0; j < results.length; j++) {
          const r = results[j];
          if (r.status === "fulfilled") {
            synced += r.value.synced;
          } else {
            job.log(`Calendar sync failed for user ${batch[j].userId}: ${r.reason}`);
          }
        }
      }
      job.log(`Synced ${synced} events for ${tokens.length} users`);
    },
    { connection },
  );

  return {
    conversationWorker,
    analysisWorker,
    schedulerWorker,
    notificationWorker,
    calendarSyncWorker,
  };
}
