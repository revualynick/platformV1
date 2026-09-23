import crypto from "node:crypto";
import { z } from "zod";
import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import { getTenantDb } from "@revualy/db";
import {
  users,
  conversations,
  feedbackEntries,
  feedbackValueScores,
  coreValues,
  kudos,
  engagementScores,
  escalations,
  notificationPreferences,
  calendarTokens,
  behavioralSignals,
  profileSnapshots,
  feedbackDigests,
} from "@revualy/db";
import { eq, and, gte, lte, lt, desc, inArray, sql } from "drizzle-orm";
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
import { buildJobId } from "../lib/job-ids.js";
import { getActivePlatform } from "../lib/active-platform.js";
import { discoverGoogleChatDm } from "../lib/chat-identity.js";
import { sendEmail } from "../lib/email.js";
import { syncCalendarForUser } from "../lib/calendar-sync.js";
import { runCheckInPipeline } from "../lib/check-in-pipeline.js";
import { extractProfileSignals } from "../lib/profile-signal-extractor.js";
import {
  weeklyDigestTemplate,
  flagAlertTemplate,
  nudgeTemplate,
  assessmentInviteTemplate,
  type WeeklyDigestData,
  type FlagAlertData,
  type NudgeData,
} from "../lib/email-templates.js";

const initiateJobSchema = z.object({
  type: z.literal("initiate"),
  orgId: z.string(),
  reviewerId: z.string(),
  subjectId: z.string(),
  interactionType: z.enum(["peer_review", "self_reflection", "three_sixty", "pulse_check"]),
  platform: z.enum(["slack", "google_chat", "teams", "internal"]),
  channelId: z.string().optional(),
  questionnaireId: z.string(),
  // Preserved through Zod so dedup logic can reference the originating schedule
  // entry. TODO: pass to initiateConversation once the orchestrator persists it
  // on the conversations row, enabling true idempotent re-delivery guards.
  scheduleEntryId: z.string().optional(),
});

const replyJobSchema = z.object({
  type: z.literal("reply"),
  conversationId: z.string(),
  orgId: z.string(),
  userMessage: z.string(),
  truncated: z.boolean().optional(),
});

const closeJobSchema = z.object({
  type: z.literal("close"),
  conversationId: z.string(),
  orgId: z.string(),
});

const analysisJobSchema = z.object({
  conversationId: z.string(),
  orgId: z.string(),
});

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
    port: parseInt(parsed.port || "6379", 10),
    password: parsed.password || undefined,
    username: parsed.username || undefined,
    db: parsed.pathname?.length > 1 ? parseInt(parsed.pathname.slice(1), 10) : undefined,
    tls: parsed.protocol === "rediss:" ? {} : undefined,
  };
}

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 1000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

export function createQueues(redisUrl: string) {
  const connection = parseRedisConnection(redisUrl);
  const defaultJobOptions = DEFAULT_JOB_OPTIONS;

  return {
    conversationQueue: new Queue("conversation", { connection, defaultJobOptions }),
    analysisQueue: new Queue("analysis", { connection, defaultJobOptions }),
    schedulerQueue: new Queue("scheduler", { connection, defaultJobOptions }),
    notificationQueue: new Queue("notification", { connection, defaultJobOptions }),
    calendarSyncQueue: new Queue("calendar-sync", { connection, defaultJobOptions }),
    profileSignalsQueue: new Queue("profile-signals", { connection, defaultJobOptions }),
    checkInQueue: new Queue("check-in", { connection, defaultJobOptions }),
  };
}

// ── Redis-backed conversation state store ────────────────
// State is stored as JSON with a 24h TTL via SETEX.
// No manual cleanup needed — Redis handles expiry automatically.
// Survives process restarts and supports horizontal scaling.

const CONVERSATION_TTL_SECONDS = 24 * 60 * 60; // 24 hours
const STATE_KEY_PREFIX = "conv:";

let stateRedis: Redis | null = null;

export function getStateRedis(redisUrl?: string): Redis {
  if (!stateRedis) {
    const url = redisUrl ?? process.env.REDIS_URL ?? "redis://localhost:6379";
    stateRedis = new Redis(url, { maxRetriesPerRequest: null, lazyConnect: true });
    stateRedis.connect().catch((err) => {
      console.error("[StateRedis] Connection failed:", err);
    });
  }
  return stateRedis;
}

export async function getConversationState(conversationId: string): Promise<ConversationState | undefined> {
  const redis = getStateRedis();
  const raw = await redis.get(`${STATE_KEY_PREFIX}${conversationId}`);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as ConversationState;
  } catch {
    // Corrupted state — delete and treat as missing
    await redis.del(`${STATE_KEY_PREFIX}${conversationId}`);
    return undefined;
  }
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

const LOCK_TTL_MS = 60000; // 60s lock timeout (extended by heartbeat)
const LOCK_HEARTBEAT_MS = 15000; // Extend lock every 15s
const LOCK_PREFIX = "lock:conv:";

/**
 * Acquire a Redis lock for a conversation with automatic heartbeat extension.
 * Returns a release function, or null if the lock is already held.
 * The lock auto-extends every 15s to prevent expiry during long-running LLM calls.
 */
export async function acquireConversationLock(
  conversationId: string,
): Promise<(() => Promise<void>) | null> {
  const redis = getStateRedis();
  const lockKey = `${LOCK_PREFIX}${conversationId}`;
  const lockValue = crypto.randomUUID();

  // SET NX PX — atomic acquire with TTL
  const result = await redis.set(lockKey, lockValue, "PX", LOCK_TTL_MS, "NX");
  if (result !== "OK") return null;

  // Heartbeat: extend lock TTL periodically while held
  const heartbeat = setInterval(async () => {
    try {
      // Only extend if we still own the lock
      await redis.eval(
        `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("pexpire", KEYS[1], ARGV[2]) else return 0 end`,
        1,
        lockKey,
        lockValue,
        String(LOCK_TTL_MS),
      );
    } catch {
      // Heartbeat failure is non-fatal — lock will expire naturally
    }
  }, LOCK_HEARTBEAT_MS);

  return async () => {
    clearInterval(heartbeat);
    // Only release if we still own the lock (compare-and-delete via Lua)
    await redis.eval(
      `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`,
      1,
      lockKey,
      lockValue,
    );
  };
}

/** Initialize the state Redis connection (called during server startup). */
export function initStateRedis(redisUrl: string): void {
  getStateRedis(redisUrl);
}

/** Close the state Redis connection (called during graceful shutdown). */
export async function closeStateRedis(): Promise<void> {
  if (stateRedis) {
    await stateRedis.quit();
    stateRedis = null;
  }
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
          const data = initiateJobSchema.parse(job.data);

          const db = getTenantDb(
            data.orgId,
            process.env.DATABASE_URL ?? "",
          );

          const state = await initiateConversation(db, { llm, adapters, analysisQueue: queues.analysisQueue }, {
            orgId: data.orgId,
            reviewerId: data.reviewerId,
            subjectId: data.subjectId,
            interactionType: data.interactionType as InteractionType,
            platform: data.platform as ChatPlatform,
            channelId: data.channelId ?? "",
            questionnaireId: data.questionnaireId,
          });

          // Store conversation state for reply handling
          await setConversationState(state);
          break;
        }

        case "reply": {
          const data = replyJobSchema.parse(job.data);

          // Acquire lock to prevent concurrent state mutations from duplicate webhooks
          const releaseLock = await acquireConversationLock(data.conversationId);
          if (!releaseLock) {
            throw new Error(`Lock held for conversation ${data.conversationId} — will retry`);
          }

          try {
            const state = await getConversationState(data.conversationId);
            if (!state) {
              job.log(`No active state for conversation ${data.conversationId}`);
              return;
            }

            const db = getTenantDb(
              data.orgId,
              process.env.DATABASE_URL ?? "",
            );

            const result = await handleReply(
              db,
              { llm, adapters, analysisQueue: queues.analysisQueue },
              state,
              data.userMessage,
              { truncatedInbound: data.truncated ?? false },
            );

            if (result.closed) {
              await deleteConversationState(data.conversationId);
            } else {
              await setConversationState(result.state);
            }
          } finally {
            await releaseLock();
          }
          break;
        }

        case "close": {
          const data = closeJobSchema.parse(job.data);

          const db = getTenantDb(data.orgId, process.env.DATABASE_URL ?? "");
          await db
            .update(conversations)
            .set({ status: "closed", closedAt: new Date() })
            .where(eq(conversations.id, data.conversationId));

          await queues.analysisQueue.add("analyze", {
            conversationId: data.conversationId,
            orgId: data.orgId,
          });

          await deleteConversationState(data.conversationId);
          break;
        }

        default:
          throw new Error(`Unknown conversation job type: ${type}`);
      }
    },
    { connection, lockDuration: 90_000, lockRenewTime: 30_000 },
  );

  // Analysis worker — runs AI pipeline on closed conversations
  const analysisWorker = new Worker(
    "analysis",
    async (job) => {
      const { conversationId, orgId } = analysisJobSchema.parse(job.data);

      const db = getTenantDb(
        orgId,
        process.env.DATABASE_URL ?? "",
      );

      await runAnalysisPipeline(db, llm, conversationId, console, orgId, queues.profileSignalsQueue, queues.notificationQueue);
    },
    { connection, concurrency: 3, lockDuration: 120_000, lockRenewTime: 40_000 },
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
        process.env.DATABASE_URL ?? "",
      );

      // The connected chat integration decides the platform; the job's
      // platform (SCHEDULER_PLATFORM) is only a local-development fallback.
      const activePlatform = (await getActivePlatform(db)) ?? platform;
      const adapter = adapters.has(activePlatform) ? adapters.get(activePlatform) : undefined;
      const discoverDm =
        activePlatform === "google_chat" && adapter?.findDirectMessage
          ? (userId: string) =>
              discoverGoogleChatDm(db, userId, (ref) => adapter.findDirectMessage!(ref))
          : undefined;

      const result = await runSchedulingPass(
        db,
        queues.conversationQueue,
        orgId,
        activePlatform,
        discoverDm,
      );

      job.log(`Scheduled ${result.scheduled}, skipped ${result.skipped}`);
    },
    { connection, lockDuration: 60_000, lockRenewTime: 20_000 },
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
          const db = getTenantDb(orgId, process.env.DATABASE_URL ?? "");

          const activeUsers = await db
            .select({ id: users.id, email: users.email })
            .from(users)
            .where(and(eq(users.isActive, true), eq(users.onboardingCompleted, true)));

          const weekKey = new Date().toISOString().slice(0, 10);

          await queues.notificationQueue.addBulk(
            activeUsers.map((user) => ({
              name: "weekly_digest",
              data: {
                type: "weekly_digest",
                orgId,
                userId: user.id,
                email: user.email,
              },
              opts: { jobId: buildJobId("weekly-digest", orgId, user.id, weekKey) },
            })),
          );
          job.log(`Dispatched ${activeUsers.length} weekly digest jobs`);

          // Also fan out team-insights generation for each manager
          const managers = await db
            .select({ id: users.id })
            .from(users)
            .where(
              and(
                eq(users.isActive, true),
                eq(users.onboardingCompleted, true),
                eq(users.role, "manager"),
              ),
            );

          if (managers.length > 0) {
            // monthStarting for the just-completed period (previous month on Monday = last month)
            const now = new Date();
            const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const prevMonthStarting = prevMonth.toISOString().slice(0, 10);

            await queues.notificationQueue.addBulk(
              managers.map((m) => ({
                name: "generate_team_insights",
                data: {
                  type: "generate_team_insights",
                  orgId,
                  managerId: m.id,
                  monthStarting: prevMonthStarting,
                },
                opts: { jobId: buildJobId("team-insights", orgId, m.id, prevMonthStarting) },
              })),
            );
            job.log(`Dispatched ${managers.length} team-insights generation jobs`);
          }
          break;
        }

        case "weekly_digest": {
          const data = job.data as {
            orgId: string;
            userId: string;
            email: string;
          };
          const db = getTenantDb(data.orgId, process.env.DATABASE_URL ?? "");

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

          // Gather data for the past week.
          // NOTE: week boundaries are UTC-based (cron fires Monday 09:00
          // UTC and engagement_scores.week_starting is a UTC date). Orgs
          // far from UTC see up to ~half a day of skew — acceptable for
          // a digest; revisit if per-org timezone weeks are ever needed.
          const now = new Date();
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

          const [user] = await db.select().from(users).where(eq(users.id, data.userId));
          if (!user) break;

          const [feedbackReceived, feedbackGiven, kudosRows, engRows, topValueRows] = await Promise.all([
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
            // Highest-scoring core value received by this user in the digest week
            db
              .select({ name: coreValues.name, totalScore: sql<number>`sum(${feedbackValueScores.score})` })
              .from(feedbackValueScores)
              .innerJoin(feedbackEntries, eq(feedbackValueScores.feedbackEntryId, feedbackEntries.id))
              .innerJoin(coreValues, eq(feedbackValueScores.coreValueId, coreValues.id))
              .where(and(eq(feedbackEntries.subjectId, data.userId), gte(feedbackEntries.createdAt, weekAgo)))
              .groupBy(coreValues.id, coreValues.name)
              .orderBy(desc(sql<number>`sum(${feedbackValueScores.score})`))
              .limit(1),
          ]);

          const digestData: WeeklyDigestData = {
            userName: user.name.split(" ")[0],
            weekLabel: weekAgo.toLocaleDateString("en-US", { month: "short", day: "numeric" })
              + " – " + now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
            feedbackReceived: feedbackReceived.length,
            feedbackGiven: feedbackGiven.length,
            engagementScore: engRows[0]?.averageQualityScore ?? 0,
            kudosReceived: kudosRows.length,
            topValue: topValueRows[0]?.name ?? null,
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

          const db = getTenantDb(data.orgId, process.env.DATABASE_URL ?? "");

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

          const db = getTenantDb(data.orgId, process.env.DATABASE_URL ?? "");

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

        case "generate_team_insights": {
          // Generate (or refresh) a feedback_digests row for a manager for the given month.
          // Idempotent: upserts keyed by (managerId, monthStarting).
          const { orgId, managerId, monthStarting } = job.data as {
            orgId: string;
            managerId: string;
            monthStarting: string; // "YYYY-MM-DD" (1st of month)
          };
          const db = getTenantDb(orgId, process.env.DATABASE_URL ?? "");

          const directReports = await db
            .select({ id: users.id, name: users.name, teamId: users.teamId })
            .from(users)
            .where(and(eq(users.managerId, managerId), eq(users.isActive, true)));

          if (directReports.length === 0) {
            job.log(`Manager ${managerId} has no direct reports — skipping team insights`);
            break;
          }

          const reportIds = directReports.map((r) => r.id);

          const monthStart = new Date(monthStarting);
          const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);

          // Previous-month digest for sentiment trend
          const prevMonthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1);
          const prevMonthStarting = prevMonthStart.toISOString().slice(0, 10);

          const [prevDigest] = await db
            .select({ data: feedbackDigests.data })
            .from(feedbackDigests)
            .where(
              and(
                eq(feedbackDigests.managerId, managerId),
                eq(feedbackDigests.monthStarting, prevMonthStarting),
              ),
            );

          const monthEntries = await db
            .select()
            .from(feedbackEntries)
            .where(
              and(
                inArray(feedbackEntries.subjectId, reportIds),
                gte(feedbackEntries.createdAt, monthStart),
                lt(feedbackEntries.createdAt, monthEnd),
              ),
            );

          const entryIds = monthEntries.map((e) => e.id);
          let valueScores: Array<typeof feedbackValueScores.$inferSelect> = [];
          if (entryIds.length > 0) {
            valueScores = await db
              .select()
              .from(feedbackValueScores)
              .where(inArray(feedbackValueScores.feedbackEntryId, entryIds));
          }

          const allValues = await db
            .select()
            .from(coreValues)
            .where(eq(coreValues.isActive, true));
          const valueNameMap = new Map(allValues.map((v) => [v.id, v.name]));

          const prevSentimentByUser = new Map<string, number>();
          if (prevDigest) {
            const prevData = prevDigest.data as { memberSummaries: Array<{ userId: string; avgSentiment: number }> };
            for (const m of prevData.memberSummaries ?? []) {
              prevSentimentByUser.set(m.userId, m.avgSentiment);
            }
          }

          const memberSummaries = directReports.map((report) => {
            const reportEntries = monthEntries.filter((e) => e.subjectId === report.id);
            const feedbackCount = reportEntries.length;
            const sentimentScores = reportEntries.map((e) => {
              if (e.sentiment === "positive") return 1;
              if (e.sentiment === "negative") return 0;
              return 0.5;
            });
            const avgSentiment =
              feedbackCount > 0
                ? sentimentScores.reduce((a: number, b) => a + b, 0) / feedbackCount
                : 0.5;
            const prevSentiment = prevSentimentByUser.get(report.id);
            let sentimentTrend: "improving" | "stable" | "declining" = "stable";
            if (prevSentiment !== undefined) {
              const delta = avgSentiment - prevSentiment;
              if (delta > 0.05) sentimentTrend = "improving";
              else if (delta < -0.05) sentimentTrend = "declining";
            }
            const reportEntryIds = new Set(reportEntries.map((e) => e.id));
            const reportValueScores = valueScores.filter((vs) => reportEntryIds.has(vs.feedbackEntryId));
            const themeCount = new Map<string, number>();
            for (const vs of reportValueScores) {
              const name = valueNameMap.get(vs.coreValueId) ?? "Unknown";
              themeCount.set(name, (themeCount.get(name) ?? 0) + 1);
            }
            const topThemes = [...themeCount.entries()]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([name]) => name);
            const languageQuality =
              feedbackCount > 0
                ? reportEntries.filter((e) => e.hasSpecificExamples).length / feedbackCount
                : 0;
            return {
              userId: report.id,
              name: report.name,
              feedbackCount,
              avgSentiment: Math.round(avgSentiment * 100) / 100,
              sentimentTrend,
              topThemes,
              languageQuality: Math.round(languageQuality * 100) / 100,
            };
          });

          const allMonthSentiments = monthEntries.map((e) => {
            if (e.sentiment === "positive") return 1;
            if (e.sentiment === "negative") return 0;
            return 0.5;
          });
          const overallSentiment =
            allMonthSentiments.length > 0
              ? allMonthSentiments.reduce((a: number, b) => a + b, 0) / allMonthSentiments.length
              : 0.5;
          const reportsWithFeedback = memberSummaries.filter((m) => m.feedbackCount > 0).length;
          const participationRate = directReports.length > 0 ? reportsWithFeedback / directReports.length : 0;

          const themeFrequency: Record<string, number> = {};
          for (const vs of valueScores) {
            const name = valueNameMap.get(vs.coreValueId) ?? "Unknown";
            themeFrequency[name] = (themeFrequency[name] ?? 0) + 1;
          }
          const topValues = Object.entries(themeFrequency)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name]) => name);

          const constructiveCount = monthEntries.filter((e) => e.hasSpecificExamples).length;
          const vague = monthEntries.length - constructiveCount;
          const teamId = directReports[0]?.teamId ?? null;

          const data = {
            memberSummaries,
            teamHealth: {
              overallSentiment: Math.round(overallSentiment * 100) / 100,
              participationRate: Math.round(participationRate * 100) / 100,
              topValues,
              themeFrequency,
              languagePatterns: { constructive: constructiveCount, vague },
            },
            feedbackEntryIds: monthEntries.map((e) => e.id),
          };

          // Upsert keyed by (managerId, monthStarting)
          const [existing] = await db
            .select({ id: feedbackDigests.id })
            .from(feedbackDigests)
            .where(
              and(
                eq(feedbackDigests.managerId, managerId),
                eq(feedbackDigests.monthStarting, monthStarting),
              ),
            );

          if (existing) {
            await db
              .update(feedbackDigests)
              .set({ data, updatedAt: new Date() })
              .where(eq(feedbackDigests.id, existing.id));
            job.log(`Updated team insights for manager ${managerId} / ${monthStarting}`);
          } else {
            await db.insert(feedbackDigests).values({
              teamId,
              managerId,
              monthStarting,
              data,
            });
            job.log(`Created team insights for manager ${managerId} / ${monthStarting}`);
          }
          break;
        }

        case "schedule_nudges": {
          // Dispatcher: find active users behind their weekly interaction target and nudge them
          const { orgId } = job.data as { orgId: string };
          const db = getTenantDb(orgId, process.env.DATABASE_URL ?? "");

          // Current week start (Monday 00:00 UTC)
          const now = new Date();
          const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon…6=Sat
          const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
          const weekStart = new Date(now);
          weekStart.setUTCDate(now.getUTCDate() - daysFromMonday);
          weekStart.setUTCHours(0, 0, 0, 0);
          const weekStartDate = weekStart.toISOString().slice(0, 10);

          // Find active, onboarded users with an engagement row for this week where they are behind target
          const behindUsers = await db
            .select({
              id: users.id,
              name: users.name,
              email: users.email,
              interactionsCompleted: engagementScores.interactionsCompleted,
              interactionsTarget: engagementScores.interactionsTarget,
            })
            .from(users)
            .innerJoin(
              engagementScores,
              and(
                eq(engagementScores.userId, users.id),
                eq(engagementScores.weekStarting, weekStartDate),
              ),
            )
            .where(
              and(
                eq(users.isActive, true),
                eq(users.onboardingCompleted, true),
                sql`${engagementScores.interactionsCompleted} < ${engagementScores.interactionsTarget}`,
              ),
            );

          if (behindUsers.length === 0) {
            job.log("No users behind target this week — skipping nudges");
            break;
          }

          const nudgeDay = now.toISOString().slice(0, 10);

          await queues.notificationQueue.addBulk(
            behindUsers.map((u) => ({
              name: "nudge",
              data: {
                type: "nudge",
                orgId,
                userId: u.id,
                email: u.email,
                userName: u.name,
                interactionsPending: u.interactionsTarget - u.interactionsCompleted,
                targetThisWeek: u.interactionsTarget,
              },
              opts: { jobId: buildJobId("nudge", orgId, u.id, weekStartDate, nudgeDay) },
            })),
          );
          job.log(`Dispatched ${behindUsers.length} nudge jobs`);
          break;
        }

        case "assessment_invite": {
          const data = job.data as {
            orgId: string;
            userId: string;
            email: string;
            userName: string;
            managerName: string;
          };

          const db = getTenantDb(data.orgId, process.env.DATABASE_URL ?? "");

          // Respect the user's preference (type defaults to enabled
          // when no row exists, matching the other notification types)
          const [pref] = await db
            .select()
            .from(notificationPreferences)
            .where(
              and(
                eq(notificationPreferences.userId, data.userId),
                eq(notificationPreferences.type, "assessment_invite"),
              ),
            );
          if (pref && !pref.enabled) {
            job.log(`Assessment invites disabled for user ${data.userId}`);
            break;
          }

          await sendEmail({
            to: data.email,
            subject: `${data.managerName} suggests a quick Revualy assessment`,
            html: assessmentInviteTemplate({
              userName: data.userName.split(" ")[0],
              managerName: data.managerName,
            }),
            unsubscribeUrl: `${process.env.APP_URL ?? "http://localhost:3001"}/settings/notifications`,
          });
          job.log(`Assessment invite sent to ${data.userId}`);
          break;
        }

        default:
          // Unknown/removed job types (e.g. legacy `leaderboard_update` rows
          // enqueued before that feature was dropped) are acknowledged as a
          // no-op rather than thrown, so they don't crash the worker or wedge
          // the queue with permanently-failing jobs.
          job.log(`Ignoring unknown notification job type: ${type}`);
          break;
      }
    },
    { connection, lockDuration: 60_000, lockRenewTime: 20_000 },
  );

  // Calendar sync worker — syncs events for users with connected calendars
  const calendarSyncWorker = new Worker(
    "calendar-sync",
    async (job) => {
      const { orgId } = job.data as { orgId: string };
      const db = getTenantDb(orgId, process.env.DATABASE_URL ?? "");

      // Get all users with calendar tokens
      const tokens = await db
        .select({ userId: calendarTokens.userId })
        .from(calendarTokens)
        .limit(500);

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
    { connection, lockDuration: 120_000, lockRenewTime: 40_000 },
  );

  // Profile signals worker — extracts behavioral signals and aggregates snapshots
  const profileSignalsWorker = new Worker(
    "profile-signals",
    async (job) => {
      const { type } = job.data as { type: string };

      switch (type) {
        case "extract_signals": {
          const { feedbackEntryId, orgId } = job.data as { feedbackEntryId: string; orgId: string };
          const db = getTenantDb(orgId, process.env.DATABASE_URL ?? "");

          const [entry] = await db
            .select()
            .from(feedbackEntries)
            .where(eq(feedbackEntries.id, feedbackEntryId));

          if (!entry) {
            job.log(`Feedback entry ${feedbackEntryId} not found`);
            return;
          }

          const signals = extractProfileSignals({
            text: entry.rawContent,
            sentiment: entry.sentiment,
            wordCount: entry.wordCount,
            hasSpecificExamples: entry.hasSpecificExamples,
            interactionType: entry.interactionType,
          });

          if (signals.length === 0) {
            job.log(`No signals extracted for feedback entry ${feedbackEntryId}`);
            return;
          }

          await db.insert(behavioralSignals).values(
            signals.map((s) => ({
              userId: entry.reviewerId,
              framework: s.framework,
              dimension: s.dimension,
              value: s.value,
              confidence: s.confidence,
              sourceType: entry.interactionType,
              sourceId: entry.id,
            })),
          );

          job.log(`Inserted ${signals.length} signals for user ${entry.reviewerId}`);
          break;
        }

        case "aggregate_behavioral": {
          const { userId, framework, orgId } = job.data as { userId: string; framework: string; orgId: string };
          const db = getTenantDb(orgId, process.env.DATABASE_URL ?? "");

          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

          const conditions = [
            eq(behavioralSignals.userId, userId),
            eq(behavioralSignals.framework, framework),
            gte(behavioralSignals.capturedAt, thirtyDaysAgo),
          ];

          const signals = await db
            .select()
            .from(behavioralSignals)
            .where(and(...conditions));

          if (signals.length === 0) {
            job.log(`No signals for user ${userId} / framework ${framework}`);
            return;
          }

          // Weighted average: value * confidence / sum(confidence) per dimension
          const byDimension = new Map<string, { weightedSum: number; totalWeight: number }>();
          for (const s of signals) {
            const existing = byDimension.get(s.dimension) ?? { weightedSum: 0, totalWeight: 0 };
            existing.weightedSum += s.value * s.confidence;
            existing.totalWeight += s.confidence;
            byDimension.set(s.dimension, existing);
          }

          const dimensions: Record<string, number> = {};
          for (const [dim, agg] of byDimension.entries()) {
            dimensions[dim] = agg.totalWeight > 0 ? agg.weightedSum / agg.totalWeight : 0;
          }

          const periodStart = thirtyDaysAgo.toISOString().slice(0, 10);
          const periodEnd = new Date().toISOString().slice(0, 10);

          // Idempotency: skip if a behavioral snapshot for this user+framework
          // was already created today (no unique constraint exists on the table).
          const today = periodEnd; // same value — end of the 30-day window
          const [existingSnapshot] = await db
            .select({ id: profileSnapshots.id })
            .from(profileSnapshots)
            .where(
              and(
                eq(profileSnapshots.userId, userId),
                eq(profileSnapshots.framework, framework),
                eq(profileSnapshots.source, "behavioral"),
                gte(profileSnapshots.createdAt, new Date(`${today}T00:00:00Z`)),
              ),
            )
            .limit(1);

          if (existingSnapshot) {
            job.log(`Snapshot already exists for user ${userId} / framework ${framework} today — skipping`);
            break;
          }

          await db.insert(profileSnapshots).values({
            userId,
            framework,
            source: "behavioral",
            dimensions,
            signalCount: signals.length,
            periodStart,
            periodEnd,
          });

          job.log(`Aggregated ${signals.length} signals into snapshot for user ${userId}`);
          break;
        }

        case "aggregate_all": {
          const { orgId } = job.data as { orgId: string };
          const db = getTenantDb(orgId, process.env.DATABASE_URL ?? "");

          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

          // Find all distinct userId+framework pairs with signals in the last 30 days
          const rows = await db
            .selectDistinct({
              userId: behavioralSignals.userId,
              framework: behavioralSignals.framework,
            })
            .from(behavioralSignals)
            .where(gte(behavioralSignals.capturedAt, thirtyDaysAgo));

          job.log(`Dispatching aggregate_behavioral for ${rows.length} user/framework pairs`);

          await queues.profileSignalsQueue.addBulk(
            rows.map((r) => ({
              name: "aggregate_behavioral",
              data: { type: "aggregate_behavioral", userId: r.userId, framework: r.framework, orgId },
            })),
          );
          break;
        }

        default:
          throw new Error(`Unknown profile-signals job type: ${type}`);
      }
    },
    { connection, concurrency: 3, lockDuration: 60_000, lockRenewTime: 20_000 },
  );

  // Check-in worker — discovers Meet check-in meetings and turns their
  // transcripts into suggested goal updates (suggest + confirm, never
  // auto-applied)
  const checkInWorker = new Worker(
    "check-in",
    async (job) => {
      const { orgId } = job.data as { orgId: string };
      const db = getTenantDb(orgId, process.env.DATABASE_URL ?? "");

      const result = await runCheckInPipeline(db, llm, {
        log: (msg) => job.log(msg),
      });
      job.log(
        `Check-in run: ${result.discovered} discovered, ${result.processed} processed`,
      );
    },
    { connection, lockDuration: 300_000, lockRenewTime: 60_000 },
  );

  // Attach error listeners to prevent unhandled rejections
  const logWorkerError = (name: string) => (err: Error) => console.error(`[Worker:${name}] Error:`, err);
  conversationWorker.on("error", logWorkerError("conversation"));
  analysisWorker.on("error", logWorkerError("analysis"));
  schedulerWorker.on("error", logWorkerError("scheduler"));
  notificationWorker.on("error", logWorkerError("notification"));
  calendarSyncWorker.on("error", logWorkerError("calendar-sync"));
  profileSignalsWorker.on("error", logWorkerError("profile-signals"));
  checkInWorker.on("error", logWorkerError("check-in"));

  return {
    conversationWorker,
    analysisWorker,
    schedulerWorker,
    notificationWorker,
    calendarSyncWorker,
    profileSignalsWorker,
    checkInWorker,
  };
}
