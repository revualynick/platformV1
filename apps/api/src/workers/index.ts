import { Queue, Worker } from "bullmq";

export interface WorkerConfig {
  redisUrl: string;
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

export function createWorkers(config: WorkerConfig) {
  const connection = parseRedisConnection(config.redisUrl);

  // Conversation worker — handles initiating and managing conversations
  const conversationWorker = new Worker(
    "conversation",
    async (job) => {
      const { type } = job.data as { type: string };
      switch (type) {
        case "initiate":
          // TODO: Create conversation, send opening question via adapter
          break;
        case "follow_up":
          // TODO: Generate and send follow-up question
          break;
        case "close":
          // TODO: Close conversation, enqueue analysis
          break;
      }
    },
    { connection },
  );

  // Analysis worker — runs AI pipeline on closed conversations
  const analysisWorker = new Worker(
    "analysis",
    async (job) => {
      const { conversationId } = job.data as { conversationId: string };
      // TODO Phase 2: Run analysis pipeline
      // - Sentiment analysis
      // - Engagement quality scoring
      // - Core values mapping
      // - Problematic language detection
      // - Embedding generation
      // - AI summary generation
    },
    { connection },
  );

  // Scheduler worker — daily cron for interaction scheduling
  const schedulerWorker = new Worker(
    "scheduler",
    async (job) => {
      // TODO Phase 2: Check each user's weekly schedule
      // - Pick optimal time based on timezone + activity
      // - Select interaction type
      // - Select review subject via Neo4j
      // - Enqueue delayed conversation job
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
